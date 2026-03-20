<template>
  <div :class="{ 'session-fill': phase === 'question' && currentWord }">
    <div class="sr-only" aria-live="polite" aria-atomic="true">{{ feedbackLive }}</div>
    <!-- SESSION NOT STARTED -->
    <div v-if="phase === 'idle'" class="idle-msg">
      <p>Starting session...</p>
    </div>

    <!-- ERROR -->
    <div v-else-if="phase === 'error'" class="idle-msg">
      <div class="big-emoji">⚠️</div>
      <h2>Something went wrong</h2>
      <p class="error-detail">{{ errorMessage }}</p>
      <p class="error-hint">Check that migrations ran and Supabase is configured.</p>
      <button class="btn btn-primary" style="margin-top:24px;width:100%" @click="$emit('end')">Back Home</button>
    </div>

    <!-- NO WORDS / ALL DONE TODAY -->
    <div v-else-if="phase === 'done_today'" class="idle-msg">
      <div class="big-emoji">{{ stats.total === 0 ? '📚' : '🌙' }}</div>
      <h2>{{ stats.total === 0 ? 'No words yet' : 'All done for today!' }}</h2>
      <p v-if="stats.total === 0 && !hasSupabase()">
        Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env, then sign in (Settings → Account).
      </p>
      <p v-else-if="stats.total === 0">
        Sign in (Settings → Account). Words are generated on the server. Try again later or add some manually in Word List.
      </p>
      <p v-else>You’ve finished today’s queue. Come back tomorrow for the next cycle, or browse your words anytime.</p>
      <button v-if="stats.total === 0 && hasSupabase()" class="btn btn-secondary" style="margin-top:12px;width:100%" @click="$emit('goToSettings')">
        🔐 Sign in (Settings → Account)
      </button>
      <button v-if="hasSupabase()" class="btn btn-secondary" style="margin-top:12px;width:100%" @click="$emit('goToWords')">
        📖 Word list
      </button>
      <button class="btn btn-primary" style="margin-top:12px;width:100%" @click="$emit('end')">Back Home</button>
    </div>

    <!-- SESSION END -->
    <div v-else-if="phase === 'end'" class="session-end">
      <div class="big-emoji">✨</div>
      <h2>Session Complete</h2>
      <p>All words for today are done. Come back tomorrow!</p>
      <div class="end-stats">
        <div class="end-stat"><div class="num">{{ answeredCount }}</div><div class="lbl">Answers</div></div>
        <div class="end-stat"><div class="num">{{ correct }}</div><div class="lbl">Correct</div></div>
        <div class="end-stat"><div class="num">{{ masteredCount }}</div><div class="lbl">Mastered</div></div>
      </div>
      <div class="btn-row" style="justify-content:center;gap:14px">
        <button class="btn btn-primary" @click="downloadJSON">⬇ Save JSON</button>
        <button class="btn btn-secondary" @click="$emit('end')">Back Home</button>
      </div>
    </div>

    <!-- ACTIVE QUESTION - Swiper owns the full carousel -->
    <div v-else-if="phase === 'question' && currentWord" class="session-question-wrap">
      <div class="session-content" @wheel.capture="onSessionWheel" @touchstart.capture="onSessionTouchStart" @touchmove.capture="onSessionTouchMove">
        <!-- Vertical one-card navigation; long text uses .no-swipe-scroll areas -->
        <Swiper
          :key="'swiper-' + displayOrder.length"
          :modules="[Mousewheel]"
          class="session-swiper"
          direction="vertical"
          :slides-per-view="1"
          :space-between="16"
          :initial-slide="displayIndex"
          :speed="320"
          :simulate-touch="true"
          :allow-touch-move="true"
          :mousewheel="{
            forceToAxis: true,
            sensitivity: 1,
            releaseOnEdges: false,
          }"
          @swiper="onSwiper"
          @touch-start="onSwiperTouchStart"
          @slide-change="onSlideChange"
        >
          <SwiperSlide
            v-for="(word, idx) in displayOrder"
            :key="'slide-' + (word?.id ?? idx)"
            :class="['session-slide', { 'slide-target': idx === learningTargetIndex }]"
          >
            <div class="slide-inner">
              <Stage1
                v-if="((idx === displayIndex ? (displayWord ?? currentWord) : word)?.stage ?? 1) === 1"
                :key="'s1-' + (word?.id ?? idx) + '-' + contentRefreshKey"
                :word="idx === displayIndex ? (displayWord ?? currentWord) : word"
                :distractorPool="distractorPool"
                :feedback="idx === displayIndex ? feedback : null"
                :sessionStats="idx === displayIndex ? sessionStats : null"
                @answered="onAnswered"
                @skip="onSkip"
                @content-generated="onContentGenerated"
              />
              <Stage2
                v-else-if="(idx === displayIndex ? (displayWord ?? currentWord) : word)?.stage === 2"
                :key="'s2-' + (word?.id ?? idx) + '-' + contentRefreshKey"
                :word="idx === displayIndex ? (displayWord ?? currentWord) : word"
                :feedback="idx === displayIndex ? feedback : null"
                :sessionStats="idx === displayIndex ? sessionStats : null"
                @answered="onAnswered"
                @skip="onSkip"
                @content-generated="onContentGenerated"
              />
              <Stage3
                v-else-if="(idx === displayIndex ? (displayWord ?? currentWord) : word)?.stage === 3"
                :key="'s3-' + (word?.id ?? idx) + '-' + contentRefreshKey"
                :word="idx === displayIndex ? (displayWord ?? currentWord) : word"
                :useCorrect="s3UseCorrect"
                :feedback="idx === displayIndex ? feedback : null"
                :sessionStats="idx === displayIndex ? sessionStats : null"
                :stage3Explanation="idx === displayIndex ? stage3Explanation : ''"
                :stage3ExplanationLoading="idx === displayIndex ? stage3ExplanationLoading : false"
                @answered="onAnswered"
                @skip="onSkip"
                @content-generated="onContentGenerated"
                @retry-explanation="retryExplanation"
              />
            </div>
          </SwiperSlide>
        </Swiper>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, provide, nextTick } from 'vue'
