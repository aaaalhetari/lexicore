/**
 * LexiCore — realtime store: reactive mirror of server state (vocabulary + settings)
 */

import { reactive } from 'vue'
import { supabase, hasSupabase } from '../lib/supabase.js'

/** Loaded into client store (session + word list). Excludes waiting/mastered to limit payload size. */
export const VOCABULARY_ACTIVE_STATUSES = ['new_word', 'learning_today', 'learning_before_today']

const state = reactive({
  words: [],
  settings: null,
  sessions: [],
  statsSummary: null,
  /** True when server stats RPC failed and fallback total count also failed — Home may show zeros misleadingly. */
  statsLoadError: false,
  ready: false,
})

let channel = null
let currentUserId = null
let resyncTimer = null
let visibilityHandler = null
let onlineHandler = null

/** Normalize id for comparison (handles bigint/string/number from DB) */
function sameId(a, b) {
  if (a == null || b == null) return false
  return String(a) === String(b) || Number(a) === Number(b)
}

function sameSessionRow(a, b) {
  if (!a || !b) return false
  // Prefer PK match when id exists.
  if (a.id != null && b.id != null) return sameId(a.id, b.id)
  // Fallback for upsert-by-date shape (user_id,date).
  return String(a.user_id ?? '') === String(b.user_id ?? '') && String(a.date ?? '') === String(b.date ?? '')
}

function isActiveVocabStatus(status) {
  return VOCABULARY_ACTIVE_STATUSES.includes(status)
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
  if (idx < 0) return
  const current = state.words[idx]
  const merged = { ...current, ...updates }
  if (!isActiveVocabStatus(merged.status)) {
    state.words.splice(idx, 1)
    return
  }
  state.words.splice(idx, 1, merged)
}

export function getSettings() {
  return state.settings
}

function statN(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function normalizeStatsPayload(raw) {
  return {
    total: statN(raw.total),
    mastered: statN(raw.mastered),
    waiting: statN(raw.waiting),
    new_word: statN(raw.new_word),
    learning_today: statN(raw.learning_today),
    learning_before_today: statN(raw.learning_before_today),
    eligible_today: statN(raw.eligible_today),
    today_answered: statN(raw.today_answered),
  }
}

function getStatsFromWordsOnly() {
  const words = state.words
  const todayStr = today()
  const learningToday = words.filter((w) => w.status === 'learning_today').length
  const learningBeforeToday = words.filter((w) => w.status === 'learning_before_today').length
  const newWord = words.filter((w) => w.status === 'new_word').length
  const eligibleToday = words.filter((w) => {
    if (w.status !== 'learning_today' && w.status !== 'learning_before_today') return false
    const c1 = String(w.cycle_1_completed_date ?? '').slice(0, 10)
    const c2 = String(w.cycle_2_completed_date ?? '').slice(0, 10)
    const c3 = String(w.cycle_3_completed_date ?? '').slice(0, 10)
    return c1 !== todayStr && c2 !== todayStr && c3 !== todayStr
  }).length
  return {
    learningToday,
    learningBeforeToday,
    newWord,
    learning: learningToday + learningBeforeToday,
    eligibleToday,
    newWordsInLearningToday: learningToday,
  }
}

export function getStats() {
  const waitingTarget = state.settings?.waiting_target ?? 50
  const newWordsPerDay = state.settings?.new_words_per_day ?? 25
  const todayStr = today()
  const todayAnswered = state.sessions
    .filter((x) => x.date === todayStr)
    .reduce((sum, x) => sum + (x.answered || 0), 0)
  const s = state.statsSummary
  if (!s) {
    const w = getStatsFromWordsOnly()
    return {
      total: 0,
      mastered: 0,
      learning: w.learning,
      learningToday: w.learningToday,
      learningBeforeToday: w.learningBeforeToday,
      newWord: w.newWord,
      waiting: 0,
      todayAnswered,
      eligibleToday: w.eligibleToday,
      waiting_target: waitingTarget,
      newWordsPerDay,
      newWordsInLearningToday: w.newWordsInLearningToday,
    }
  }
  const learningToday = statN(s.learning_today)
  const learningBeforeToday = statN(s.learning_before_today)
  return {
    total: statN(s.total),
    mastered: statN(s.mastered),
    learning: learningToday + learningBeforeToday,
    learningToday,
    learningBeforeToday,
    newWord: statN(s.new_word),
    waiting: statN(s.waiting),
    todayAnswered,
    eligibleToday: statN(s.eligible_today),
    waiting_target: waitingTarget,
    newWordsPerDay,
    newWordsInLearningToday: learningToday,
  }
}

export function today() {
  return new Date().toLocaleDateString('en-CA')
}

export function isReady() {
  return state.ready
}

export function getStatsLoadError() {
  return state.statsLoadError
}

async function fetchStatsSummaryFallbackCounts() {
  const uid = currentUserId
  if (!uid) return
  const head = { count: 'exact', head: true }
  const countStatus = async (status) => {
    const { count, error: cErr } = await supabase
      .from('vocabulary')
      .select('*', head)
      .eq('user_id', uid)
      .eq('status', status)
    if (cErr) console.warn('vocabulary count:', status, cErr)
    return count ?? 0
  }
  const todayStr = today()
  const totalRes = await supabase.from('vocabulary').select('*', head).eq('user_id', uid)
  if (totalRes.error) console.warn('vocabulary total count:', totalRes.error)
  const [mastered, waiting, new_word, learning_today, learning_before_today] = await Promise.all([
    countStatus('mastered'),
    countStatus('waiting'),
    countStatus('new_word'),
    countStatus('learning_today'),
    countStatus('learning_before_today'),
  ])
  let eligible_today = 0
  const { data: eligRows, error: eligErr } = await supabase
    .from('vocabulary')
    .select('cycle_1_completed_date, cycle_2_completed_date, cycle_3_completed_date')
    .eq('user_id', uid)
    .in('status', ['learning_today', 'learning_before_today'])
  if (eligErr) {
    console.warn('eligible_today fallback:', eligErr)
  } else {
    for (const w of eligRows ?? []) {
      const c1 = String(w.cycle_1_completed_date ?? '').slice(0, 10)
      const c2 = String(w.cycle_2_completed_date ?? '').slice(0, 10)
      const c3 = String(w.cycle_3_completed_date ?? '').slice(0, 10)
      if (c1 !== todayStr && c2 !== todayStr && c3 !== todayStr) eligible_today++
    }
  }
  state.statsSummary = normalizeStatsPayload({
    total: totalRes.count ?? 0,
    mastered,
    waiting,
    new_word,
    learning_today,
    learning_before_today,
    eligible_today,
    today_answered: 0,
  })
  state.statsLoadError = Boolean(totalRes.error)
}

export async function fetchStatsSummary() {
  if (!hasSupabase() || !currentUserId) {
    state.statsSummary = null
    state.statsLoadError = false
    return
  }
  const { data, error } = await supabase.rpc('vocabulary_stats_summary', {
    p_today: today(),
  })
  let raw = data
  if (!error && raw != null && typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      raw = null
    }
  }
  if (!error && raw && typeof raw === 'object') {
    state.statsSummary = normalizeStatsPayload(raw)
    state.statsLoadError = false
    return
  }
  if (error) console.warn('vocabulary_stats_summary:', error)
  await fetchStatsSummaryFallbackCounts()
}

