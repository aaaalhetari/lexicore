// LexiCore: Card audio — batch only (word + Stage 1+2+3)
// { user_id, word_id, word } -> full card audio, update vocabulary
// Skips OpenAI TTS for slots that already have a stored URL (idempotent jobs / already complete).

import { createServiceClient } from "../_shared/supabase.ts"
import { jsonErr, jsonOk, optionsOk } from "../_shared/http.ts"
import { callOpenAITTS } from "../_shared/tts.ts"

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

function isNonEmptyUrl(v: unknown): boolean {
  if (typeof v !== "string") return false
  const s = v.trim()
  return s.length > 8 && /^https?:\/\//i.test(s)
}

async function generateTTS(text: string): Promise<ArrayBuffer> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set")
  return callOpenAITTS(text, OPENAI_API_KEY)
}

function getStoragePath(word: string, stage: number, index: number, subType?: string): string {
  const safe = sanitizeWord(word)
  if (stage === 0) return `all-lexicore-audio/${safe}/word.mp3`
  const suffix = subType ? `_${subType}_${index}` : `_${index}`
  return `all-lexicore-audio/${safe}/stage${stage}${suffix}.mp3`
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

const VOCAB_SELECT =
  "id, word, stage1_definitions, stage2_sentences, stage3_correct, stage3_incorrect, audio_word, audio_stage1_definitions, audio_stage2_sentences, audio_stage3_correct, audio_stage3_incorrect"

type VocabRow = {
  id: number
  word: string
  stage1_definitions: unknown
  stage2_sentences: unknown
  stage3_correct: unknown
  stage3_incorrect: unknown
  audio_word: unknown
  audio_stage1_definitions: unknown
  audio_stage2_sentences: unknown
  audio_stage3_correct: unknown
  audio_stage3_incorrect: unknown
}

/** Resolve row by (user_id, word_id); if missing, match same user + payload word (stale id / reinsert). */
async function loadVocabularyRow(
  supabase: ReturnType<typeof createServiceClient>,
  user_id: string,
  word_id: number,
  word: string,
): Promise<VocabRow> {
  const { data: byId, error: errId } = await supabase
    .from("vocabulary")
    .select(VOCAB_SELECT)
    .eq("id", word_id)
    .eq("user_id", user_id)
    .maybeSingle()

  if (byId && !errId) return byId as VocabRow

  const w = (word ?? "").trim()
  if (!w) {
    throw new Error("Word not found")
  }

  const { data: rows, error: errWord } = await supabase
    .from("vocabulary")
    .select(VOCAB_SELECT)
    .eq("user_id", user_id)
    .ilike("word", w)
    .order("id", { ascending: true })
    .limit(2)

  if (errWord) throw new Error(`Word not found: ${errWord.message}`)
  if (!rows?.length) throw new Error("Word not found")
  if (rows.length > 1) {
    throw new Error("Ambiguous word: multiple vocabulary rows for this user")
  }
  return rows[0] as VocabRow
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsOk()

  if (!OPENAI_API_KEY) return jsonErr("OPENAI_API_KEY not set", 500)

  try {
    const body = (await req.json()) as { user_id?: string; word_id?: number | string; word?: string }
    const { user_id, word } = body
    const word_id =
      typeof body.word_id === "string" ? parseInt(body.word_id, 10) : body.word_id
    if (!user_id || word_id == null || Number.isNaN(word_id) || !word) {
      return jsonErr("user_id, word_id, word required", 400)
    }

    const supabase = createServiceClient()
    const vocab = await loadVocabularyRow(supabase, user_id, word_id, word)
    const resolvedId = vocab.id
    const wordForPaths = (vocab.word ?? word).trim() || word.trim()

    const defs = (vocab.stage1_definitions ?? []) as { definition?: string }[]
    const sents = (vocab.stage2_sentences ?? []) as { sentence?: string }[]
    const correct = (vocab.stage3_correct ?? []) as string[]
    const incorrect = (vocab.stage3_incorrect ?? []) as string[]

    const existingWordUrl = vocab.audio_word
    const ex1 = (vocab.audio_stage1_definitions ?? []) as unknown[]
    const ex2 = (vocab.audio_stage2_sentences ?? []) as unknown[]
    const ex3c = (vocab.audio_stage3_correct ?? []) as unknown[]
    const ex3i = (vocab.audio_stage3_incorrect ?? []) as unknown[]

    const wordText = (word ?? "").trim()

    let needTts = false
    if (wordText && !isNonEmptyUrl(existingWordUrl)) needTts = true
    for (let i = 0; i < defs.length; i++) {
      const text = (defs[i]?.definition ?? "").trim()
      if (text && !isNonEmptyUrl(ex1[i])) needTts = true
    }
    for (let i = 0; i < sents.length; i++) {
      const text = (sents[i]?.sentence ?? "").trim()
      if (text && !isNonEmptyUrl(ex2[i])) needTts = true
    }
    for (let i = 0; i < correct.length; i++) {
      const text = (correct[i] ?? "").trim()
      if (text && !isNonEmptyUrl(ex3c[i])) needTts = true
    }
    for (let i = 0; i < incorrect.length; i++) {
      const text = (incorrect[i] ?? "").trim()
      if (text && !isNonEmptyUrl(ex3i[i])) needTts = true
    }

    if (!needTts) {
      return jsonOk({ generated: 0, skipped: "audio_complete", word_id: resolvedId })
    }

    let generated = 0
    let audioWordUrl: string | null = isNonEmptyUrl(existingWordUrl)
      ? String(existingWordUrl).trim()
      : null
    const audioStage1: string[] = []
    const audioStage2: string[] = []
    const audioStage3Correct: string[] = []
    const audioStage3Incorrect: string[] = []

    // 1. Word pronunciation
    if (wordText) {
      if (audioWordUrl) {
        /* reused */
      } else {
        const buf = await generateTTS(wordText)
        const path = getStoragePath(wordForPaths, 0, 0)
        await supabase.storage.from("lexicore-audio").upload(path, buf, {
          contentType: "audio/mpeg",
          upsert: true,
        })
        const { data: urlData } = supabase.storage.from("lexicore-audio").getPublicUrl(path)
        audioWordUrl = urlData.publicUrl
        generated++
        await sleep(300)
      }
    }

    // 2. Stage1 definitions
    for (let i = 0; i < defs.length; i++) {
      const text = (defs[i]?.definition ?? "").trim()
      if (!text) {
        audioStage1.push("")
        continue
      }
      if (isNonEmptyUrl(ex1[i])) {
        audioStage1.push(String(ex1[i]).trim())
        continue
      }
      const buf = await generateTTS(text)
      const path = getStoragePath(wordForPaths, 1, i)
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
      if (isNonEmptyUrl(ex2[i])) {
        audioStage2.push(String(ex2[i]).trim())
        continue
      }
      const buf = await generateTTS(text)
      const path = getStoragePath(wordForPaths, 2, i)
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
      if (isNonEmptyUrl(ex3c[i])) {
        audioStage3Correct.push(String(ex3c[i]).trim())
        continue
      }
      const buf = await generateTTS(text)
      const path = getStoragePath(wordForPaths, 3, i, "correct")
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
      if (isNonEmptyUrl(ex3i[i])) {
        audioStage3Incorrect.push(String(ex3i[i]).trim())
        continue
      }
      const buf = await generateTTS(text)
      const path = getStoragePath(wordForPaths, 3, i, "incorrect")
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

    // Single update with all audio (only when we produced new clips or need to persist reused arrays)
    const updates: Record<string, unknown> = {}
    if (audioWordUrl) updates.audio_word = audioWordUrl
    if (audioStage1.length) updates.audio_stage1_definitions = audioStage1
    if (audioStage2.length) updates.audio_stage2_sentences = audioStage2
    if (audioStage3Correct.length) updates.audio_stage3_correct = audioStage3Correct
    if (audioStage3Incorrect.length) updates.audio_stage3_incorrect = audioStage3Incorrect
    if (Object.keys(updates).length) {
      await supabase.from("vocabulary").update(updates).eq("id", resolvedId).eq("user_id", user_id)
    }

    return jsonOk({
      generated,
      word_id: resolvedId,
      resolved_from_payload_word: resolvedId !== word_id,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("add-card-sound error:", msg)
    return jsonErr(msg, 500)
  }
})
