/**
 * LexiCore — session composable (backend-driven)
 */

import { ref, computed } from 'vue'
import { getActivePool, submitAnswer, recordSession } from '../store/data.js'
import { getWords, getWordById, normalizeWord, updateWordOptimistic } from '../store/realtime.js'

/** Shuffle array in place (Fisher-Yates) */
function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function useSession() {
  const activeWords = ref([])
  const sessionOrder = ref([]) // ordered list of word objects in display order, shuffled at start
  const currentIndex = ref(0)
  const distractorPool = ref([])
  const totalAtStart = ref(0)
  const correct = ref(0)
  const answeredCount = ref(0)
  const lastShownId = ref(null)
  const lastS3WasCorrect = ref(undefined)
  const sessionDone = ref(false)

  const currentWord = computed(() => {
    const order = sessionOrder.value
    const idx = currentIndex.value
    if (!order.length || idx < 0 || idx >= order.length) return null
    const w = order[idx]
    const id = w?.id
    if (!id) return null
    const fromStore = getWordById(id)
    const fromPool = activeWords.value.find((w2) => String(w2.id) === String(id) || Number(w2.id) === Number(id))
    return fromPool ?? fromStore ?? w
  })

  const prevWord = computed(() => {
    const idx = currentIndex.value - 1
    const order = sessionOrder.value
    if (idx < 0 || !order[idx]) return null
    const w = order[idx]
    const id = w?.id
    if (!id) return null
    const fromStore = getWordById(id)
    const fromPool = activeWords.value.find((w2) => String(w2.id) === String(id) || Number(w2.id) === Number(id))
    return fromPool ?? fromStore ?? w
  })

  const nextWord = computed(() => {
    const nextIdx = findNextValidIndex(currentIndex.value)
    if (nextIdx < 0) return null
    const w = sessionOrder.value[nextIdx]
    if (!w?.id) return null
    const fromStore = getWordById(w.id)
    const fromPool = activeWords.value.find((w2) => String(w2.id) === String(w.id) || Number(w2.id) === Number(w.id))
    return fromPool ?? fromStore ?? w
  })

  /** Display order: only words still in activeWords (for Swiper slides) */
  const displayOrder = computed(() => {
    const activeIds = new Set(activeWords.value.map((w) => String(w.id)))
    return sessionOrder.value.filter((w) => w && activeIds.has(String(w.id)))
  })

  /** Current index within displayOrder (for Swiper realIndex) */
  const displayIndex = computed(() => {
    const cur = currentWord.value
    if (!cur?.id) return 0
    const idx = displayOrder.value.findIndex((w) => String(w.id) === String(cur.id) || Number(w.id) === Number(cur.id))
    return idx >= 0 ? idx : 0
  })

  /** Advance to a specific display index (used when Swiper reports slideChange) */
  function advanceToDisplayIndex(idx) {
    const order = displayOrder.value
    if (idx < 0 || idx >= order.length) return false
    const w = order[idx]
    if (!w?.id) return false
    const soIdx = sessionOrder.value.findIndex((s) => String(s.id) === String(w.id) || Number(s.id) === Number(w.id))
    if (soIdx < 0) return false
    currentIndex.value = soIdx
    lastShownId.value = w.id
    return true
  }

  /** Sync store into activeWords and sessionOrder. After answer: status only (avoids overwriting content with stale placeholder). After refetch: full content. */
  function syncWordFromStore(wordId, options = {}) {
    const { fullContent = false } = options
    const fromStore = getWordById(wordId)
    if (!fromStore) return
    const idx = activeWords.value.findIndex((w) => String(w.id) === String(wordId) || Number(w.id) === Number(wordId))
    if (idx >= 0) {
      const current = activeWords.value[idx]
      const updated = fullContent
        ? { ...fromStore }
        : {
            ...current,
            consecutive_correct: fromStore.consecutive_correct,
            stage: fromStore.stage,
            cycle: fromStore.cycle,
            status: fromStore.status,
          }
      const aw = [...activeWords.value]
      aw[idx] = updated
      activeWords.value = aw
    }
    const orderIdx = sessionOrder.value.findIndex((w) => String(w.id) === String(wordId) || Number(w.id) === Number(wordId))
    if (orderIdx >= 0) {
      const current = sessionOrder.value[orderIdx]
      const updatedOrder = fullContent
        ? { ...fromStore }
        : {
            ...current,
            consecutive_correct: fromStore.consecutive_correct,
            stage: fromStore.stage,
            cycle: fromStore.cycle,
            status: fromStore.status,
          }
      const so = [...sessionOrder.value]
      so[orderIdx] = updatedOrder
      sessionOrder.value = so
    }
  }

  /** Find next valid index in sessionOrder (skip words no longer in activeWords) */
  function findNextValidIndex(fromIndex) {
    const order = sessionOrder.value
    const activeIds = new Set(activeWords.value.map((w) => String(w.id)))
    for (let i = fromIndex + 1; i < order.length; i++) {
      const w = order[i]
      if (w && activeIds.has(String(w.id))) return i
    }
    return -1
  }

  async function startSession() {
    const pool = await getActivePool()
    if (pool.length === 0) return 'done_today'

    const normalizedPool = pool.map(normalizeWord)
    const seenIds = new Set()
    const dedupedPool = normalizedPool.filter((w) => {
      const k = String(w.id)
      if (seenIds.has(k)) return false
      seenIds.add(k)
      return true
    })
    const allWords = getWords()
    const distractors = allWords
      .filter((w) => (w.stage1_definitions ?? []).some((d) => d.is_correct))
      .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
      .slice(0, 20)

    activeWords.value = dedupedPool
    sessionOrder.value = shuffleArray(dedupedPool)
    currentIndex.value = 0
    distractorPool.value = distractors
    totalAtStart.value = dedupedPool.length
    correct.value = 0
    answeredCount.value = 0
    lastShownId.value = null
    lastS3WasCorrect.value = undefined
    sessionDone.value = false

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
    const nextIdx = findNextValidIndex(currentIndex.value)
    if (nextIdx < 0) {
      sessionDone.value = true
      recordSession(answeredCount.value, correct.value)
      return false
    }
    currentIndex.value = nextIdx
    const nextWord = sessionOrder.value[nextIdx]
    if (nextWord) lastShownId.value = nextWord.id
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
    sessionOrder,
    currentIndex,
    displayOrder,
    displayIndex,
    prevWord,
    nextWord,
    advanceToDisplayIndex,
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
