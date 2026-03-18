// LexiCore: Generate all TTS for a word (word + stage1 defs + stage2 sents + stage3 correct/incorrect)
// Storage: all-lexicore-audio/{word}/word.mp3, stage1_0.mp3, stage2_0.mp3, etc.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

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
  _userId: string,
  _wordId: number,
  word: string,
  stage: number,
  index: number,
  subType?: string
): string {
  const safe = sanitizeWord(word)
  if (stage === 0) return `all-lexicore-audio/${safe}/word.mp3`
  const suffix = subType ? `_${subType}_${index}` : `_${index}`
  return `all-lexicore-audio/${safe}/stage${stage}${suffix}.mp3`
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  if (!OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY not set" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }

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

    const defs = (vocab.stage1_definitions ?? []) as { definition?: string }[]
    const sents = (vocab.stage2_sentences ?? []) as { sentence?: string }[]
    const correct = (vocab.stage3_correct ?? []) as string[]
    const incorrect = (vocab.stage3_incorrect ?? []) as string[]

    let generated = 0
    let audioWordUrl: string | null = null
    const audioStage1: string[] = []
    const audioStage2: string[] = []
    const audioStage3Correct: string[] = []
    const audioStage3Incorrect: string[] = []

    // 1. Word pronunciation
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
      generated++
      await sleep(300)
    }

    // 2. Stage1 definitions
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
      generated++
      await sleep(300)
    }
    while (audioStage1.length < defs.length) audioStage1.push("")

    // 3. Stage2 sentences
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
      generated++
      await sleep(300)
    }
    while (audioStage2.length < sents.length) audioStage2.push("")

    // 4. Stage3 correct
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
      generated++
      await sleep(300)
    }
    while (audioStage3Correct.length < correct.length) audioStage3Correct.push("")

    // 5. Stage3 incorrect
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
      generated++
      await sleep(300)
    }
    while (audioStage3Incorrect.length < incorrect.length) audioStage3Incorrect.push("")

    // Single update with all audio
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
      JSON.stringify({ generated, word_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("generate-all-tts-for-word error:", msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
