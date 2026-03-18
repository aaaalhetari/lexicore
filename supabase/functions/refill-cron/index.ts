// LexiCore: Server-side refill trigger for cron
// 1. Call check_refill_needed for all users (queues reservoir + tts_content jobs)
// 2. Invoke process-refill until no more jobs
// Schedule via cron-job.org or similar: every hour

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

const FUNCTIONS_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1`
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const { data: users } = await supabase.from("user_settings").select("user_id")
    const userIds = (users ?? []).map((r) => r.user_id)

    for (const uid of userIds) {
      try {
        await supabase.rpc("check_refill_needed", { p_user_id: uid })
      } catch (e) {
        console.warn("check_refill_needed for", uid, e?.message ?? e)
      }
    }

    let totalProcessed = 0
    for (let i = 0; i < 30; i++) {
      const res = await fetch(`${FUNCTIONS_URL}/process-refill`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      const processed = data?.processed ?? 0
      totalProcessed += processed
      if (processed === 0) break
    }

    return new Response(
      JSON.stringify({ users: userIds.length, totalProcessed }),
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