import { Swiper, SwiperSlide } from 'swiper/vue'
import { Mousewheel } from 'swiper/modules'
import 'swiper/css'
import { useSession } from '../composables/useSession.js'
import { useAudio, collectSessionAudioUrls } from '../composables/useAudio.js'
import { getData, getStats, downloadJSON, explainSentence } from '../store/data.js'
import { hasSupabase } from '../lib/supabase.js'
import { getCurrentUser } from '../store/sync.js'
import { requestQuickResync, refetchWord } from '../store/realtime.js'
import Stage1 from './stage/Stage1.vue'
import Stage2 from './stage/Stage2.vue'
import Stage3 from './stage/Stage3.vue'

const emit = defineEmits(['end', 'goToSettings', 'goToWords'])

const sessionAudio = useAudio()
provide('sessionAudio', sessionAudio)

const {
  displayOrder, displayIndex, distractorPool, remaining, totalAtStart,
  correct, answeredCount, currentWord,
  startSession, handleAnswer, advance, advanceToDisplayIndex, getS3Type, syncWordFromStore,
} = useSession()

const phase       = ref('idle')
const feedback    = ref(null)
const displayWord  = ref(null) // frozen snapshot while feedback shown (prevents realtime from advancing before Continue)
const answeringLock = ref(false) // prevents double-processing answers
const nextLock     = ref(false) // prevents double-click Continue / racing cards
const progressDisplay = ref(null) // { count, required } when showing feedback — avoids realtime delay
const stage3Explanation = ref('')
const stage3ExplanationLoading = ref(false)
const contentRefreshKey = ref(0)
const swiperRef = ref(null)
const s3UseCorrect = ref(true)
const errorMessage = ref('')
const currentUser = ref(null)
const learningTargetIndex = ref(0)
const touchScrollState = ref({ scrollBox: null, startY: 0, startScrollTop: 0 })

const stats = computed(() => getStats())
const masteredCount = computed(() => stats.value.mastered ?? 0)

