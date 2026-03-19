// LexiCore: Process card generation jobs
// Job types: add_more_words | make_card_content | add_card_sound
// Invoked by: auto-add-cards

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
    await supabase.from("card_jobs").update({ status: "pending" }).eq("status", "processing")

    // Retry failed jobs after 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    await supabase
      .from("card_jobs")
      .update({ status: "pending" })
      .eq("status", "failed")
      .lt("processed_at", oneHourAgo)

    // Priority: user_id ? (add_more_words, add_card_sound) : (add_card_sound, make_card_content, add_more_words)
    let jobs: { id: number; user_id: string; job_type: string; payload: Record<string, unknown> }[] = []
    if (userId) {
      const { data: userReservoir } = await supabase
        .from("card_jobs")
        .select("*")
        .eq("status", "pending")
        .eq("job_type", "add_more_words")
        .eq("user_id", userId)
        .limit(1)
      const { data: userTts } = await supabase
        .from("card_jobs")
        .select("*")
        .eq("status", "pending")
        .eq("job_type", "add_card_sound")
        .eq("user_id", userId)
        .limit(5)
      jobs = [...(userReservoir ?? []), ...(userTts ?? [])].slice(0, 6)
    }

    if (!jobs.length) {
      const { data: ttsJobs } = await supabase
        .from("card_jobs")
        .select("*")
        .eq("status", "pending")
        .eq("job_type", "add_card_sound")
        .limit(4)
      const { data: otherJobs } = await supabase
        .from("card_jobs")
        .select("*")
        .eq("status", "pending")
        .neq("job_type", "add_card_sound")
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
        .from("card_jobs")
        .update({ status: "processing" })
        .eq("id", job.id)

      try {
        if (job.job_type === "add_more_words") {
          await invokeFunction("make-card-content", {
            user_id: job.user_id,
            job_type: "add_more_words",
            count: job.payload?.count ?? 20,
          })
        } else if (job.job_type === "make_card_content") {
          await invokeFunction("make-card-content", {
            user_id: job.user_id,
            job_type: "make_card_content",
            word_id: job.payload?.word_id,
            word: job.payload?.word,
            stage: job.payload?.stage,
          })
        } else if (job.job_type === "add_card_sound") {
          await invokeFunction("add-card-sound", {
            user_id: job.user_id,
            word_id: job.payload?.word_id,
            word: job.payload?.word,
          })
        } else {
          throw new Error(`Unknown job_type (expected add_more_words|make_card_content|add_card_sound): ${job.job_type}`)
        }

        await supabase
          .from("card_jobs")
          .update({ status: "done", processed_at: new Date().toISOString() })
          .eq("id", job.id)
        processed++
      } catch (e) {
        console.error("Job failed:", job.id, e)
        await supabase
          .from("card_jobs")
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
