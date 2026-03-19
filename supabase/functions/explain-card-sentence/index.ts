// LexiCore: Generate AI explanation for Stage 3 sentence usage
// Request: { user_id?, word, sentence, is_correct? }

import { jsonErr, jsonOk, optionsOk } from "../_shared/http.ts"
import { callClaude } from "../_shared/claude.ts"

interface ExplainRequest {
  user_id?: string
  word?: string
  sentence?: string
  is_correct?: boolean
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsOk()

  try {
    const body = (await req.json()) as ExplainRequest
    const word = (body.word ?? "").trim()
    const sentence = (body.sentence ?? "").trim()
    const isCorrect = Boolean(body.is_correct)

    if (!word || !sentence) return jsonErr("word and sentence required", 400)

    const system = `You are an expert vocabulary teacher. Give clear, thorough explanations like a skilled tutor. For incorrect usage: identify the exact error (e.g. advice vs advise, affect vs effect, wrong part of speech), explain what the word means and why it fails here, give the correct word/form if applicable, and always provide the full corrected sentence. Be direct and educational.`
    const prompt = isCorrect
      ? `The sentence "${sentence}" correctly uses the word "${word}". Explain in 2-4 sentences: (1) what "${word}" means here, (2) why it fits this context, and (3) how the sentence demonstrates proper usage.`
      : `The sentence "${sentence}" incorrectly uses the word "${word}". Explain clearly: (1) Why is it wrong? (e.g. "${word}" is a noun but the sentence needs a verb — use "advise" instead; or wrong meaning/context). (2) What does "${word}" actually mean? (3) What is the correct word or form if it's a common confusion (advice/advise, affect/effect, etc.)? (4) End with: "Therefore, the correct sentence is: [full corrected sentence]"`

    const explanation = await callClaude(prompt, system, 1024)
    return jsonOk({ explanation: explanation?.trim() || "No explanation available." })
  } catch (err) {
    console.error(err)
    return jsonErr(err, 500)
  }
})
