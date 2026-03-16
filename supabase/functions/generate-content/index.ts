// LexiCore: AI Content Generation (Claude 3.5 Sonnet)
// Generates stage-specific content for vocabulary words

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const FALLBACK_WORDS = [
  "about", "above", "across", "action", "activity", "actor", "add", "address",
  "advice", "afraid", "again", "age", "agree", "air", "also", "always", "amazing",
  "animal", "another", "answer", "anything", "apartment", "apple", "area", "arm",
  "around", "arrive", "art", "ask", "aunt", "autumn", "away", "baby", "bad", "bag",
  "ball", "banana", "band", "bank", "bar", "base", "basic", "bath", "bathroom", "bear",
  "beat", "beautiful", "because", "become", "bed", "bedroom", "beer", "before",
]
import { corsHeaders } from "../_shared/cors.ts"

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!

interface GenerateRequest {
  user_id: string
  job_type: "reservoir" | "stage_content"
  word_id?: number
  word?: string
  stage?: 1 | 2 | 3
  count?: number
}

async function generateWithClaude(
  prompt: string,
  system: string,
  maxTokens = 1024
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514", // or claude-3-5-sonnet-20241022
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Claude API error: ${await res.text()}`)
  const data = await res.json()
  return data.content?.[0]?.text ?? ""
}

async function generateStage1Definitions(word: string): Promise<{ definition: string; is_correct: boolean }[]> {
  const system = `You are a vocabulary learning content generator. Output valid JSON only, no markdown.`
  const prompt = `Generate 5 multiple-choice definitions for the English word "${word}".
Return a JSON array of objects: [{"definition":"...","is_correct":true/false}]
Exactly ONE must have "is_correct":true (the real definition). The rest are plausible distractors.`
  const text = await generateWithClaude(prompt, system)
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error("Invalid JSON from Claude")
  return JSON.parse(match[0])
}

async function generateStage2Sentences(word: string): Promise<{ sentence: string; meaning: string }[]> {
  const system = `You are a vocabulary learning content generator. Output valid JSON only, no markdown.`
  const prompt = `Generate 5 gap-fill example sentences for the English word "${word}".
Each sentence must contain exactly "___" where the word goes.
Return a JSON array: [{"sentence":"...","meaning":"..."}]`
  const text = await generateWithClaude(prompt, system)
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error("Invalid JSON from Claude")
  return JSON.parse(match[0])
}

async function generateStage3Sentences(word: string): Promise<{ correct: string[]; incorrect: string[] }> {
  const system = `You are a vocabulary learning content generator. Output valid JSON only, no markdown.`
  const prompt = `Generate 5 CORRECT and 5 INCORRECT usage sentences for the English word "${word}".
Correct = word used properly. Incorrect = word used wrongly (wrong meaning/context).
Return JSON: {"correct":["sentence1",...],"incorrect":["sentence1",...]}`
  const text = await generateWithClaude(prompt, system)
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("Invalid JSON from Claude")
  return JSON.parse(match[0])
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const body = (await req.json()) as GenerateRequest
    const { user_id, job_type, word_id, word, stage, count = 20 } = body

    if (!user_id || !job_type) {
      return new Response(
        JSON.stringify({ error: "user_id and job_type required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (job_type === "reservoir") {
      // Refill waiting reservoir with new words
      let { data: bank } = await supabase
        .from("word_bank")
        .select("word")
        .limit(5000)

      if (!bank?.length) {
        bank = FALLBACK_WORDS.map((w) => ({ word: w }))
      }

      const existing = await supabase
        .from("vocabulary")
        .select("word")
        .eq("user_id", user_id)

      const existingSet = new Set((existing.data ?? []).map((r) => r.word.toLowerCase()))
      const available = (bank ?? []).filter((r) => !existingSet.has(r.word.toLowerCase())).slice(0, count)

      for (const row of available) {
        const defs = await generateStage1Definitions(row.word)
        const s2 = await generateStage2Sentences(row.word)
        const s3 = await generateStage3Sentences(row.word)

        await supabase.from("vocabulary").insert({
          user_id,
          word: row.word,
          status: "waiting",
          stage1_definitions: defs,
          stage2_sentences: s2,
          stage3_correct: s3.correct,
          stage3_incorrect: s3.incorrect,
        })
      }

      return new Response(
        JSON.stringify({ added: available.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (job_type === "stage_content" && word_id && word && stage) {
      // Refill content for a specific stage
      const { data: vocab } = await supabase
        .from("vocabulary")
        .select("*")
        .eq("id", word_id)
        .eq("user_id", user_id)
        .single()

      if (!vocab) throw new Error("Word not found")

      let updates: Record<string, unknown> = {}

      if (stage === 1) {
        const defs = await generateStage1Definitions(word)
        updates.stage1_definitions = [...(vocab.stage1_definitions ?? []), ...defs]
      } else if (stage === 2) {
        const s2 = await generateStage2Sentences(word)
        updates.stage2_sentences = [...(vocab.stage2_sentences ?? []), ...s2]
      } else if (stage === 3) {
        const s3 = await generateStage3Sentences(word)
        updates.stage3_correct = [...(vocab.stage3_correct ?? []), ...s3.correct]
        updates.stage3_incorrect = [...(vocab.stage3_incorrect ?? []), ...s3.incorrect]
      }

      await supabase.from("vocabulary").update(updates).eq("id", word_id).eq("user_id", user_id)

      return new Response(
        JSON.stringify({ updated: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({ error: "Invalid request" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error(err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
