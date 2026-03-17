/**
 * LexiCore v2: Realtime store - reactive mirror of server state
 * Subscribes to vocabulary table, updates word-by-word
 */

import { reactive, shallowRef } from 'vue'
import { supabase, hasSupabase } from '../lib/supabase.js'

const state = reactive({
  words: [],
  settings: null,
  sessions: [],
  ready: false,
})

let channel = null

/** Normalize id for comparison (handles bigint/string/number from DB) */
function sameId(a, b) {
  if (a == null || b == null) return false
  return String(a) === String(b) || Number(a) === Number(b)
}

export function getWords() {
  return state.words
}

/** Get word by id (handles string/number mismatch) */
export function getWordById(wordId) {
  return state.words.find((w) => sameId(w.id, wordId)) ?? null
}

/** Optimistically update word in store (call after submitAnswer to avoid realtime delay) */
export function updateWordOptimistic(wordId, updates) {
  const idx = state.words.findIndex((w) => sameId(w.id, wordId))
  if (idx >= 0) {
    const current = state.words[idx]
    state.words.splice(idx, 1, { ...current, ...updates })
  }
}

export function getSettings() {
  return state.settings
}

export function getStats() {
  const words = state.words
  const total = words.length
  const mastered = words.filter((w) => w.status === 'mastered').length
  const learning = words.filter((w) => w.status === 'learning').length
  const waiting = words.filter((w) => w.status === 'waiting').length
  const todayStr = today()
  const todayAnswered = state.sessions
    .filter((s) => s.date === todayStr)
    .reduce((sum, s) => sum + (s.answered || 0), 0)
  const eligibleToday = words.filter((w) => {
    if (w.status !== 'learning') return false
    const c1 = String(w.cycle_1_completed_date ?? '').slice(0, 10)
    const c2 = String(w.cycle_2_completed_date ?? '').slice(0, 10)
    const c3 = String(w.cycle_3_completed_date ?? '').slice(0, 10)
    return c1 !== todayStr && c2 !== todayStr && c3 !== todayStr
  }).length
  const wordsPerSession = state.settings?.new_words_per_session ?? state.settings?.pool_size ?? 20
  return { total, mastered, learning, waiting, todayAnswered, availableToday: wordsPerSession, eligibleToday }
}

export function today() {
  return new Date().toLocaleDateString('en-CA')
}

export function isReady() {
  return state.ready
}