async function fetchVocabulary(userId) {
  const { data: initial, error: vocabError } = await supabase
    .from('vocabulary')
    .select('*')
    .eq('user_id', userId)
    .in('status', VOCABULARY_ACTIVE_STATUSES)
    .order('id')

  if (vocabError) {
    console.warn('Vocabulary fetch failed:', vocabError)
    state.words = []
    return
  }

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

async function fetchSettings(userId) {
  const { data: settingsRow } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  state.settings = settingsRow
    ? {
        new_words_per_day: settingsRow.new_words_per_day ?? 25,
        waiting_target: settingsRow.waiting_target ?? 50,
        cycle_1: settingsRow.cycle_1 ?? { stage_1_required: 4, stage_2_required: 4, stage_3_required: 4 },
        cycle_2: settingsRow.cycle_2 ?? { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
        cycle_3: settingsRow.cycle_3 ?? { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
      }
    : {
        new_words_per_day: 25,
        waiting_target: 50,
        cycle_1: { stage_1_required: 4, stage_2_required: 4, stage_3_required: 4 },
        cycle_2: { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
        cycle_3: { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
      }
}

async function fetchSessions(userId) {
  const { data: sessionsData } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(365)

  state.sessions = sessionsData ?? []
}

async function resyncCurrentUser() {
  const userId = currentUserId
  if (!hasSupabase() || !userId) return
  try {
    await Promise.all([
      fetchVocabulary(userId),
      fetchStatsSummary(),
      fetchSettings(userId),
      fetchSessions(userId),
    ])
  } catch (e) {
    console.warn('Realtime resync failed:', e?.message ?? e)
  }
}

function scheduleQuickResync(delay = 250) {
  if (resyncTimer) clearTimeout(resyncTimer)
  resyncTimer = setTimeout(() => {
    resyncTimer = null
    resyncCurrentUser()
  }, delay)
}

/** Public hook: trigger a fast resync (useful when changing screens). */
export function requestQuickResync(delay = 0) {
  scheduleQuickResync(delay)
}

function wireFastResyncHooks() {
  if (typeof document !== 'undefined' && !visibilityHandler) {
    visibilityHandler = () => {
      if (document.visibilityState === 'visible') scheduleQuickResync(0)
    }
    document.addEventListener('visibilitychange', visibilityHandler)
  }
  if (typeof window !== 'undefined' && !onlineHandler) {
    onlineHandler = () => scheduleQuickResync(0)
    window.addEventListener('online', onlineHandler)
  }
}

/** Subscribe to vocabulary + load initial data */
export async function subscribeRealtime(userId) {
  unsubscribeRealtime()
  currentUserId = userId ?? null

  if (!hasSupabase() || !userId) {
    // Keep store deterministic after sign-out / missing config.
    state.words = []
    state.statsSummary = null
    state.statsLoadError = false
    state.sessions = []
    state.settings = {
      new_words_per_day: 25,
      waiting_target: 50,
      cycle_1: { stage_1_required: 4, stage_2_required: 4, stage_3_required: 4 },
      cycle_2: { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
      cycle_3: { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
    }
    state.ready = true
    return
  }

  await Promise.all([
    fetchVocabulary(userId),
    fetchStatsSummary(),
    fetchSettings(userId),
    fetchSessions(userId),
  ])
  state.ready = true
  wireFastResyncHooks()

  channel = supabase
    .channel(`realtime-user-${userId}`)
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
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_settings',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        handleSettingsChange(payload)
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'sessions',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        handleSessionsChange(payload)
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') scheduleQuickResync(0)
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        scheduleQuickResync(600)
      }
    })
}

function handleVocabularyChange(payload) {
  const { eventType, new: newRow, old: oldRow } = payload

  if (eventType === 'INSERT') {
    const nw = normalizeWord(newRow)
    if (!isActiveVocabStatus(nw.status)) {
      scheduleQuickResync(450)
      return
    }
    const exists = state.words.some((w) => sameId(w.id, newRow.id))
    if (!exists) {
      state.words.push(nw)
      state.words.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0))
    }
  } else if (eventType === 'UPDATE') {
    const nw = normalizeWord(newRow)
    const idx = state.words.findIndex((w) => sameId(w.id, newRow.id))
    if (!isActiveVocabStatus(nw.status)) {
      if (idx >= 0) state.words.splice(idx, 1)
    } else if (idx >= 0) {
      state.words.splice(idx, 1, nw)
    } else {
      state.words.push(nw)
      state.words.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0))
    }
  } else if (eventType === 'DELETE') {
    state.words = state.words.filter((w) => !sameId(w.id, oldRow.id))
  }
  // Debounced full refresh keeps client fully in-sync with any server-side triggers.
  scheduleQuickResync(450)
}