const feedbackLive = computed(() => {
  const t = feedback.value?.text
  return typeof t === 'string' && t.trim() ? t : ''
})

const sessionStats = computed(() => {
  const ans = answeredCount.value ?? 0
  const cor = correct.value ?? 0
  return {
    remaining: remaining.value,
    total: totalAtStart.value,
    correct: cor,
    wrong: ans - cor,
    answered: ans,
    accuracyPct: ans > 0 ? Math.round((cor / ans) * 100) : 0,
    displayCount: displayCount.value,
    displayRequired: displayRequired.value,
    cycle: (displayWord.value ?? currentWord.value)?.cycle,
    stage: (displayWord.value ?? currentWord.value)?.stage,
    onClose: () => { sessionAudio.stopAudio(); emit('end') },
  }
})

const required = computed(() => {
  const w = displayWord.value ?? currentWord.value
  if (!w) return 4
  const c = w.cycle || 1
  const s = w.stage ?? 1
  return getData().settings[`cycle_${c}`]?.[`stage_${s}_required`] || 4
})

// Use progressDisplay during feedback; else use displayWord/currentWord — keep display stable
const displayCount = computed(() =>
  feedback.value && progressDisplay.value ? progressDisplay.value.count : ((displayWord.value ?? currentWord.value)?.consecutive_correct ?? 0))
const displayRequired = computed(() =>
  feedback.value && progressDisplay.value ? progressDisplay.value.required : required.value)

function onSwiper(swiper) {
  swiperRef.value = swiper
}

function onSwiperTouchStart() {
  if (feedback.value) sessionAudio.stopAudio()
}

function onSessionTouchStart(e) {
  const target = e?.target
  if (!(target instanceof Element)) return
  const scrollBox = target.closest('.no-swipe-scroll')
  if (!scrollBox) {
    touchScrollState.value = { scrollBox: null, startY: 0, startScrollTop: 0 }
    return
  }
  const t = e.touches?.[0]
  if (!t) return
  touchScrollState.value = {
    scrollBox,
    startY: t.clientY,
    startScrollTop: scrollBox.scrollTop,
  }
}

function onSessionTouchMove(e) {
  const state = touchScrollState.value
  const scrollBox = state.scrollBox
  if (!scrollBox || !e.touches?.[0]) return
  const scrollHeight = scrollBox.scrollHeight
  const clientHeight = scrollBox.clientHeight
  const canScroll = scrollHeight - clientHeight > 1
  if (!canScroll) return
  const deltaY = e.touches[0].clientY - state.startY
  const atTop = scrollBox.scrollTop <= 0
  const atBottom = scrollBox.scrollTop + clientHeight >= scrollHeight - 1
  const swipingUp = deltaY < 0
  const swipingDown = deltaY > 0
  const atBoundaryAndSwipingOut = (atTop && swipingDown) || (atBottom && swipingUp)
  if (atBoundaryAndSwipingOut) return
  scrollBox.scrollTop = Math.max(0, Math.min(scrollHeight - clientHeight, state.startScrollTop + deltaY))
  e.preventDefault()
  e.stopPropagation()
}

function onSessionWheel(event) {
  const target = event?.target
  if (!(target instanceof Element)) return
  // Wheel logic:
  // - If cursor is over a long-text box (.no-swipe-scroll), scroll text first.
  // - At top/bottom edge (or when text is short), let Swiper handle wheel for card navigation.
  const scrollBox = target.closest('.no-swipe-scroll')
  if (!scrollBox) return
  const scrollHeight = scrollBox.scrollHeight
  const clientHeight = scrollBox.clientHeight
  const canScrollInside = scrollHeight - clientHeight > 1
  if (!canScrollInside) return

  const deltaY = Number(event.deltaY) || 0
  if (deltaY === 0) return
  const atTop = scrollBox.scrollTop <= 0
  const atBottom = scrollBox.scrollTop + clientHeight >= scrollHeight - 1
  const movingDown = deltaY > 0
  const movingUp = deltaY < 0
  const shouldPassToSwiper = (movingDown && atBottom) || (movingUp && atTop)
  if (shouldPassToSwiper) return

  scrollBox.scrollTop += deltaY
  event.preventDefault()
  event.stopPropagation()
}