/** Subscribe to vocabulary + load initial data */
export async function subscribeRealtime(userId) {
  if (!hasSupabase() || !userId) {
    state.settings = {
      new_words_per_session: 20,
      pool_size: 20,
      cycle_1: { stage_1_required: 4, stage_2_required: 4, stage_3_required: 4 },
      cycle_2: { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
      cycle_3: { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
    }
    state.ready = true
    return
  }

  const { data: initial, error: vocabError } = await supabase
    .from('vocabulary')
    .select('*')
    .eq('user_id', userId)
    .order('id')

  if (vocabError) {
    console.warn('Vocabulary fetch failed:', vocabError)
    state.words = []
  } else {
    const seen = new Set()
    state.words = (initial ?? [])
      .map(normalizeWord)
      .filter((w) => {
        const key = String(w.id ?? '')
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0))
  }

  const { data: settingsRow } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  state.settings = settingsRow
    ? {
        new_words_per_session: settingsRow.new_words_per_session ?? 20,
        pool_size: settingsRow.pool_size ?? 20,
        cycle_1: settingsRow.cycle_1 ?? { stage_1_required: 4, stage_2_required: 4, stage_3_required: 4 },
        cycle_2: settingsRow.cycle_2 ?? { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
        cycle_3: settingsRow.cycle_3 ?? { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
      }
    : {
        new_words_per_session: 20,
        pool_size: 20,
        cycle_1: { stage_1_required: 4, stage_2_required: 4, stage_3_required: 4 },
        cycle_2: { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
        cycle_3: { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
      }

  const { data: sessionsData } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(365)

  state.sessions = sessionsData ?? []
  state.ready = true

  channel = supabase
    .channel('vocabulary-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'vocabulary',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        handleVocabularyChange(payload)
      }
    )
    .subscribe()
}

function handleVocabularyChange(payload) {
  const { eventType, new: newRow, old: oldRow } = payload

  if (eventType === 'INSERT') {
    const exists = state.words.some((w) => sameId(w.id, newRow.id))
    if (!exists) {
      state.words.push(normalizeWord(newRow))
      state.words.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0))
    }
  } else if (eventType === 'UPDATE') {
    const idx = state.words.findIndex((w) => sameId(w.id, newRow.id))
    if (idx >= 0) {
      state.words.splice(idx, 1, normalizeWord(newRow))
    } else {
      state.words.push(normalizeWord(newRow))
      state.words.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0))
    }
  } else if (eventType === 'DELETE') {
    state.words = state.words.filter((w) => !sameId(w.id, oldRow.id))
  }
}

export function normalizeWord(row) {
  return {
    id: row.id,
    word: row.word,
    status: row.status,
    cycle: row.cycle ?? 1,
    stage: row.stage ?? 1,
    consecutive_correct: row.consecutive_correct ?? 0,
    cycle_1_completed_date: row.cycle_1_completed_date,
    cycle_2_completed_date: row.cycle_2_completed_date,
    cycle_3_completed_date: row.cycle_3_completed_date,
    stage1_definitions: row.stage1_definitions ?? [],
    stage2_sentences: row.stage2_sentences ?? [],
    stage3_correct: row.stage3_correct ?? [],
    stage3_incorrect: row.stage3_incorrect ?? [],
    stage3_explanations_correct: row.stage3_explanations_correct ?? [],
    stage3_explanations_incorrect: row.stage3_explanations_incorrect ?? [],
    audio_word: row.audio_word,
    audio_stage1_definitions: row.audio_stage1_definitions ?? [],
    audio_stage2_sentences: row.audio_stage2_sentences ?? [],
    audio_stage3_correct: row.audio_stage3_correct ?? [],
    audio_stage3_incorrect: row.audio_stage3_incorrect ?? [],
    definition: getCurrentDefinition(row),
    example: getCurrentExample(row),
    example_meaning: getCurrentExampleMeaning(row),
    s3_correct: getCurrentS3Correct(row),
    s3_wrong: getCurrentS3Wrong(row),
  }
}

function getCurrentDefinition(row) {
  const defs = row.stage1_definitions ?? []
  const correct = defs.find((d) => d.is_correct)
  const s = (correct?.definition ?? '').trim()
  return s || `Definition for "${row.word}"`
}

function getCurrentExample(row) {
  const s2 = row.stage2_sentences ?? []
  const first = s2[0]
  const s = (first?.sentence ?? '').trim()
  return s || `Use ___ in context.`
}

function getCurrentExampleMeaning(row) {
  const s2 = row.stage2_sentences ?? []
  const first = s2[0]
  return first?.meaning ?? 'Used in context.'
}

function getCurrentS3Correct(row) {
  const arr = row.stage3_correct ?? []
  const s = (arr[0] ?? '').trim()
  return s || `She used ${row.word} correctly.`
}

function getCurrentS3Wrong(row) {
  const arr = row.stage3_incorrect ?? []
  const s = (arr[0] ?? '').trim()
  return s || `He used ${row.word} incorrectly.`
}

export function unsubscribeRealtime() {
  if (channel) {
    supabase.removeChannel(channel)
    channel = null
  }
}

/** Refetch a single word and update store (call after generateContentForWord) */
export async function refetchWord(wordId, userId) {
  if (!hasSupabase() || !userId || !wordId) return false
  const { data, error } = await supabase
    .from('vocabulary')
    .select('*')
    .eq('id', wordId)
    .eq('user_id', userId)
    .single()
  if (error || !data) return false
  const normalized = normalizeWord(data)
  const idx = state.words.findIndex((w) => sameId(w.id, wordId))
  if (idx >= 0) {
    state.words.splice(idx, 1, normalized)
  } else {
    const exists = state.words.some((w) => sameId(w.id, wordId))
    if (!exists) {
      state.words.push(normalized)
      state.words.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0))
    }
  }
  return true
}

/** Refetch settings (call after updateSettings) */
export async function refetchSettings(userId) {
  if (!hasSupabase() || !userId) return
  const { data } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (data) {
    state.settings = {
      new_words_per_session: data.new_words_per_session ?? 20,
      pool_size: data.pool_size ?? 20,
      cycle_1: data.cycle_1 ?? { stage_1_required: 4, stage_2_required: 4, stage_3_required: 4 },
      cycle_2: data.cycle_2 ?? { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
      cycle_3: data.cycle_3 ?? { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
    }
  }
}
