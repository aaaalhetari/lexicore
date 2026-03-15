import { ref, computed } from 'vue'
import { getData, getSettings, advanceCycles, buildSessionPool, recordSession, saveData, today } from '../store/data.js'

export function useSession() {
  const activeWords     = ref([])
  const distractorPool  = ref([])
  const totalAtStart    = ref(0)
  const correct         = ref(0)
  const answeredCount   = ref(0)
  const lastShownId     = ref(null)
  const lastS3WasCorrect = ref(undefined)
  const currentWord     = ref(null)
  const sessionDone     = ref(false)

  // ── WEIGHTED PICK ─────────────────────────────────────
  function pickNextWord() {
    if (activeWords.value.length === 1) return activeWords.value[0]
    const candidates = activeWords.value.filter(w => w.id !== lastShownId.value)
    const pool = candidates.length > 0 ? candidates : activeWords.value
    const settings = getSettings()

    const weights = pool.map(w => {
      const req = settings[`cycle_${w.cycle || 1}`]?.[`stage_${w.stage}_required`] || 4
      const progress = w.consecutive_correct / req
      return 1 + (1 - progress) * 3
    })
    const total = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i]
      if (r <= 0) { lastShownId.value = pool[i].id; return pool[i] }
    }
    lastShownId.value = pool[0].id
    return pool[0]
  }

  // ── START ────────────────────────────────────────────
  function startSession() {
    advanceCycles()
    const { activeWords: aw, distractorPool: dp } = buildSessionPool()
    if (aw.length === 0) return 'done_today'

    activeWords.value    = aw
    distractorPool.value = dp
    totalAtStart.value   = aw.length
    correct.value        = 0
    answeredCount.value  = 0
    lastShownId.value    = null
    lastS3WasCorrect.value = undefined
    sessionDone.value    = false

    currentWord.value = pickNextWord()
    return 'started'
  }

  // ── PROGRESS ─────────────────────────────────────────
  const progressPct = computed(() => {
    if (!totalAtStart.value) return 0
    return ((totalAtStart.value - activeWords.value.length) / totalAtStart.value) * 100
  })

  const remaining = computed(() => activeWords.value.length)

  // ── ANSWER ───────────────────────────────────────────
  function handleAnswer(isCorrect) {
    const word = currentWord.value
    answeredCount.value++

    if (isCorrect) {
      word.consecutive_correct++
      correct.value++
      const cycle = word.cycle || 1
      const settings = getSettings()
      const required = settings[`cycle_${cycle}`][`stage_${word.stage}_required`]

      if (word.consecutive_correct >= required) {
        if (word.stage < 3) {
          word.stage++
          word.consecutive_correct = 0
          saveData()
          return { type: 'stage_advance', stage: word.stage }
        } else {
          // Completed all stages in this cycle
          if (cycle < 3) {
            word[`cycle_${cycle}_completed_date`] = today()
            activeWords.value = activeWords.value.filter(w => w.id !== word.id)
            saveData()
            return { type: 'cycle_complete', cycle, remaining: activeWords.value.length }
          } else {
            word.status = 'mastered'
            word[`cycle_3_completed_date`] = today()
            activeWords.value = activeWords.value.filter(w => w.id !== word.id)
            saveData()
            return { type: 'mastered', word: word.word, remaining: activeWords.value.length }
          }
        }
      } else {
        saveData()
        return { type: 'correct', count: word.consecutive_correct, required }
      }
    } else {
      word.consecutive_correct = 0
      saveData()
      return { type: 'wrong' }
    }
  }

  // ── NEXT WORD ─────────────────────────────────────────
  function advance() {
    if (activeWords.value.length === 0) {
      sessionDone.value = true
      recordSession(answeredCount.value, correct.value)
      return false
    }
    currentWord.value = pickNextWord()
    return true
  }

  // ── STAGE 3 ALTERNATION ───────────────────────────────
  function getS3Type() {
    if (lastS3WasCorrect.value === undefined) {
      lastS3WasCorrect.value = Math.random() > 0.5
    } else {
      lastS3WasCorrect.value = !lastS3WasCorrect.value
    }
    return lastS3WasCorrect.value
  }

  return {
    activeWords, distractorPool, totalAtStart,
    correct, answeredCount, currentWord, sessionDone,
    progressPct, remaining,
    startSession, handleAnswer, advance, getS3Type,
  }
}
