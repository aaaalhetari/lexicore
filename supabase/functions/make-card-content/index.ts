// LexiCore: Card content generation (Claude)
// Stage 1: definitions | Stage 2: gap-fill sentences | Stage 3: correct/incorrect usage

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
const FUNCTIONS_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1`
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

async function invokeGenerateAllTTS(
  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
  userId: string,
  wordId: number,
  word: string
) {
  try {
    await supabase.from("card_jobs").insert({
      user_id: userId,
      job_type: "add_card_sound",
      payload: { word_id: wordId, word },
    })
  } catch (e) {
    console.warn("add_card_sound job insert skipped:", e)
  }
}

/** Invoke generate-all-tts-for-word and await — couples audio with text in same flow */
async function invokeGenerateAllTTSAndWait(userId: string, wordId: number, word: string): Promise<void> {
  try {
    const res = await fetch(`${FUNCTIONS_URL}/add-card-sound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({ user_id: userId, word_id: wordId, word }),
    })
    if (!res.ok) {
      const text = await res.text()
      console.warn("add-card-sound failed:", text)
    }
  } catch (e) {
    console.warn("add-card-sound invoke error:", e)
  }
}

/** Request body: job_type (B1-friendly)
 * add_more_words | make_card_content | make_full_card | explain_sentence */
