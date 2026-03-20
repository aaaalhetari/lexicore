// Claude prompts + stage generators (card text only — no DB).

import { callClaude, extractJsonArray, extractJsonObject } from "../_shared/claude.ts"

export const FALLBACK_WORDS = [
  "about", "above", "across", "action", "activity", "actor", "add", "address",
  "advice", "afraid", "again", "age", "agree", "air", "also", "always", "amazing",
  "animal", "another", "answer", "anything", "apartment", "apple", "area", "arm",
  "around", "arrive", "art", "ask", "aunt", "autumn", "away", "baby", "bad", "bag",
  "ball", "banana", "band", "bank", "bar", "base", "basic", "bath", "bathroom", "bear",
  "beat", "beautiful", "because", "become", "bed", "bedroom", "beer", "before",
] as const

const CONTENT_SYSTEM = `You are a vocabulary learning content generator. Output valid JSON only, no markdown.`

export async function generateStage1Definitions(word: string) {
  const prompt = `Generate 5 different accurate definitions for the English word "${word}".
Each definition must be correct but worded differently (e.g. formal, simple, contextual, synonym-based, descriptive).
Return a JSON array: [{"definition":"...","is_correct":true}]
All 5 must have "is_correct":true. No wrong definitions.`
  return extractJsonArray(await callClaude(prompt, CONTENT_SYSTEM)) as {
    definition: string
    is_correct: boolean
  }[]
}

export async function generateStage2Sentences(word: string) {
  const prompt = `Generate 5 gap-fill example sentences for the English word "${word}".
Each sentence must contain exactly "___" where the word goes.
Return a JSON array: [{"sentence":"...","meaning":"..."}]`
  return extractJsonArray(await callClaude(prompt, CONTENT_SYSTEM)) as {
    sentence: string
    meaning: string
  }[]
}

export async function generateStage3Sentences(word: string) {
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
