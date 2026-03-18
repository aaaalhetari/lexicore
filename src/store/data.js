/**
 * LexiCore v2: Lightweight data layer - all writes go to backend
 * Reads come from realtime store (realtime.js)
 */

import { supabase, hasSupabase } from '../lib/supabase.js'
import {
  getWords,
  getWordById,
  getSettings as getRealtimeSettings,
  getStats as getRealtimeStats,
  refetchWord,
  today,
} from './realtime.js'

export { today }

export function getData() {
  return { words: getWords(), settings: getRealtimeSettings() }
}

export function getSettings() {
  return getRealtimeSettings()
}

export function getStats() {
  return getRealtimeStats()
}

/** Submit answer to backend - triggers Realtime update */
export async function submitAnswer(wordId, isCorrect) {
  if (!hasSupabase()) throw new Error('Supabase required')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase.rpc('submit_answer', {
    p_user_id: user.id,
    p_word_id: wordId,
    p_correct: isCorrect,
  })
  if (error) throw error
  return data
}

/** Get active pool from backend (count from user_settings.new_words_per_session, stage-aware) */
export async function getActivePool() {
  if (!hasSupabase()) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase.rpc('get_active_pool', {
    p_user_id: user.id,
  })
  if (error) throw error
  return data ?? []
}

/** Record session stats */
export async function recordSession(answered, correct) {
  if (!hasSupabase()) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const todayStr = today()
  await supabase.from('sessions').upsert(
    {
      user_id: user.id,
      date: todayStr,
      answered,
      correct,
    },
    { onConflict: 'user_id,date' }
  )
}

/** Update user settings */
export async function updateSettings(settings) {
  if (!hasSupabase()) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const wordsPerSession = Number(settings.new_words_per_session) || 50
  const newWordsPerDay = Number(settings.new_words_per_day) || 25
  const reservoirVal = Number(settings.reservoir) || 50

  const stats = getStats()
  const minNewWords = Math.max(1, stats.newWordsInLearningToday ?? 0)
  if (newWordsPerDay < minNewWords) {
    throw new Error(`New words per day cannot be less than ${minNewWords} (words in learning today)`)
  }
  if (newWordsPerDay > reservoirVal) {
    throw new Error(`New words per day cannot exceed ${reservoirVal} (reservoir)`)
  }

  const { data: result, error } = await supabase.rpc('update_settings_with_trim', {
    p_user_id: user.id,
    p_new_words_per_session: wordsPerSession,
    p_new_words_per_day: newWordsPerDay,
    p_reservoir: reservoirVal,
    p_cycle_1: settings.cycle_1,
    p_cycle_2: settings.cycle_2,
    p_cycle_3: settings.cycle_3,
  })
  if (error) throw error
  if (result?.ok === false) {
    throw new Error(result?.message ?? `Minimum is ${result?.min_allowed ?? minNewWords}`)
  }
  const { refetchSettings } = await import('./realtime.js')
  await refetchSettings(user.id)
}

/** Ensure schema has new_words_per_day and reservoir columns (call on app init) */
export async function ensureSchema() {
  if (!hasSupabase()) return
  try {
    await supabase.rpc('ensure_user_settings_columns')
  } catch (e) {
    console.warn('ensureSchema:', e?.message ?? e)
  }
}

/** Refresh settings from DB (call when opening Settings to get latest) */
export async function refreshSettings() {
  if (!hasSupabase()) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { refetchSettings } = await import('./realtime.js')
  await refetchSettings(user.id)
}

/** Assign daily quota: waiting -> new_word (call on app init for fast start) */
export async function assignDailyQuota(userId) {
  if (!hasSupabase() || !userId) return
  try {
    await supabase.rpc('assign_daily_quota', { p_user_id: userId })
  } catch (e) {
    console.warn('assignDailyQuota:', e?.message ?? e)
  }
}

/** Trigger reservoir refill check (backend queues job) */
export async function checkRefillNeeded() {
  if (!hasSupabase()) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.rpc('check_refill_needed', { p_user_id: user.id })
}

/** Invoke process-refill Edge Function (for cron or manual). Pass userId to prioritize this user's reservoir job. */
export async function processRefillJobs(userId = null) {
  if (!hasSupabase()) return null
  const body = userId ? { user_id: userId } : {}
  const { data, error } = await supabase.functions.invoke('process-refill', { body })
  if (error) throw error
  return data
}