function doNextCleanup() {
  sessionAudio.stopAudio()
  feedback.value = null
  displayWord.value = null
  progressDisplay.value = null
  stage3Explanation.value = ''
  stage3ExplanationLoading.value = false
}

function onSlideChange(swiper) {
  const realIndex = swiper.realIndex
  if (nextLock.value) return
  nextLock.value = true
  const hadFeedback = !!feedback.value
  doNextCleanup()
  advanceToDisplayIndex(realIndex)
  if (hadFeedback && realIndex > learningTargetIndex.value) {
    learningTargetIndex.value = realIndex
  }
  if (currentWord.value?.stage === 3) s3UseCorrect.value = getS3Type()
  nextTick(() => { nextLock.value = false })
}

// شبكة أمان: إذا انتهت الكلمات أثناء phase=question (مثلاً بعد إزالة آخر كلمة)، انتقل لشاشة النهاية
watch([() => phase.value, currentWord, displayOrder], () => {
  if (phase.value === 'question' && displayOrder.value.length === 0) {
    phase.value = 'end'
  }
}, { immediate: true })

/** Warm HTTP cache for current + adjacent slides so audio starts fast when flipping quickly. */
watch(
  () => [phase.value, displayIndex.value, displayOrder.value],
  () => {
    if (phase.value !== 'question') return
    const order = displayOrder.value
    const i = displayIndex.value
    if (!order?.length) return
    const urls = []
    for (const j of [i - 1, i, i + 1]) {
      if (j < 0 || j >= order.length) continue
      urls.push(...collectSessionAudioUrls(order[j]))
    }
    sessionAudio.prefetchAudioUrls(urls)
  },
  { immediate: true, deep: true },
)

onUnmounted(() => {
  sessionAudio.stopAudio()
})

onMounted(async () => {
  try {
    currentUser.value = await getCurrentUser()
    const result = await startSession()
    if (result === 'done_today' || result === 'no_words') { phase.value = 'done_today'; return }
    if (currentWord.value?.stage === 3) s3UseCorrect.value = getS3Type()
    phase.value = 'question'
  } catch (err) {
    console.error('Session start failed:', err)
    errorMessage.value = err?.message || String(err)
    phase.value = 'error'
  }
})

async function onAnswered(isCorrect) {
  if (answeringLock.value) return
  answeringLock.value = true
  const wordSnapshot = currentWord.value ? JSON.parse(JSON.stringify(currentWord.value)) : null
  displayWord.value = wordSnapshot // freeze display before handleAnswer — prevents wrong question showing
  // Optimistic feedback — card color immediately on press
  feedback.value = { type: isCorrect ? 'correct' : 'wrong', text: '' }
  let result
  try {
    result = await handleAnswer(isCorrect)
  } finally {
    answeringLock.value = false
  }
  if (!result) return
  // Keep global stats in sync immediately after each answer.
  requestQuickResync(120)
  // إذا انتهت كل الكلمات، انتقل مباشرة لشاشة النهاية
  if (remaining.value === 0) {
    phase.value = 'end'
    return
  }
  stage3Explanation.value = ''
  stage3ExplanationLoading.value = false
  if (wordSnapshot?.stage === 3) {
    const explArr = s3UseCorrect.value
      ? (wordSnapshot.stage3_explanations_correct ?? [])
      : (wordSnapshot.stage3_explanations_incorrect ?? [])
    const stored = explArr[0]
    if (stored) {
      stage3Explanation.value = stored
    } else {
      // No API call — use fallback. AI generates only when user clicks "☁️ AI explain"
      stage3Explanation.value = getFallbackExplanation(wordSnapshot, s3UseCorrect.value)
    }
  }
  switch (result.type) {
    case 'correct':
      progressDisplay.value = { count: result.count ?? (wordSnapshot.consecutive_correct + 1), required: result.required ?? required.value }
      feedback.value = { type: 'correct', text: `✅ Correct! ${progressDisplay.value.count}/${progressDisplay.value.required}` }
      break
    case 'wrong':
      progressDisplay.value = { count: 0, required: required.value }
      feedback.value = { type: 'wrong', text: '❌ Incorrect — counter reset. Keep going!' }
      break
    case 'stage_advance': {
      // Show completed count (e.g. 2/2) not 0 — user just finished this stage
      const completedReq = required.value
      progressDisplay.value = { count: completedReq, required: completedReq }
      feedback.value = { type: 'correct', text: `✅ Correct! Moving to Stage ${result.stage}` }
      break
    }
    case 'cycle_complete': {
      // Show completed count for the stage we just finished
      const completedReq = required.value
      progressDisplay.value = { count: completedReq, required: completedReq }
      const n = remaining.value ?? 0
      feedback.value = { type: 'correct', text: `🎉 Cycle ${result.cycle} complete! ${n} word${n !== 1 ? 's' : ''} remaining today.` }
      break
    }
    case 'mastered':
      sessionAudio.stopAudio()
      progressDisplay.value = { count: required.value, required: required.value }
      feedback.value = { type: 'correct', text: '🎉 Mastered! Well done.' }
      stage3Explanation.value = ''
      break
  }
}

