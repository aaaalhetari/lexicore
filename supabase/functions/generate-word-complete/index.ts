// LexiCore: Generate complete content + audio for one word (card button)
// stage1_definitions, stage2_sentences, stage3_correct/incorrect, all audio columns

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")

function sanitizeWord(word: string): string {
  return (word ?? "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "word"
}

async function generateWithClaude(prompt: string, system: string, maxTokens = 1024): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set")
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
Correct = word used properly. Incorrect = word used wrongly (wrong meaning, grammar, part of speech, or confusion with similar words like advice/advise, affect/effect).
Return JSON: {"correct":["s1",...],"incorrect":["s1",...]}`
  const text = await generateWithClaude(prompt, system, 2048)
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("Invalid JSON from Claude")
  const parsed = JSON.parse(match[0])
  return {
    correct: parsed.correct ?? [],
    incorrect: parsed.incorrect ?? [],
  }
}

async function generateTTS(text: string): Promise<ArrayBuffer> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set")
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "tts-1-hd",
      input: text,
      voice: "alloy",
    }),
  })
  if (!res.ok) throw new Error(`OpenAI TTS error: ${await res.text()}`)
  return res.arrayBuffer()
}

function getStoragePath(
  userId: string,
  wordId: number,
  word: string,
  stage: number,
  index: number,
  subType?: string
): string {
  const safe = sanitizeWord(word)
  if (stage === 0) return `all-lexicore-audio/${userId}/${wordId}-${safe}/word.mp3`
  const suffix = subType ? `_${subType}_${index}` : `_${index}`
  return `all-lexicore-audio/${userId}/${wordId}-${safe}/stage${stage}${suffix}.mp3`
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

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
    const body = (await req.json()) as { user_id: string; word_id: number; word: string }
    const { user_id, word_id, word } = body
    if (!user_id || !word_id || !word) {
      return new Response(
        JSON.stringify({ error: "user_id, word_id, word required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const { data: vocab, error: vocabErr } = await supabase
      .from("vocabulary")
      .select("stage1_definitions, stage2_sentences, stage3_correct, stage3_incorrect")
      .eq("id", word_id)
      .eq("user_id", user_id)
      .single()

    if (vocabErr || !vocab) throw new Error("Word not found")

    let defs = (vocab.stage1_definitions ?? []) as { definition?: string; is_correct?: boolean }[]
    let sents = (vocab.stage2_sentences ?? []) as { sentence?: string; meaning?: string }[]
    let correct = (vocab.stage3_correct ?? []) as string[]
    let incorrect = (vocab.stage3_incorrect ?? []) as string[]

    const correctDef = defs.find((d) => d.is_correct)
    const defText = (correctDef?.definition ?? "").trim()
    const firstSent = sents[0]?.sentence ?? ""
    const needsContent =
      isPlaceholderDef(defText, word) ||
      defs.length === 0 ||
      isPlaceholderSent(firstSent) ||
      sents.length === 0 ||
      isPlaceholderS3(correct, word) ||
      isPlaceholderS3(incorrect, word)

    if (needsContent) {
      defs = await generateStage1Definitions(word)
      sents = await generateStage2Sentences(word)
      const s3 = await generateStage3Sentences(word)
      correct = s3.correct
      incorrect = s3.incorrect
      await supabase
        .from("vocabulary")
        .update({
          stage1_definitions: defs,
          stage2_sentences: sents,
          stage3_correct: correct,
          stage3_incorrect: incorrect,
          stage3_explanations_correct: [],
          stage3_explanations_incorrect: [],
        })
        .eq("id", word_id)
        .eq("user_id", user_id)
    }

    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ ok: true, content_updated: needsContent, audio_skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    let audioWordUrl: string | null = null
    const audioStage1: string[] = []
    const audioStage2: string[] = []
    const audioStage3Correct: string[] = []
    const audioStage3Incorrect: string[] = []

    const wordText = (word ?? "").trim()
    if (wordText) {
      const buf = await generateTTS(wordText)
      const path = getStoragePath(user_id, word_id, word, 0, 0)
      await supabase.storage.from("lexicore-audio").upload(path, buf, {
        contentType: "audio/mpeg",
        upsert: true,
      })
      const { data: urlData } = supabase.storage.from("lexicore-audio").getPublicUrl(path)
      audioWordUrl = urlData.publicUrl
      await sleep(300)
    }

    for (let i = 0; i < defs.length; i++) {
      const text = (defs[i]?.definition ?? "").trim()
      if (!text) {
        audioStage1.push("")
        continue
      }
      const buf = await generateTTS(text)
      const path = getStoragePath(user_id, word_id, word, 1, i)
      await supabase.storage.from("lexicore-audio").upload(path, buf, {
        contentType: "audio/mpeg",
        upsert: true,
      })
      const { data: urlData } = supabase.storage.from("lexicore-audio").getPublicUrl(path)
      audioStage1.push(urlData.publicUrl)
      await sleep(300)
    }
    while (audioStage1.length < defs.length) audioStage1.push("")

    for (let i = 0; i < sents.length; i++) {
      const text = (sents[i]?.sentence ?? "").trim()
      if (!text) {
        audioStage2.push("")
        continue
      }
      const buf = await generateTTS(text)
      const path = getStoragePath(user_id, word_id, word, 2, i)
      await supabase.storage.from("lexicore-audio").upload(path, buf, {
        contentType: "audio/mpeg",
        upsert: true,
      })
      const { data: urlData } = supabase.storage.from("lexicore-audio").getPublicUrl(path)
      audioStage2.push(urlData.publicUrl)
      await sleep(300)
    }
    while (audioStage2.length < sents.length) audioStage2.push("")

    for (let i = 0; i < correct.length; i++) {
      const text = (correct[i] ?? "").trim()
      if (!text) {
        audioStage3Correct.push("")
        continue
      }
      const buf = await generateTTS(text)
      const path = getStoragePath(user_id, word_id, word, 3, i, "correct")
      await supabase.storage.from("lexicore-audio").upload(path, buf, {
        contentType: "audio/mpeg",
        upsert: true,
      })
      const { data: urlData } = supabase.storage.from("lexicore-audio").getPublicUrl(path)
      audioStage3Correct.push(urlData.publicUrl)
      await sleep(300)
    }
    while (audioStage3Correct.length < correct.length) audioStage3Correct.push("")

    for (let i = 0; i < incorrect.length; i++) {
      const text = (incorrect[i] ?? "").trim()
      if (!text) {
        audioStage3Incorrect.push("")
        continue
      }
      const buf = await generateTTS(text)
      const path = getStoragePath(user_id, word_id, word, 3, i, "incorrect")
      await supabase.storage.from("lexicore-audio").upload(path, buf, {
        contentType: "audio/mpeg",
        upsert: true,
      })
      const { data: urlData } = supabase.storage.from("lexicore-audio").getPublicUrl(path)
      audioStage3Incorrect.push(urlData.publicUrl)
      await sleep(300)
    }
    while (audioStage3Incorrect.length < incorrect.length) audioStage3Incorrect.push("")

    const updates: Record<string, unknown> = {}
    if (audioWordUrl) updates.audio_word = audioWordUrl
    if (audioStage1.length) updates.audio_stage1_definitions = audioStage1
    if (audioStage2.length) updates.audio_stage2_sentences = audioStage2
    if (audioStage3Correct.length) updates.audio_stage3_correct = audioStage3Correct
    if (audioStage3Incorrect.length) updates.audio_stage3_incorrect = audioStage3Incorrect
    if (Object.keys(updates).length) {
      await supabase.from("vocabulary").update(updates).eq("id", word_id).eq("user_id", user_id)
    }

    return new Response(
      JSON.stringify({ ok: true, content_updated: needsContent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("generate-word-complete error:", msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