interface GenerateRequest {
  user_id: string
  job_type: "add_more_words" | "make_card_content" | "make_full_card" | "explain_sentence"
  word_id?: number
  word?: string
  stage?: 1 | 2 | 3 // 1=definition, 2=gap-fill, 3=usage judgment
  count?: number
  sentence?: string
  is_correct?: boolean
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

/** Stage 1: Definition — multiple choice */
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

/** Stage 2: Gap-fill — sentences with ___ */
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

/** Stage 3: Usage judgment — correct vs incorrect sentences */
async function generateStage3Sentences(word: string): Promise<{
  correct: string[]
  incorrect: string[]
  explanations_correct: string[]
  explanations_incorrect: string[]
}> {
  const system = `You are a vocabulary learning content generator. Output valid JSON only, no markdown.`
  const prompt = `Generate 5 CORRECT and 5 INCORRECT usage sentences for the English word "${word}".
Correct = word used properly. Incorrect = word used wrongly (wrong meaning, grammar, part of speech, or confusion with similar words like advice/advise, affect/effect).
For EACH incorrect sentence, the explanation MUST: (1) state why it's wrong (e.g. "${word}" is a noun but a verb is needed — use "advise"), (2) give the correct word/form if applicable, (3) end with "Therefore, the correct sentence is: [corrected sentence]".
For correct sentences: explain what the word means and why it fits.
Return JSON: {"correct":["s1",...],"incorrect":["s1",...],"explanations_correct":["expl1",...],"explanations_incorrect":["expl1",...]}`
  const text = await generateWithClaude(prompt, system, 2048)
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("Invalid JSON from Claude")
  const parsed = JSON.parse(match[0])
  return {
    correct: parsed.correct ?? [],
    incorrect: parsed.incorrect ?? [],
    explanations_correct: parsed.explanations_correct ?? [],
    explanations_incorrect: parsed.explanations_incorrect ?? [],
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const body = (await req.json()) as GenerateRequest
    const { user_id, job_type, word_id, word, stage, count = 20, sentence, is_correct } = body

    if (!job_type) {
      return new Response(
        JSON.stringify({ error: "job_type required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (job_type === "explain_sentence" && word && sentence) {
      const system = `You are an expert vocabulary teacher. Give clear, thorough explanations like a skilled tutor. For incorrect usage: identify the exact error (e.g. advice vs advise, affect vs effect, wrong part of speech), explain what the word means and why it fails here, give the correct word/form if applicable, and always provide the full corrected sentence. Be direct and educational.`
      const prompt = is_correct
        ? `The sentence "${sentence}" correctly uses the word "${word}". Explain in 2-4 sentences: (1) what "${word}" means here, (2) why it fits this context, and (3) how the sentence demonstrates proper usage.`
        : `The sentence "${sentence}" incorrectly uses the word "${word}". Explain clearly: (1) Why is it wrong? (e.g. "${word}" is a noun but the sentence needs a verb — use "advise" instead; or wrong meaning/context). (2) What does "${word}" actually mean? (3) What is the correct word or form if it's a common confusion (advice/advise, affect/effect, etc.)? (4) End with: "Therefore, the correct sentence is: [full corrected sentence]"`
      const explanation = await generateWithClaude(prompt, system, 1024)
      return new Response(
        JSON.stringify({ explanation: explanation?.trim() || "No explanation available." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (job_type === "add_more_words") {
      // Expand waiting pool — only when waiting < reservoir
      const { count: waitingCount } = await supabase
        .from("vocabulary")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("status", "waiting")

      const { data: settings } = await supabase
        .from("user_settings")
        .select("waiting_target")
        .eq("user_id", user_id)
        .single()

      const reservoir = settings?.waiting_target ?? 50
      const waiting = waitingCount ?? 0
      if (waiting >= reservoir) {
        return new Response(
          JSON.stringify({ added: 0, skipped: "waiting >= reservoir" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      const toAdd = Math.min(count ?? 20, Math.max(0, reservoir - waiting))

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
      const available = (bank ?? []).filter((r) => !existingSet.has(r.word.toLowerCase())).slice(0, toAdd)

      const inserted: { id: number; word: string }[] = []
      for (const row of available) {
        const defs = await generateStage1Definitions(row.word)
        const s2 = await generateStage2Sentences(row.word)
        const s3 = await generateStage3Sentences(row.word)

        const { data: ins } = await supabase
          .from("vocabulary")
          .insert({
            user_id,
            word: row.word,
            status: "waiting",
            stage1_definitions: defs,
            stage2_sentences: s2,
            stage3_correct: s3.correct,
            stage3_incorrect: s3.incorrect,
            stage3_explanations_correct: [],
            stage3_explanations_incorrect: [],
          })
          .select("id")
          .single()
        if (ins?.id) inserted.push({ id: ins.id, word: row.word })
      }

      for (const { id, word } of inserted) {
        invokeGenerateAllTTS(supabase, user_id, id, word)
      }

      return new Response(
        JSON.stringify({ added: inserted.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (job_type === "make_full_card" && word_id && word) {
      // Full card: all stages content + audio once (card button)
      const { data: vocab } = await supabase
        .from("vocabulary")
        .select("id")
        .eq("id", word_id)
        .eq("user_id", user_id)
        .single()

      if (!vocab) throw new Error("Word not found")

      const defs = await generateStage1Definitions(word)
      const s2 = await generateStage2Sentences(word)
      const s3 = await generateStage3Sentences(word)

      await supabase
        .from("vocabulary")
        .update({
          stage1_definitions: defs,
          stage2_sentences: s2,
          stage3_correct: s3.correct,
          stage3_incorrect: s3.incorrect,
          stage3_explanations_correct: [],
          stage3_explanations_incorrect: [],
        })
        .eq("id", word_id)
        .eq("user_id", user_id)

      await invokeGenerateAllTTSAndWait(user_id, word_id, word)

      return new Response(
        JSON.stringify({ updated: true, audio: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (job_type === "make_card_content" && word_id && word && stage) {
      // Card stage content: 1=definitions, 2=gap-fill, 3=correct/incorrect (used by process-refill)
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
        updates.stage1_definitions = defs
      } else if (stage === 2) {
        const s2 = await generateStage2Sentences(word)
        updates.stage2_sentences = s2
      } else if (stage === 3) {
        const s3 = await generateStage3Sentences(word)
        updates.stage3_correct = s3.correct
        updates.stage3_incorrect = s3.incorrect
      }

      await supabase.from("vocabulary").update(updates).eq("id", word_id).eq("user_id", user_id)

      await invokeGenerateAllTTSAndWait(user_id, word_id, word)

      return new Response(
        JSON.stringify({ updated: true, audio: true }),
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
