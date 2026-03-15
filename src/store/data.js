import { reactive, readonly } from 'vue'

// ── DEFAULT DATA ──────────────────────────────────────────
const DEFAULT_WORDS = [
  { id:1, word:'scrutinize', definition:'To examine or inspect closely and thoroughly.', example:'The auditor will ___ every financial record before the report.', example_meaning:'The auditor will examine every financial record in great detail.', s3_correct:'The scientist scrutinized the data for any errors before publishing.', s3_wrong:'She scrutinized the joke and laughed louder than everyone else.' },
  { id:2, word:'ambiguous', definition:'Open to more than one interpretation; not clear or decided.', example:'The contract clause was ___ and led to a long legal dispute.', example_meaning:'The clause could mean different things, causing confusion.', s3_correct:'His ambiguous answer left everyone unsure of his true intentions.', s3_wrong:'The instructions were ambiguous, so everyone followed them perfectly.' },
  { id:3, word:'meticulous', definition:'Showing great attention to detail; very careful and precise.', example:'Her ___ planning ensured the event ran without a single problem.', example_meaning:'She planned every detail so carefully that nothing went wrong.', s3_correct:'He was meticulous in his work, checking every number twice.', s3_wrong:'The meticulous chef threw ingredients in randomly without measuring.' },
  { id:4, word:'eloquent', definition:'Fluent and persuasive in speaking or writing.', example:'The lawyer gave an ___ closing argument that moved the jury.', example_meaning:'The lawyer spoke so clearly and powerfully that the jury was convinced.', s3_correct:'Her eloquent speech inspired hundreds of students to pursue science.', s3_wrong:'His eloquent presentation was full of mumbling and unclear ideas.' },
  { id:5, word:'pragmatic', definition:'Dealing with things sensibly and practically rather than theoretically.', example:'We need a ___ solution, not just an idealistic vision.', example_meaning:'We need a solution that actually works in real life.', s3_correct:'A pragmatic manager focuses on results rather than rigid rules.', s3_wrong:'The pragmatic dreamer ignored reality and hoped for miracles.' },
  { id:6, word:'resilient', definition:'Able to recover quickly from difficulties; tough.', example:'Despite losing the contract, the team remained ___ and found new clients.', example_meaning:'The team did not give up after a setback; they bounced back quickly.', s3_correct:'Children are often resilient and adapt well to new environments.', s3_wrong:'The resilient structure collapsed immediately under light pressure.' },
  { id:7, word:'tenacious', definition:'Very determined; not giving up easily.', example:'Her ___ pursuit of the promotion finally paid off after two years.', example_meaning:'She kept trying for the promotion without giving up.', s3_correct:'The tenacious negotiator refused to accept the first offer.', s3_wrong:'He was so tenacious that he quit after the first obstacle.' },
  { id:8, word:'lucid', definition:'Expressed clearly; easy to understand.', example:'The professor gave a ___ explanation that even beginners could follow.', example_meaning:'The explanation was so clear that everyone understood it easily.', s3_correct:'Her lucid writing style made the complex topic accessible to all.', s3_wrong:'His lucid essay was so confusing that no one understood the point.' },
  { id:9, word:'discern', definition:'To recognize or identify something; to perceive clearly.', example:'It was hard to ___ any difference between the two proposals.', example_meaning:'The two proposals looked so similar it was difficult to tell them apart.', s3_correct:'An experienced investor can discern a promising startup from a weak one.', s3_wrong:'She could discern nothing from the report because it was crystal clear.' },
  { id:10, word:'concise', definition:'Giving a lot of information clearly in a few words.', example:'Please keep your summary ___ — no more than three sentences.', example_meaning:'Write a short, clear summary using as few words as possible.', s3_correct:'A concise email gets to the point without unnecessary details.', s3_wrong:'His concise report was 80 pages long and repeated every point five times.' },
]

function makeWord(w) {
  return {
    ...w,
    status: 'waiting', cycle: 0, stage: 1, consecutive_correct: 0,
    cycle_1_completed_date: null, cycle_2_completed_date: null, cycle_3_completed_date: null
  }
}

function defaultData() {
  return {
    meta: { version: '1.0', last_updated: '' },
    settings: {
      new_words_per_session: 20,
      pool_size: 20,
      cycle_1: { stage_1_required: 4, stage_2_required: 4, stage_3_required: 4 },
      cycle_2: { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
      cycle_3: { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
    },
    words: DEFAULT_WORDS.map(makeWord),
    sessions: [],
  }
}

// ── STORE ─────────────────────────────────────────────────
const state = reactive({ data: defaultData() })

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
  } catch (e) { /* storage full */ }
}

export function loadFromStorage() {
  try {
    const saved = localStorage.getItem('lexicore_data')
    if (saved) { state.data = JSON.parse(saved); return true }
  } catch (e) {}
  return false
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
