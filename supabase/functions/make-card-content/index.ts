// LexiCore: Card content generation (Claude)
// Stage 1: definitions | Stage 2: gap-fill sentences | Stage 3: correct/incorrect usage

import { createServiceClient } from "../_shared/supabase.ts"
import { invokeEdgeFunction } from "../_shared/edge.ts"
import { jsonErr, jsonOk, optionsOk } from "../_shared/http.ts"
import { callClaude, extractJsonArray, extractJsonObject } from "../_shared/claude.ts"

const FALLBACK_WORDS = [
  "about", "above", "across", "action", "activity", "actor", "add", "address",
  "advice", "afraid", "again", "age", "agree", "air", "also", "always", "amazing",
  "animal", "another", "answer", "anything", "apartment", "apple", "area", "arm",
  "around", "arrive", "art", "ask", "aunt", "autumn", "away", "baby", "bad", "bag",
  "ball", "banana", "band", "bank", "bar", "base", "basic", "bath", "bathroom", "bear",
  "beat", "beautiful", "because", "become", "bed", "bedroom", "beer", "before",
]

const CONTENT_SYSTEM = `You are a vocabulary learning content generator. Output valid JSON only, no markdown.`

interface GenerateRequest {
  user_id: string
  job_type: "add_more_words" | "make_card_content" | "make_full_card" | "explain_sentence"
  word_id?: number
  word?: string
  stage?: 1 | 2 | 3
  count?: number
  sentence?: string
  is_correct?: boolean
}

async function generateStage1Definitions(word: string) {
  const prompt = `Generate 5 different accurate definitions for the English word "${word}".
Each definition must be correct but worded differently (e.g. formal, simple, contextual, synonym-based, descriptive).
Return a JSON array: [{"definition":"...","is_correct":true}]
All 5 must have "is_correct":true. No wrong definitions.`
  return extractJsonArray(await callClaude(prompt, CONTENT_SYSTEM)) as {
    definition: string
    is_correct: boolean
  }[]
}

async function generateStage2Sentences(word: string) {
  const prompt = `Generate 5 gap-fill example sentences for the English word "${word}".
Each sentence must contain exactly "___" where the word goes.
Return a JSON array: [{"sentence":"...","meaning":"..."}]`
  return extractJsonArray(await callClaude(prompt, CONTENT_SYSTEM)) as {
    sentence: string
    meaning: string
  }[]
}

async function generateStage3Sentences(word: string) {
  const prompt = `Generate 5 CORRECT and 5 INCORRECT usage sentences for the English word "${word}".
Correct = word used properly. Incorrect = word used wrongly (wrong meaning, grammar, part of speech, or confusion with similar words like advice/advise, affect/effect).
For EACH incorrect sentence, the explanation MUST: (1) state why it's wrong (e.g. "${word}" is a noun but a verb is needed — use "advise"), (2) give the correct word/form if applicable, (3) end with "Therefore, the correct sentence is: [corrected sentence]".
For correct sentences: explain what the word means and why it fits.
Return JSON: {"correct":["s1",...],"incorrect":["s1",...],"explanations_correct":["expl1",...],"explanations_incorrect":["expl1",...]}`
  const parsed = extractJsonObject(await callClaude(prompt, CONTENT_SYSTEM, 2048))
  return {
    correct: (parsed.correct ?? []) as string[],
    incorrect: (parsed.incorrect ?? []) as string[],
    explanations_correct: (parsed.explanations_correct ?? []) as string[],
    explanations_incorrect: (parsed.explanations_incorrect ?? []) as string[],
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsOk()

  try {
    const supabase = createServiceClient()
    const body = (await req.json()) as GenerateRequest
    const { user_id, job_type, word_id, word, stage, count = 20, sentence, is_correct } = body

    if (!job_type) return jsonErr("job_type required", 400)

    if (job_type === "explain_sentence") {
      const data = await invokeEdgeFunction("explain-card-sentence", {
        user_id, word, sentence, is_correct,
      })
      return jsonOk(data)
    }

    if (!user_id) return jsonErr("user_id required", 400)

    // ── add_more_words ──────────────────────────────────────────
    if (job_type === "add_more_words") {
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
      if (waiting >= reservoir) return jsonOk({ added: 0, skipped: "waiting >= reservoir" })

      const toAdd = Math.min(count ?? 20, Math.max(0, reservoir - waiting))

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
            job_type: "add_card_sound",
            payload: { word_id: id, word: w },
          })
        } catch (e) {
          console.warn("add_card_sound job insert skipped:", e)
        }
      }

      return jsonOk({ added: inserted.length })
    }

    // ── make_full_card ──────────────────────────────────────────
    if (job_type === "make_full_card" && word_id && word) {
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

      await invokeEdgeFunction("add-card-sound", { user_id, word_id, word })
      return jsonOk({ updated: true, audio: true })
    }

    // ── make_card_content (single stage) ────────────────────────
    if (job_type === "make_card_content" && word_id && word && stage) {
      const { data: vocab } = await supabase
        .from("vocabulary")
        .select("*")
        .eq("id", word_id)
        .eq("user_id", user_id)
        .single()

      if (!vocab) throw new Error("Word not found")

      let updates: Record<string, unknown> = {}

      if (stage === 1) {
        updates.stage1_definitions = await generateStage1Definitions(word)
      } else if (stage === 2) {
        updates.stage2_sentences = await generateStage2Sentences(word)
      } else if (stage === 3) {
        const s3 = await generateStage3Sentences(word)
        updates.stage3_correct = s3.correct
        updates.stage3_incorrect = s3.incorrect
      }

      await supabase.from("vocabulary").update(updates).eq("id", word_id).eq("user_id", user_id)
      await invokeEdgeFunction("add-card-sound", { user_id, word_id, word })
      return jsonOk({ updated: true, audio: true })
    }

    return jsonErr("Invalid request", 400)
  } catch (err) {
    console.error(err)
    return jsonErr(err, 500)
  }
})
