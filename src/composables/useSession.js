/**
 * LexiCore v2: Session composable - backend-driven, weighted pick
 */

import { ref, computed } from 'vue'
import { getActivePool, submitAnswer, recordSession, getSettings } from '../store/data.js'
import { getWords, getWordById, normalizeWord, updateWordOptimistic } from '../store/realtime.js'

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
    const fromStore = getWordById(id)
    const fromPool = activeWords.value.find((w) => String(w.id) === String(id) || Number(w.id) === Number(id))
    // Prefer pool (fresh from get_active_pool) over store (may be stale from initial load)
    return fromPool ?? fromStore
  })

  /** Sync store into activeWords. After answer: status only (avoids overwriting content with stale placeholder). After refetch: full content. */
  function syncWordFromStore(wordId, options = {}) {
    const { fullContent = false } = options
    const fromStore = getWordById(wordId)
    if (!fromStore) return
    const idx = activeWords.value.findIndex((w) => String(w.id) === String(wordId) || Number(w.id) === Number(wordId))
    if (idx >= 0) {
      const current = activeWords.value[idx]
      const updated = [...activeWords.value]
      updated[idx] = fullContent
        ? { ...fromStore }
        : {
            ...current,
            consecutive_correct: fromStore.consecutive_correct,
            stage: fromStore.stage,
            cycle: fromStore.cycle,
            status: fromStore.status,
          }
      activeWords.value = updated
    }
  }

  function pickNextWord() {
    const pool = activeWords.value
    if (pool.length === 1) return pool[0]
    const lastId = lastShownId.value
    const candidates = pool.filter((w) => String(w.id) !== String(lastId) && Number(w.id) !== Number(lastId))
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

    const normalizedPool = pool.map(normalizeWord)
    const poolIds = new Set(normalizedPool.map((w) => String(w.id)))
    const seenIds = new Set()
    const dedupedPool = normalizedPool.filter((w) => {
      const k = String(w.id)
      if (seenIds.has(k)) return false
      seenIds.add(k)
      return true
    })
    const allWords = getWords()
    const distractors = [...dedupedPool]
    const extras = allWords.filter((w) => !poolIds.has(String(w.id)) && w.status !== 'mastered')
    const poolSize = getSettings()?.pool_size ?? 20
    const minDistractors = 4
    for (let i = 0; distractors.length < Math.max(poolSize, minDistractors) && i < extras.length; i++) {
      distractors.push(extras[i])
    }

    activeWords.value = dedupedPool
    distractorPool.value = distractors
    totalAtStart.value = dedupedPool.length
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

    const id = word.id
    if (result.type === 'correct') {
      updateWordOptimistic(id, { consecutive_correct: result.count ?? word.consecutive_correct + 1 })
    } else if (result.type === 'wrong') {
      updateWordOptimistic(id, { consecutive_correct: 0 })
    } else if (result.type === 'stage_advance') {
      updateWordOptimistic(id, { consecutive_correct: 0, stage: result.stage })
    } else if (result.type === 'cycle_complete') {
      updateWordOptimistic(id, { consecutive_correct: 0, cycle: (result.cycle ?? 0) + 1, stage: 1 })
    } else if (result.type === 'mastered') {
      updateWordOptimistic(id, { status: 'mastered' })
    }

    if (result.type === 'mastered' || result.type === 'cycle_complete') {
      const removeId = String(word.id)
      activeWords.value = activeWords.value.filter((w) => String(w.id) !== removeId)
    }

    syncWordFromStore(id)
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
    syncWordFromStore,
  }
}