function getFallbackExplanation(wordObj, sentenceIsCorrect) {
  const w = (wordObj?.word ?? 'the word').trim() || 'the word'
  const defs = wordObj?.stage1_definitions ?? []
  const correctDef = defs.find((d) => d.is_correct)
  const def = (correctDef?.definition ?? '').trim()
  if (sentenceIsCorrect) {
    return def
      ? `The sentence is correct: "${w}" means ${def}. Here it is used in the right context and conveys that meaning properly.`
      : `The sentence is correct: "${w}" is used properly in this context.`
  }
  return def
    ? `The sentence is incorrect: "${w}" means ${def}. The error could be wrong part of speech (e.g. advice=noun vs advise=verb), wrong meaning, or wrong grammar.`
    : `The sentence is incorrect: "${w}" is misused here — check part of speech, meaning, and grammar.`
}

async function retryExplanation(payload) {
  const payloadWord = payload?.word ?? payload
  const w = displayWord.value ?? payloadWord ?? currentWord.value
  if (!w || stage3ExplanationLoading.value) return
  const isCorrect = typeof payload?.isCorrect === 'boolean' ? payload.isCorrect : s3UseCorrect.value
  const sentArr = isCorrect ? (w.stage3_correct ?? []) : (w.stage3_incorrect ?? [])
  const candidateFromPayload = String(payload?.sentence ?? '').trim()
  const sentenceFromWord = (typeof sentArr[0] === 'string' ? sentArr[0] : String(sentArr[0] ?? '')).trim()
  const sentence = candidateFromPayload || sentenceFromWord
  if (!sentence) {
    stage3Explanation.value = getFallbackExplanation(w, isCorrect)
    return
  }
  stage3ExplanationLoading.value = true
  stage3Explanation.value = ''
  try {
    const user = currentUser.value ?? (await getCurrentUser())
    if (!user?.id) {
      throw new Error('Please sign in first')
    }
    const text = await explainSentence(user.id, w.id, w.word ?? '', sentence, isCorrect)
    stage3Explanation.value = text ?? getFallbackExplanation(w, isCorrect)
    await refetchWord(w.id, user.id)
  } catch (err) {
    stage3Explanation.value = `AI explanation failed to save: ${err?.message ?? 'Unknown error'}`
  } finally {
    stage3ExplanationLoading.value = false
  }
}

async function onContentGenerated(wordId) {
  syncWordFromStore(wordId, { fullContent: true })
  await nextTick()
  contentRefreshKey.value++
}

function onSkip() {
  if (nextLock.value) return
  nextLock.value = true
  doNextCleanup()
  const hasMore = advance()
  if (!hasMore) { phase.value = 'end'; nextLock.value = false; return }
  learningTargetIndex.value = displayIndex.value
  if (swiperRef.value && !swiperRef.value.destroyed) {
    swiperRef.value.slideTo(displayIndex.value)
  }
  if (currentWord.value?.stage === 3) s3UseCorrect.value = getS3Type()
  phase.value = 'question'
  nextTick(() => { nextLock.value = false })
}
</script>

