// LexiCore: AI explanation for Stage 3 True/False sentences

import { corsHeaders } from "../_shared/cors.ts"

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!

interface ExplainRequest {
  word: string
  sentence: string
  is_correct: boolean
}

async function generateWithClaude(
  prompt: string,
  system: string,
  maxTokens = 256
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Claude API error: ${await res.text()}`)
  const data = await res.json()
  return (data.content?.[0]?.text ?? "").trim()
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const body = (await req.json()) as ExplainRequest
    const { word, sentence, is_correct } = body

    if (!word || !sentence) {
      return new Response(
        JSON.stringify({ error: "word and sentence required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const system = `You are a vocabulary teacher. Give a brief, clear explanation in 1-2 sentences.`
    const prompt = is_correct
      ? `The sentence "${sentence}" correctly uses the word "${word}". Explain in 1-2 short sentences why this usage is correct.`
      : `The sentence "${sentence}" incorrectly uses the word "${word}". Explain in 1-2 short sentences why this usage is wrong and what the correct meaning is.`

    const explanation = await generateWithClaude(prompt, system)

    return new Response(
      JSON.stringify({ explanation: explanation || "No explanation available." }),
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
