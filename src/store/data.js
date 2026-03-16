/**
 * LexiCore v2: Lightweight data layer - all writes go to backend
 * Reads come from realtime store (realtime.js)
 */

import { supabase, hasSupabase } from '../lib/supabase.js'
import {
  getWords,
  getSettings as getRealtimeSettings,
  getStats as getRealtimeStats,
} from './realtime.js'

export function today() {
  return new Date().toLocaleDateString('en-CA')
}

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

/** Get active pool from backend (10 words, stage-aware) */
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

  await supabase.from('user_settings').upsert(
    {
      user_id: user.id,
      new_words_per_session: settings.new_words_per_session,
      pool_size: settings.pool_size,
      cycle_1: settings.cycle_1,
      cycle_2: settings.cycle_2,
      cycle_3: settings.cycle_3,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
  const { refetchSettings } = await import('./realtime.js')
  await refetchSettings(user.id)
}

/** Trigger reservoir refill check (backend queues job) */
export async function checkRefillNeeded() {
  if (!hasSupabase()) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.rpc('check_refill_needed', { p_user_id: user.id })
}

/** Invoke process-refill Edge Function (for cron or manual) */
export async function processRefillJobs() {
  if (!hasSupabase()) return
  const { data, error } = await supabase.functions.invoke('process-refill')
  if (error) throw error
  return data
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