<style scoped>
/* Session question layout (thumb-friendly) */
.session-fill { display: flex; flex-direction: column; flex: 1; min-height: 0; height: 100%; }
.session-question-wrap {
  display: flex; flex-direction: column; min-height: 0; flex: 1; height: 100%;
  overflow: hidden;
  padding-bottom: env(safe-area-inset-bottom, 0);
}
.session-content {
  flex: 1; min-height: 0; height: 100%; overflow: hidden;
  display: flex; flex-direction: column;
}
.session-content :deep(.card) {
  width: 100%;
  max-width: 100%;
  height: 100%;
  min-height: 0;
  padding: calc(var(--sp) * 1.1);
  margin: 0 auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.session-content :deep(.definition-text) {
  line-height: 1.5;
}
.session-content :deep(.stage3-sentence) {
  line-height: 1.5;
}
.session-content :deep(.no-swipe-scroll) {
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  pointer-events: auto;
  scrollbar-gutter: stable;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
}
.session-content :deep(.card-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  margin-bottom: 8px;
}
.session-content :deep(.stage1-root),
.session-content :deep(.stage2-root),
.session-content :deep(.stage3-root) {
  width: 100%;
  margin: 0 auto;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* Swiper: fixed height prevents jump when switching between tall/short cards */
.session-swiper {
  flex: 1;
  height: 100%;
  min-height: 0;
  width: 100%;
  overflow: hidden;
}
.session-swiper :deep(.swiper-wrapper) {
  height: 100%;
  align-items: stretch;
}
.session-swiper :deep(.swiper-slide) {
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
}
.slide-inner {
  width: 100%;
  height: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: stretch;
  overflow: hidden;
}
.session-swiper :deep(.slide-inner .card) {
  width: 100%;
  max-width: 100%;
  flex-shrink: 0;
}

/* البطاقة المستهدفة واضحة، الباقي أغمق قليلاً */
.session-swiper :deep(.swiper-slide:not(.slide-target)) {
  opacity: 0.6;
}

.big-emoji { font-size: calc(var(--icon) * 2.5); margin-bottom: calc(var(--sp) * 1); }

.idle-msg {
  text-align: center;
  padding: calc(var(--sp) * 3) calc(var(--sp) * 1.2);
}
.idle-msg h2 {
  font-family: 'Fraunces', serif;
  font-size: clamp(1.5rem, 1.4vmin + 1rem, 2rem);
  background: linear-gradient(135deg, var(--gold2), var(--gold));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 14px;
}
.idle-msg p { color: var(--text2); line-height: 1.55; }
.error-detail {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  color: var(--red);
  margin: 14px 0;
  padding: 10px 14px;
  background: linear-gradient(160deg, rgba(224, 92, 92, 0.1), transparent 50%);
  border: 1px solid rgba(224, 92, 92, 0.2);
  border-radius: var(--radius-sm);
}
.error-hint { font-size: 0.9rem; color: var(--text3); }

.session-end {
  text-align: center;
  padding: calc(var(--sp) * 2.4) calc(var(--sp) * 1.2);
}
.session-end h2 {
  font-family: 'Fraunces', serif;
  font-size: clamp(1.7rem, 2vmin + 1rem, 2.5rem);
  background: linear-gradient(135deg, var(--gold2), var(--gold));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 14px;
}
.session-end p { color: var(--text2); margin-bottom: 28px; line-height: 1.55; }
.end-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp);
  margin-bottom: calc(var(--sp) * 2);
}
.end-stat {
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.03), transparent 35%), var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: calc(var(--sp) * 1.3) calc(var(--sp) * 1);
  box-shadow: var(--shadow-sm);
}
.end-stat .num {
  font-family: 'JetBrains Mono', monospace;
  font-size: clamp(1.5rem, 2vmin + 0.8rem, 2.2rem);
  background: linear-gradient(135deg, var(--gold2), var(--gold));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  font-weight: 700;
}
.end-stat .lbl { font-size: 0.82rem; color: var(--text3); margin-top: 6px; }

</style>
