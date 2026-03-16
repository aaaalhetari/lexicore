import { reactive } from 'vue'
import { queueSync, getCurrentUser, loadFromCloud } from './sync.js'

// Words source URL (bundled with deploy, served from public/)
const WORDS_CSV_URL = `${import.meta.env.BASE_URL}words.csv`

// Placeholder for words that lack AI-generated content
function placeholderWord(w) {
  return {
    word: w,
    definition: `Definition for "${w}" (add via Import CSV or AI).`,
    example: `Use ___ in context.`,
    example_meaning: 'Used in context.',
    s3_correct: `She used ${w} correctly.`,
    s3_wrong: `He used ${w} incorrectly.`,
  }
}

function makeWord(w) {
  return {
    ...w,
    status: w.status || 'waiting',
    cycle: w.cycle ?? 0,
    stage: w.stage ?? 1,
    consecutive_correct: w.consecutive_correct ?? 0,
    cycle_1_completed_date: w.cycle_1_completed_date ?? null,
    cycle_2_completed_date: w.cycle_2_completed_date ?? null,
    cycle_3_completed_date: w.cycle_3_completed_date ?? null,
  }
}

const DEFAULT_SETTINGS = {
  new_words_per_session: 20,
  pool_size: 20,
  cycle_1: { stage_1_required: 4, stage_2_required: 4, stage_3_required: 4 },
  cycle_2: { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
  cycle_3: { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
}

function defaultData() {
  return {
    meta: { version: '1.0', last_updated: '' },
    settings: { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) },
    words: [],
    sessions: [],
  }
}

// ── STORE ─────────────────────────────────────────────────
const state = reactive({ data: defaultData(), ready: false })

// ── UTILS ─────────────────────────────────────────────────
export function today() {
  return new Date().toLocaleDateString('en-CA')
}

export function daysBetween(d1, d2) {
  return Math.floor((new Date(d2) - new Date(d1)) / 86400000)
}

export function nextId() {
  return state.data.words.reduce((max, w) => w.id > max ? w.id : max, 0) + 1
}

// ── GETTERS ───────────────────────────────────────────────
export function getData() { return state.data }

export function getSettings() { return state.data.settings }

export function getStats() {
  const words = state.data.words
  const total    = words.length
  const mastered = words.filter(w => w.status === 'mastered').length
  const learning = words.filter(w => w.status === 'learning').length
  const waiting  = words.filter(w => w.status === 'waiting').length
  const todayStr = today()
  const todayAnswered = state.data.sessions
    .filter(s => s.date === todayStr)
    .reduce((sum, s) => sum + (s.answered || 0), 0)
  return { total, mastered, learning, waiting, todayAnswered }
}

// ── PERSISTENCE ───────────────────────────────────────────
export function saveData() {
  try {
    localStorage.setItem('lexicore_data', JSON.stringify(state.data))
    queueSync(state.data)
  } catch (e) { /* storage full */ }
}

/** Load words from canonical CSV (public/words.csv on GitHub) */
async function fetchWordsFromCSV() {
  const res = await fetch(WORDS_CSV_URL)
  if (!res.ok) throw new Error('Failed to load words')
  const text = await res.text()
  return text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean)
}

/** Merge CSV words with saved progress. Saved progress overrides. */
function mergeWithProgress(csvWords, saved) {
  const savedByWord = new Map()
  if (saved?.words) {
    saved.words.forEach((w) => savedByWord.set(w.word.toLowerCase(), w))
  }
  const words = []
  let id = 1
  for (const w of csvWords) {
    const existing = savedByWord.get(w)
    if (existing) {
      words.push(makeWord({ ...existing, id: existing.id || id++ }))
    } else {
      words.push(makeWord({ id: id++, ...placeholderWord(w) }))
    }
  }
  return words
}

/**
 * Initialize app: load words from CSV, merge with saved progress (localStorage or sync),
 * then hydrate state. Call once on app mount.
 */
export async function initLexicore() {
  let saved = null
  const user = await getCurrentUser()
  if (user) {
    try {
      saved = await loadFromCloud()
    } catch (e) {
      console.warn('Cloud load failed, using local', e)
    }
  }
  if (!saved) {
    try {
      const s = localStorage.getItem('lexicore_data')
      saved = s ? JSON.parse(s) : null
    } catch (_) {}
  }

  let csvWords
  try {
    csvWords = await fetchWordsFromCSV()
  } catch (e) {
    console.warn('Words CSV not available, using saved/empty', e)
    csvWords = saved?.words?.map((w) => w.word) ?? []
  }

  const words = mergeWithProgress(csvWords, saved)
  const settings = (() => {
    const s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
    if (!saved?.settings) return s
    Object.keys(saved.settings).forEach((k) => {
      if (typeof saved.settings[k] === 'object' && s[k]) {
        Object.assign(s[k], saved.settings[k])
      } else {
        s[k] = saved.settings[k]
      }
    })
    return s
  })()
  const sessions = saved?.sessions ?? []
  const meta = saved?.meta ?? { version: '1.0', last_updated: '' }

  state.data.words = words
  state.data.settings = settings
  state.data.sessions = sessions
  state.data.meta = meta
  state.ready = true
  saveData()
}

/** Legacy: load only from localStorage (no CSV). Kept for compatibility. */
export function loadFromStorage() {
  try {
    const saved = localStorage.getItem('lexicore_data')
    if (saved) {
      state.data = JSON.parse(saved)
      state.ready = true
      return true
    }
  } catch (e) {}
  return false
}

