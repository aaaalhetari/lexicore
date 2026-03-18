// LexiCore: Process refill jobs (reservoir, stage content, audio)
// Invoked by cron or manually to drain refill_jobs

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

const FUNCTIONS_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1`
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

async function invokeFunction(name: string, body: object) {
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Function ${name} error: ${await res.text()}`)
  return res.json()
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    let userId: string | null = null
    try {
      const body = await req.json().catch(() => ({}))
      userId = body?.user_id ?? null
    } catch {
      // ignore
    }

    // Reset jobs stuck in "processing" (from timed-out runs)
    await supabase.from("refill_jobs").update({ status: "pending" }).eq("status", "processing")

    // Retry failed jobs after 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    await supabase
      .from("refill_jobs")
      .update({ status: "pending" })
      .eq("status", "failed")
      .lt("processed_at", oneHourAgo)

    // When user_id provided: prioritize this user's reservoir job first (for "Add words" flow)
    let jobs: { id: number; user_id: string; job_type: string; payload: Record<string, unknown> }[] = []
    if (userId) {
      const { data: userReservoir } = await supabase
        .from("refill_jobs")
        .select("*")
        .eq("status", "pending")
        .eq("job_type", "reservoir")
        .eq("user_id", userId)
        .limit(1)
      if (userReservoir?.length) {
        jobs = userReservoir
      }
    }

    if (!jobs.length) {
      // Default: tts_content > stage_content > audio > reservoir; process up to 6 per call
      const { data: ttsJobs } = await supabase
        .from("refill_jobs")
        .select("*")
        .eq("status", "pending")
        .eq("job_type", "tts_content")
        .limit(4)
      const { data: otherJobs } = await supabase
        .from("refill_jobs")
        .select("*")
        .eq("status", "pending")
        .neq("job_type", "tts_content")
        .order("job_type", { ascending: true })
        .limit(4)
      jobs = [...(ttsJobs ?? []), ...(otherJobs ?? [])].slice(0, 6)
    }

    if (!jobs?.length) {
      return new Response(
        JSON.stringify({ processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    let processed = 0
    for (const job of jobs) {
      await supabase
        .from("refill_jobs")
        .update({ status: "processing" })
        .eq("id", job.id)

      try {
        if (job.job_type === "reservoir") {
          await invokeFunction("generate-content", {
            user_id: job.user_id,
            job_type: "reservoir",
            count: job.payload?.count ?? 20,
          })
        } else if (job.job_type === "stage_content") {
          await invokeFunction("generate-content", {
            user_id: job.user_id,
            job_type: "stage_content",
            word_id: job.payload?.word_id,
            word: job.payload?.word,
            stage: job.payload?.stage,
          })
        } else if (job.job_type === "audio") {
          await invokeFunction("generate-audio", {
            user_id: job.user_id,
            word_id: job.payload?.word_id,
            word: job.payload?.word,
          })
        } else if (job.job_type === "tts_content") {
          await invokeFunction("generate-all-tts-for-word", {
            user_id: job.user_id,
            word_id: job.payload?.word_id,
            word: job.payload?.word,
          })
        }

        await supabase
          .from("refill_jobs")
          .update({ status: "done", processed_at: new Date().toISOString() })
          .eq("id", job.id)
        processed++
      } catch (e) {
        console.error("Job failed:", job.id, e)
        await supabase
          .from("refill_jobs")
          .update({ status: "failed", processed_at: new Date().toISOString() })
          .eq("id", job.id)
      }
    }

    return new Response(
      JSON.stringify({ processed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error(err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
