// LexiCore: Process card generation jobs
// Job types: add_more_words | make_card_content | add_card_sound
// Invoked by: auto-add-cards

import { createServiceClient } from "../_shared/supabase.ts"
import { invokeEdgeFunction } from "../_shared/edge.ts"
import { jsonErr, jsonOk, optionsOk } from "../_shared/http.ts"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsOk()

  try {
    const supabase = createServiceClient()

    let userId: string | null = null
    try {
      const body = await req.json().catch(() => ({}))
      userId = body?.user_id ?? null
    } catch {
      // ignore
    }

    await supabase.rpc("reset_stuck_card_jobs")

    const { data: jobs, error: claimErr } = await supabase.rpc("claim_card_jobs", {
      p_limit: 6,
      p_user_id: userId,
    })

    if (claimErr) throw claimErr
    if (!jobs?.length) return jsonOk({ processed: 0 })

    let processed = 0
    for (const job of jobs) {
      try {
        if (job.job_type === "add_more_words") {
          await invokeEdgeFunction("make-card-content", {
            user_id: job.user_id,
            job_type: "add_more_words",
            count: job.payload?.count ?? 20,
          })
        } else if (job.job_type === "make_card_content") {
          await invokeEdgeFunction("make-card-content", {
            user_id: job.user_id,
            job_type: "make_card_content",
            word_id: job.payload?.word_id,
            word: job.payload?.word,
            stage: job.payload?.stage,
          })
        } else if (job.job_type === "add_card_sound") {
          await invokeEdgeFunction("add-card-sound", {
            user_id: job.user_id,
            word_id: job.payload?.word_id,
            word: job.payload?.word,
          })
        } else {
          throw new Error(`Unknown job_type: ${job.job_type}`)
        }

        await supabase.rpc("complete_card_job", { p_job_id: job.id })
        processed++
      } catch (e) {
        console.error("Job failed:", job.id, e)
        await supabase.rpc("fail_card_job", { p_job_id: job.id })
      }
    }

    return jsonOk({ processed })
  } catch (err) {
    console.error(err)
    return jsonErr(err, 500)
  }
})
