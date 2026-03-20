// LexiCore: Generate + persist AI explanation for Stage 3
// Always returns HTTP 200 + JSON so supabase.functions.invoke can read error details.

import { jsonOk, optionsOk } from "../_shared/http.ts"
import { callClaude } from "../_shared/claude.ts"
import { createServiceClient } from "../_shared/supabase.ts"

interface ExplainRequest {
  user_id?: string
  word_id?: number | string
  word?: string
  sentence?: string
  is_correct?: boolean
}

function normalizeWordId(raw: unknown): string | number | null {
  if (raw == null || raw === "") return null
  const s = String(raw).trim()
  if (!s) return null
  const n = Number(s)
  if (Number.isFinite(n) && String(n) === s) return n
  return s
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsOk()

  try {
    const supabase = createServiceClient()
    const body = (await req.json()) as ExplainRequest
    const userId = (body.user_id ?? "").trim()
    const wordIdRaw = normalizeWordId(body.word_id)
    const word = (body.word ?? "").trim()
    const sentence = (body.sentence ?? "").trim()
    const isCorrect = Boolean(body.is_correct)

    if (!word || !sentence) {
      return jsonOk({ ok: false, saved: false, error: "word and sentence required" }, 200)
    }

    let explanation: string
    try {
      const system = `You are an expert vocabulary teacher. Give clear, thorough explanations like a skilled tutor. For incorrect usage: identify the exact error (e.g. advice vs advise, affect vs effect, wrong part of speech), explain what the word means and why it fails here, give the correct word/form if applicable, and always provide the full corrected sentence. Be direct and educational.`
      const prompt = isCorrect
        ? `The sentence "${sentence}" correctly uses the word "${word}". Explain in 2-4 sentences: (1) what "${word}" means here, (2) why it fits this context, and (3) how the sentence demonstrates proper usage.`
        : `The sentence "${sentence}" incorrectly uses the word "${word}". Explain clearly: (1) Why is it wrong? (e.g. "${word}" is a noun but the sentence needs a verb — use "advise" instead; or wrong meaning/context). (2) What does "${word}" actually mean? (3) What is the correct word or form if it's a common confusion (advice/advise, affect/effect, etc.)? (4) End with: "Therefore, the correct sentence is: [full corrected sentence]"`

      explanation = (await callClaude(prompt, system, 1024))?.trim() || "No explanation available."
    } catch (aiErr) {
      const msg = aiErr instanceof Error ? aiErr.message : String(aiErr)
      return jsonOk({ ok: false, saved: false, error: `AI generation failed: ${msg}` }, 200)
    }

    if (!userId || wordIdRaw == null) {
      return jsonOk({ ok: true, explanation, saved: false, error: "user_id/word_id missing; text only" }, 200)
    }

    const column = isCorrect ? "stage3_explanations_correct" : "stage3_explanations_incorrect"
    const payload = { [column]: [explanation] }

    // Try update with id as number first (bigint/int), then string (UUID or string id).
    async function tryUpdate(idVal: string | number) {
      return await supabase
        .from("vocabulary")
        .update(payload)
        .eq("user_id", userId)
        .eq("id", idVal)
        .select("id")
        .maybeSingle()
    }

    let { data: updated, error: updateError } = await tryUpdate(wordIdRaw)

    if (!updated?.id && typeof wordIdRaw === "string") {
      const n = Number(wordIdRaw)
      if (Number.isFinite(n)) ({ data: updated, error: updateError } = await tryUpdate(n))
    }

    if (updateError) {
      return jsonOk(
        { ok: false, saved: false, error: `DB update failed: ${updateError.message}` },
        200,
      )
    }
    if (!updated?.id) {
      const { data: row } = await supabase
        .from("vocabulary")
        .select("id,user_id")
        .eq("id", wordIdRaw)
        .maybeSingle()
      const hint = row
        ? "Row exists but user_id does not match request (wrong account?)"
        : "No vocabulary row with this id"
      return jsonOk(
        {
          ok: false,
          saved: false,
          error: `No matching vocabulary row updated. ${hint}`,
        },
        200,
      )
    }

    return jsonOk({ ok: true, explanation, saved: true, column }, 200)
  } catch (err) {
    console.error(err)
    const msg = err instanceof Error ? err.message : String(err)
    return jsonOk({ ok: false, saved: false, error: msg }, 200)
  }
})