/** Migrate audio from old path (wordId-word) to new (word). Run once. See docs/MIGRATE_AUDIO.md */
export async function migrateAudioStructure() {
  if (!hasSupabase()) throw new Error('Supabase required')
  const { data, error } = await supabase.functions.invoke('migrate-audio-structure', { body: {} })
  if (error) throw error
  return data
}

/** Generate complete content + audio for one word (card button)
 * Primary: generate-content stage_content x3 (established path, uses refill for TTS)
 * Fallback: generate-word-complete (all-in-one if available) */
export async function generateWordComplete(userId, wordId, word) {
  if (!hasSupabase()) throw new Error('Supabase required')
  const wid = Number(wordId)
  const w = (word ?? '').trim()
  if (!wid || !w) throw new Error('word_id and word required')

  // Primary: generate-content stage_content (stage 1, 2, 3)
  for (const stage of [1, 2, 3]) {
    const { data, error } = await supabase.functions.invoke('generate-content', {
      body: { user_id: userId, job_type: 'stage_content', word_id: wid, word: w, stage },
    })
    if (error) {
      const msg = data?.error ?? error?.message ?? String(error)
      throw new Error(`Stage ${stage}: ${msg}`)
    }
    if (data?.error) throw new Error(data.error)
  }
  return { ok: true, content_updated: true }
}

/** Get AI explanation for Stage 3 (fallback when not in DB) */
export async function explainSentence(userId, word, sentence, isCorrect) {
  if (!hasSupabase()) return null
  const { data, error } = await supabase.functions.invoke('generate-content', {
    body: {
      user_id: userId || '',
      job_type: 'explain_sentence',
      word,
      sentence,
      is_correct: isCorrect,
    },
  })
  if (error) {
    const msg = data?.error ?? error?.message ?? String(error)
    throw new Error(msg)
  }
  return data?.explanation ?? null
}

const _ttsCache = new Map()
const _ttsPending = new Map()

/** Preload TTS for a word's question content (call early to speed up playback) */
export function preloadTTS(word) {
  if (!hasSupabase() || !word) return
  const stage = word.stage ?? 1
  let text = ''
  if (stage === 1) {
    const defs = word.stage1_definitions ?? []
    const correct = defs.find((d) => d.is_correct)
    text = (correct?.definition ?? word.definition ?? '').trim() || `Definition for "${word.word ?? ''}"`
  } else if (stage === 2) {
    const s2 = word.stage2_sentences ?? []
    const first = s2[0]
    text = (first?.sentence ?? word.example ?? '').trim() || `Use ___ in context.`
  } else if (stage === 3) {
    const arr1 = word.stage3_correct ?? []
    const arr2 = word.stage3_incorrect ?? []
    const t1 = (arr1[0] ?? word.s3_correct ?? '').trim()
    const t2 = (arr2[0] ?? word.s3_wrong ?? '').trim()
    const fallback = `Is "${word.word ?? ''}" used correctly?`
    if (t1) generateTTS(t1).catch(() => {})
    if (t2 && t2 !== t1) generateTTS(t2).catch(() => {})
    if (!t1 && !t2) generateTTS(fallback).catch(() => {})
    return
  }
  if (text) generateTTS(text).catch(() => {})
}

/** Generate AI TTS for any text (definitions, sentences) */
export async function generateTTS(text, retries = 2) {
  if (!hasSupabase()) return null
  const clean = (text || '').trim()
  if (!clean) return null
  const cached = _ttsCache.get(clean)
  if (cached) return cached
  const pending = _ttsPending.get(clean)
  if (pending) return pending
  const promise = (async () => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const { data, error } = await supabase.functions.invoke('generate-tts', {
        body: { text: clean },
      })
      if (!error && data?.url) {
        _ttsCache.set(clean, data.url)
        return data.url
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
      } else if (error) {
        const msg = data?.error ?? error?.message ?? String(error)
        throw new Error(msg)
      }
    }
    return null
  })()
  _ttsPending.set(clean, promise)
  try {
    return await promise
  } finally {
    _ttsPending.delete(clean)
  }
}