function handleSettingsChange(payload) {
  const { eventType, new: newRow } = payload
  if (eventType === 'DELETE' || !newRow) return
  state.settings = {
    new_words_per_day: newRow.new_words_per_day ?? 25,
    waiting_target: newRow.waiting_target ?? 50,
    cycle_1: newRow.cycle_1 ?? { stage_1_required: 4, stage_2_required: 4, stage_3_required: 4 },
    cycle_2: newRow.cycle_2 ?? { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
    cycle_3: newRow.cycle_3 ?? { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
  }
}

function handleSessionsChange(payload) {
  const { eventType, new: newRow, old: oldRow } = payload
  if (eventType === 'INSERT' || eventType === 'UPDATE') {
    const idx = state.sessions.findIndex((s) => sameSessionRow(s, newRow))
    if (idx >= 0) {
      state.sessions.splice(idx, 1, newRow)
    } else {
      state.sessions.push(newRow)
    }
    state.sessions = [...state.sessions]
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
      .slice(0, 365)
  } else if (eventType === 'DELETE') {
    state.sessions = state.sessions.filter((s) => !sameSessionRow(s, oldRow))
  }
}

export function normalizeWord(row) {
  return {
    id: row.id,
    word: row.word,
    created_at: row.created_at,
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
  if (resyncTimer) {
    clearTimeout(resyncTimer)
    resyncTimer = null
  }
  if (channel) {
    supabase.removeChannel(channel)
    channel = null
  }
  if (visibilityHandler && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', visibilityHandler)
    visibilityHandler = null
  }
  if (onlineHandler && typeof window !== 'undefined') {
    window.removeEventListener('online', onlineHandler)
    onlineHandler = null
  }
  state.statsSummary = null
  state.statsLoadError = false
  currentUserId = null
}

/** Refetch a single word and update store (call after makeFullCard) */
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
  if (!isActiveVocabStatus(normalized.status)) {
    if (idx >= 0) state.words.splice(idx, 1)
    return true
  }
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
      new_words_per_day: data.new_words_per_day ?? 25,
      waiting_target: data.waiting_target ?? 50,
      cycle_1: data.cycle_1 ?? { stage_1_required: 4, stage_2_required: 4, stage_3_required: 4 },
      cycle_2: data.cycle_2 ?? { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
      cycle_3: data.cycle_3 ?? { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
    }
  }
}
