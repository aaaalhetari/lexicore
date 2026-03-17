// LexiCore: One-time complete all vocabulary - create jobs for incomplete words
// Creates stage_content + tts_content jobs so process-refill can complete everything

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

function isPlaceholderDef(def: string, word: string): boolean {
  const s = (def ?? "").trim()
  return !s || s.startsWith("Definition for") || s === `Definition for "${word}"`
}

function isPlaceholderSent(sent: string): boolean {
  const s = (sent ?? "").trim()
  return !s || s === "Use ___ in context."
}

function isPlaceholderS3(arr: string[], word: string): boolean {
  if (!arr?.length) return true
  const first = (arr[0] ?? "").trim()
  return !first || first === `Is "${word}" used correctly?`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    let userId: string | null = null
    try {
      const body = (await req.json()) as { user_id?: string }
      userId = body?.user_id ?? null
    } catch {
      /* no body */
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    let query = supabase
      .from("vocabulary")
      .select("id, user_id, word, stage1_definitions, stage2_sentences, stage3_correct, stage3_incorrect, audio_word, audio_stage1_definitions")
      .order("id")
    if (userId) query = query.eq("user_id", userId)
    const { data: vocab } = await query

    if (!vocab?.length) {
      return new Response(
        JSON.stringify({ stage_content: 0, tts_content: 0, message: "No vocabulary" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const { data: existingJobs } = await supabase
      .from("refill_jobs")
      .select("id, user_id, job_type, payload, status")
      .in("status", ["pending", "processing"])

    const jobKey = (uid: string, type: string, wordId: number, stage?: number) =>
      stage != null ? `${uid}:${type}:${wordId}:${stage}` : `${uid}:${type}:${wordId}`

    const existing = new Set(
      (existingJobs ?? [])
        .filter((j) => j.job_type === "stage_content" || j.job_type === "tts_content")
        .map((j) =>
          j.job_type === "stage_content"
            ? jobKey(j.user_id, j.job_type, Number(j.payload?.word_id), Number(j.payload?.stage))
            : jobKey(j.user_id, j.job_type, Number(j.payload?.word_id))
        )
    )

    let stageContentJobs = 0
    let ttsContentJobs = 0

    for (const v of vocab) {
      const defs = (v.stage1_definitions ?? []) as { definition?: string; is_correct?: boolean }[]
      const correctDef = defs.find((d) => d.is_correct)
      const defText = (correctDef?.definition ?? "").trim()
      const s2 = (v.stage2_sentences ?? []) as { sentence?: string }[]
      const firstSent = s2[0]?.sentence ?? ""
      const s3Correct = (v.stage3_correct ?? []) as string[]
      const s3Incorrect = (v.stage3_incorrect ?? []) as string[]

      const needsStage1 = defs.length === 0 || isPlaceholderDef(defText, v.word)
      const needsStage2 = s2.length === 0 || isPlaceholderSent(firstSent)
      const needsStage3 = isPlaceholderS3(s3Correct, v.word) || isPlaceholderS3(s3Incorrect, v.word)

      const needsContent = needsStage1 || needsStage2 || needsStage3
      const hasContent = defs.length > 0 && !needsStage1
      const needsAudio =
        !v.audio_word ||
        (Array.isArray(v.audio_stage1_definitions) ? (v.audio_stage1_definitions as string[]).every((x) => !x) : true)

      if (needsContent) {
        for (const stage of [1, 2, 3] as const) {
          const needStage = (stage === 1 && needsStage1) || (stage === 2 && needsStage2) || (stage === 3 && needsStage3)
          if (!needStage) continue
          const key = jobKey(v.user_id, "stage_content", v.id, stage)
          if (existing.has(key)) continue
          existing.add(key)
          await supabase.from("refill_jobs").insert({
            user_id: v.user_id,
            job_type: "stage_content",
            payload: { word_id: v.id, word: v.word, stage },
          })
          stageContentJobs++
        }
      } else if (hasContent && needsAudio) {
        const key = jobKey(v.user_id, "tts_content", v.id)
        if (existing.has(key)) continue
        existing.add(key)
        await supabase.from("refill_jobs").insert({
          user_id: v.user_id,
          job_type: "tts_content",
          payload: { word_id: v.id, word: v.word },
        })
        ttsContentJobs++
      }
    }

    return new Response(
      JSON.stringify({
        stage_content: stageContentJobs,
        tts_content: ttsContentJobs,
        message: `Created ${stageContentJobs} stage_content + ${ttsContentJobs} tts_content jobs. Run "Generate content from cloud" to process.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("complete-vocabulary error:", msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
