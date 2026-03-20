// LexiCore: Card content generation (Claude).
// Stage 3 sentence explanation: explain-card-sentence only (see src/store/data.js).

import { createServiceClient } from "../_shared/supabase.ts"
import { jsonErr, jsonOk, optionsOk } from "../_shared/http.ts"
import { routeMakeCardContent } from "./handlers.ts"
import type { MakeCardContentRequest } from "./types.ts"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsOk()

  try {
    const supabase = createServiceClient()
    const body = (await req.json()) as MakeCardContentRequest
    const { job_type, user_id } = body

    if (!job_type) return jsonErr("job_type required", 400)
    if (!user_id) return jsonErr("user_id required", 400)

    const payload = await routeMakeCardContent(supabase, body)
    return jsonOk(payload)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === "Invalid request") return jsonErr("Invalid request", 400)
    console.error(err)
    return jsonErr(err, 500)
  }
})