/** Export current progress as JSON (from realtime store) */
export function downloadJSON() {
  const words = getWords()
  const settings = getRealtimeSettings()
  const meta = { version: '2.0', last_updated: today() }
  const blob = new Blob([JSON.stringify({ meta, settings, words }, null, 2)], {
    type: 'application/json',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `lexicore_progress_${today()}.json`
  a.click()
}

/** Add word - inserts into vocabulary, queues content/audio generation */
export async function addWord(wordData) {
  if (!hasSupabase()) return false
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const wordLower = (wordData.word || '').trim().toLowerCase()
  if (!wordLower) return false
  const existing = getWords().some((w) => w.word?.toLowerCase() === wordLower)
  if (existing) return false

  const def = wordData.definition || `Definition for "${wordData.word}"`
  const { error } = await supabase.from('vocabulary').insert({
    user_id: user.id,
    word: wordData.word.trim(),
    status: 'waiting',
    stage1_definitions: [{ definition: def, is_correct: true }],
    stage2_sentences: wordData.example
      ? [{ sentence: wordData.example, meaning: wordData.example_meaning || '' }]
      : [],
    stage3_correct: wordData.s3_correct ? [wordData.s3_correct] : [],
    stage3_incorrect: wordData.s3_wrong ? [wordData.s3_wrong] : [],
  })
  if (error) return false
  return true
}

/** Import CSV - adds words via addWord */
export async function importCSV(text) {
  const lines = text.trim().split('\n')
  const header = (lines[0] || '').split(',').map((h) => h.trim().toLowerCase())
  const wordIdx = header.indexOf('word')
  if (wordIdx < 0) return 0
  const defIdx = header.indexOf('definition')
  const exIdx = header.indexOf('example')
  const meaningIdx = header.indexOf('example_meaning')
  const s3cIdx = header.indexOf('s3_correct')
  const s3wIdx = header.indexOf('s3_wrong')
  let added = 0
  const existing = new Set(getWords().map((w) => w.word.toLowerCase()))
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim())
    const word = (cols[wordIdx] || '').trim().toLowerCase()
    if (!word || existing.has(word)) continue
    const ok = await addWord({
      word,
      definition: cols[defIdx] || '',
      example: cols[exIdx] || '',
      example_meaning: cols[meaningIdx] || '',
      s3_correct: cols[s3cIdx] || '',
      s3_wrong: cols[s3wIdx] || '',
    })
    if (ok) added++
    existing.add(word)
  }
  return added
}

/** Download CSV */
export function downloadCSV() {
  const words = getWords()
  const header = 'word,definition,example,example_meaning,s3_correct,s3_wrong,status,cycle,stage'
  const getDef = (w) => (w.stage1_definitions?.find((d) => d.is_correct)?.definition ?? w.definition ?? '')
  const getEx = (w) => (w.stage2_sentences?.[0]?.sentence ?? w.example ?? '')
  const getMeaning = (w) => (w.stage2_sentences?.[0]?.meaning ?? w.example_meaning ?? '')
  const getS3c = (w) => (w.stage3_correct?.[0] ?? w.s3_correct ?? '')
  const getS3w = (w) => (w.stage3_incorrect?.[0] ?? w.s3_wrong ?? '')
  const rows = words.map((w) =>
    [w.word, getDef(w), getEx(w), getMeaning(w), getS3c(w), getS3w(w), w.status, w.cycle, w.stage]
      .map((v) => `"${(v || '').toString().replace(/"/g, '""')}"`)
      .join(',')
  )
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `lexicore_words_${today()}.csv`
  a.click()
}

/** Snapshot/restore for settings form (local only) */
export function snapshotSettings() {
  return JSON.stringify(getRealtimeSettings())
}
export function restoreSettings(snapshot) {
  try {
    return JSON.parse(snapshot)
  } catch {
    return null
  }
}

/** Import JSON - inserts words into vocabulary (legacy format) */
export async function importJSON(jsonStr) {
  const data = JSON.parse(jsonStr)
  const words = data.words ?? []
  let added = 0
  const existing = new Set(getWords().map((w) => w.word.toLowerCase()))
  for (const w of words) {
    const word = (w.word || '').trim().toLowerCase()
    if (!word || existing.has(word)) continue
    const ok = await addWord({
      word,
      definition: w.definition,
      example: w.example,
      example_meaning: w.example_meaning,
      s3_correct: w.s3_correct,
      s3_wrong: w.s3_wrong,
    })
    if (ok) added++
    existing.add(word)
  }
  return added
}
