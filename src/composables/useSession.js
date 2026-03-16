/**
 * LexiCore v2: Session composable - backend-driven, weighted pick
 */

import { ref, computed } from 'vue'
import { getActivePool, submitAnswer, recordSession, getSettings } from '../store/data.js'
import { getWords } from '../store/realtime.js'

export function useSession() {
  const activeWords = ref([])
  const distractorPool = ref([])
  const totalAtStart = ref(0)
  const correct = ref(0)
  const answeredCount = ref(0)
  const lastShownId = ref(null)
  const lastS3WasCorrect = ref(undefined)
  const currentWordId = ref(null)
  const sessionDone = ref(false)

  const currentWord = computed(() => {
    const id = currentWordId.value
    if (!id) return null
    const fromStore = getWords().find((w) => w.id === id)
    return fromStore ?? activeWords.value.find((w) => w.id === id)
  })

  function pickNextWord() {
    const pool = activeWords.value
    if (pool.length === 1) return pool[0]
    const candidates = pool.filter((w) => w.id !== lastShownId.value)
    const pickPool = candidates.length > 0 ? candidates : pool
    const settings = getSettings()

    const weights = pickPool.map((w) => {
      const req = settings[`cycle_${w.cycle || 1}`]?.[`stage_${w.stage}_required`] || 4
      const progress = w.consecutive_correct / req
      return 1 + (1 - progress) * 3
    })
    const total = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    for (let i = 0; i < pickPool.length; i++) {
      r -= weights[i]
      if (r <= 0) {
        lastShownId.value = pickPool[i].id
        return pickPool[i]
      }
    }
    lastShownId.value = pickPool[0].id
    return pickPool[0]
  }

  async function startSession() {
    const pool = await getActivePool()
    if (pool.length === 0) return 'done_today'

    const allWords = getWords()
    const poolIds = new Set(pool.map((w) => w.id))
    const distractors = [...pool]
    const extras = allWords.filter((w) => !poolIds.has(w.id) && w.status !== 'mastered')
    for (let i = 0; distractors.length < Math.max(20, 4) && i < extras.length; i++) {
      distractors.push(extras[i])
    }

    activeWords.value = pool
    distractorPool.value = distractors
    totalAtStart.value = pool.length
    correct.value = 0
    answeredCount.value = 0
    lastShownId.value = null
    lastS3WasCorrect.value = undefined
    sessionDone.value = false

    const next = pickNextWord()
    currentWordId.value = next?.id ?? null
    return 'started'
  }

  const progressPct = computed(() => {
    if (!totalAtStart.value) return 0
    return ((totalAtStart.value - activeWords.value.length) / totalAtStart.value) * 100
  })

  const remaining = computed(() => activeWords.value.length)

  async function handleAnswer(isCorrect) {
    const word = currentWord.value
    if (!word) return null

    answeredCount.value++
    if (isCorrect) correct.value++

    const result = await submitAnswer(word.id, isCorrect)
    if (result?.error) return { type: 'error', result }

    if (result.type === 'mastered' || result.type === 'cycle_complete') {
      activeWords.value = activeWords.value.filter((w) => w.id !== word.id)
    }

    return result
  }

  function advance() {
    if (activeWords.value.length === 0) {
      sessionDone.value = true
      recordSession(answeredCount.value, correct.value)
      return false
    }
    const next = pickNextWord()
    currentWordId.value = next?.id ?? null
    return true
  }

  function getS3Type() {
    if (lastS3WasCorrect.value === undefined) {
      lastS3WasCorrect.value = Math.random() > 0.5
    } else {
      lastS3WasCorrect.value = !lastS3WasCorrect.value
    }
    return lastS3WasCorrect.value
  }

  return {
    activeWords,
    distractorPool,
    totalAtStart,
    correct,
    answeredCount,
    currentWord,
    sessionDone,
    progressPct,
    remaining,
    startSession,
    handleAnswer,
    advance,
    getS3Type,
  }
}
