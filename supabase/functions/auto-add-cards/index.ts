// LexiCore: Card generation cron (schedule: every hour)
// 1. check_card_jobs_needed: queue add_more_words + add_card_sound + make_card_content jobs per user
// 2. run-card-jobs: drain jobs (Stage 1|2|3 content + audio)

import { createServiceClient } from "../_shared/supabase.ts"
import { invokeEdgeFunction } from "../_shared/edge.ts"
import { jsonErr, jsonOk, optionsOk } from "../_shared/http.ts"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsOk()

  try {
    const supabase = createServiceClient()

    const { data: users } = await supabase.from("user_settings").select("user_id")
    const userIds = (users ?? []).map((r) => r.user_id)

    for (const uid of userIds) {
      try {
        await supabase.rpc("check_card_jobs_needed", { p_user_id: uid })
      } catch (e) {
        console.warn("check_card_jobs_needed for", uid, e?.message ?? e)
      }
    }

    let totalProcessed = 0
    for (let i = 0; i < 30; i++) {
      const data = await invokeEdgeFunction("run-card-jobs", {})
      const processed = data?.processed ?? 0
      totalProcessed += processed
      if (processed === 0) break
    }

    return jsonOk({ users: userIds.length, totalProcessed })
  } catch (err) {
    console.error(err)
    return jsonErr(err, 500)
  }
})