export function isReady() {
  return state.ready
}

export function importJSON(jsonStr) {
  state.data = JSON.parse(jsonStr)
  saveData()
}

export function downloadJSON() {
  state.data.meta.last_updated = today()
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `lexicore_progress_${today()}.json`
  a.click()
}

export function downloadCSV() {
  const header = 'word,definition,example,example_meaning,s3_correct,s3_wrong,status,cycle,stage'
  const rows = state.data.words.map(w =>
    [w.word, w.definition, w.example, w.example_meaning, w.s3_correct, w.s3_wrong, w.status, w.cycle, w.stage]
      .map(v => `"${(v || '').toString().replace(/"/g, '""')}"`)
      .join(',')
  )
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `lexicore_words_${today()}.csv`
  a.click()
}

// ── CSV PARSER ────────────────────────────────────────────
function parseCSVLine(line) {
  const result = []
  let current = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim()); current = ''
    } else { current += ch }
  }
  result.push(current.trim())
  return result
}

export function importCSV(text) {
  const lines = text.trim().split('\n')
  const header = parseCSVLine(lines[0])
  let added = 0
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cols = parseCSVLine(lines[i])
    const row = {}
    header.forEach((h, idx) => { row[h] = cols[idx] || '' })
    if (!row.word) continue
    if (state.data.words.find(w => w.word.toLowerCase() === row.word.toLowerCase())) continue
    state.data.words.push({
      id: nextId(),
      word: row.word, definition: row.definition || '',
      example: row.example || `Use ___ in context.`,
      example_meaning: row.example_meaning || 'Used in context.',
      s3_correct: row.s3_correct || `She used ${row.word} correctly.`,
      s3_wrong: row.s3_wrong || `He used ${row.word} incorrectly.`,
      status: 'waiting', cycle: 0, stage: 1, consecutive_correct: 0,
      cycle_1_completed_date: null, cycle_2_completed_date: null, cycle_3_completed_date: null,
    })
    added++
  }
  saveData()
  return added
}

// ── WORD ACTIONS ──────────────────────────────────────────
export function addWord(wordData) {
  if (state.data.words.find(w => w.word.toLowerCase() === wordData.word.toLowerCase())) {
    return false
  }
  state.data.words.push({
    id: nextId(), ...wordData,
    status: 'waiting', cycle: 0, stage: 1, consecutive_correct: 0,
    cycle_1_completed_date: null, cycle_2_completed_date: null, cycle_3_completed_date: null,
  })
  saveData()
  return true
}

// ── SETTINGS ACTIONS ──────────────────────────────────────
export function updateSetting(key, val) {
  state.data.settings[key] = parseInt(val) || 1
}

export function updateCycleSetting(cycle, stage, val) {
  state.data.settings[`cycle_${cycle}`][`stage_${stage}_required`] = parseInt(val) || 1
}

export function snapshotSettings() {
  return JSON.stringify(state.data.settings)
}

export function restoreSettings(snapshot) {
  state.data.settings = JSON.parse(snapshot)
}

// ── SESSION ACTIONS ───────────────────────────────────────
export function advanceCycles() {
  const todayStr = today()
  state.data.words.forEach(w => {
    if (w.status !== 'learning') return
    if (w.cycle === 1 && w.cycle_1_completed_date && daysBetween(w.cycle_1_completed_date, todayStr) >= 1) {
      w.cycle = 2; w.stage = 1; w.consecutive_correct = 0
    } else if (w.cycle === 2 && w.cycle_2_completed_date && daysBetween(w.cycle_2_completed_date, todayStr) >= 1) {
      w.cycle = 3; w.stage = 1; w.consecutive_correct = 0
    }
  })
}

export function buildSessionPool() {
  const sessionSize = parseInt(state.data.settings.new_words_per_session) || 20
  const poolSize    = parseInt(state.data.settings.pool_size) || 20
  const learning    = state.data.words.filter(w => w.status === 'learning')
  const waiting     = state.data.words.filter(w => w.status === 'waiting')

  const pool = []
  for (let i = 0; i < learning.length && pool.length < sessionSize; i++) pool.push(learning[i])
  for (let i = 0; i < waiting.length  && pool.length < sessionSize; i++) pool.push(waiting[i])

  // Activate new waiting words
  pool.forEach(w => {
    if (w.status === 'waiting') {
      w.status = 'learning'; w.cycle = 1; w.stage = 1; w.consecutive_correct = 0
    }
  })

  // Build distractor pool
  const inPool = new Set(pool.map(w => w.id))
  const distractorPool = [...pool]
  const extras = state.data.words.filter(w => !inPool.has(w.id) && w.status !== 'mastered')
  for (let i = 0; distractorPool.length < Math.max(poolSize, 4) && i < extras.length; i++) {
    distractorPool.push(extras[i])
  }

  // Active words = haven't completed current cycle today
  const todayStr = today()
  const activeWords = pool.filter(w => {
    if (w.status === 'mastered') return false
    return w[`cycle_${w.cycle}_completed_date`] !== todayStr
  })

  return { activeWords, distractorPool }
}

export function recordSession(answered, correct) {
  state.data.meta.last_updated = today()
  state.data.sessions.push({ date: today(), answered, correct })
  saveData()
}
