// DB + orchestration for make-card-content (invokes add-card-sound when needed).

import { createServiceClient } from "../_shared/supabase.ts"
import { invokeEdgeFunction } from "../_shared/edge.ts"
import {
  JOB_ADD_CARD_SOUND,
  JOB_ADD_MORE_WORDS,
  JOB_MAKE_CARD_CONTENT,
  JOB_MAKE_FULL_CARD,
} from "../_shared/stages.ts"
import {
  FALLBACK_WORDS,
  generateStage1Definitions,
  generateStage2Sentences,
  generateStage3Sentences,
} from "./prompts.ts"
import type { MakeCardContentRequest } from "./types.ts"

type Db = ReturnType<typeof createServiceClient>

export async function routeMakeCardContent(
  supabase: Db,
  body: MakeCardContentRequest,
): Promise<Record<string, unknown>> {
  const { user_id, job_type, word_id, word, stage, count = 20 } = body

  if (job_type === JOB_ADD_MORE_WORDS) {
    return handleAddMoreWords(supabase, user_id, count)
  }
  if (job_type === JOB_MAKE_FULL_CARD && word_id && word) {
    return handleMakeFullCard(supabase, user_id, word_id, word)
  }
  if (job_type === JOB_MAKE_CARD_CONTENT && word_id && word && stage) {
    return handleMakeCardContentStage(supabase, user_id, word_id, word, stage)
  }

  throw new Error("Invalid request")
}

async function handleAddMoreWords(supabase: Db, user_id: string, count: number) {
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

  const waitingTarget = settings?.waiting_target ?? 50
  const waiting = waitingCount ?? 0
  if (waiting >= waitingTarget) return { added: 0, skipped: "waiting >= waiting_target" }

  const toAdd = Math.min(count ?? 20, Math.max(0, waitingTarget - waiting))

  let { data: bank } = await supabase.from("word_bank").select("word").limit(5000)
  if (!bank?.length) bank = FALLBACK_WORDS.map((w) => ({ word: w }))

  const existing = await supabase.from("vocabulary").select("word").eq("user_id", user_id)
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

  for (const { id, word: w } of inserted) {
    try {
      await supabase.from("card_jobs").insert({
        user_id,
        job_type: JOB_ADD_CARD_SOUND,
        payload: { word_id: id, word: w },
      })
    } catch (e) {
      console.warn("add_card_sound job insert skipped:", e)
    }
  }

  return { added: inserted.length }
}

async function handleMakeFullCard(supabase: Db, user_id: string, word_id: number, word: string) {
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
      audio_word: null,
      audio_stage1_definitions: [],
      audio_stage2_sentences: [],
      audio_stage3_correct: [],
      audio_stage3_incorrect: [],
    })
    .eq("id", word_id)
    .eq("user_id", user_id)

  await invokeEdgeFunction("add-card-sound", { user_id, word_id, word })
  return { updated: true, audio: true }
}

async function handleMakeCardContentStage(
  supabase: Db,
  user_id: string,
  word_id: number,
  word: string,
  stage: 1 | 2 | 3,
) {
  const { data: vocab, error } = await supabase
    .from("vocabulary")
    .select("*")
    .eq("id", word_id)
    .eq("user_id", user_id)
    .single()

  if (error || !vocab) throw new Error("Word not found")

  let updates: Record<string, unknown> = {}

  if (stage === 1) {
    updates.stage1_definitions = await generateStage1Definitions(word)
    updates.audio_stage1_definitions = []
  } else if (stage === 2) {
    updates.stage2_sentences = await generateStage2Sentences(word)
    updates.audio_stage2_sentences = []
  } else {
    const s3 = await generateStage3Sentences(word)
    updates.stage3_correct = s3.correct
    updates.stage3_incorrect = s3.incorrect
    updates.audio_stage3_correct = []
    updates.audio_stage3_incorrect = []
  }

  await supabase.from("vocabulary").update(updates).eq("id", word_id).eq("user_id", user_id)
  await invokeEdgeFunction("add-card-sound", { user_id, word_id, word })
  return { updated: true, audio: true }
}
