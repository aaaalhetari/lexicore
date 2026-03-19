<template>
  <div :class="{ 'session-fill': phase === 'question' && currentWord }">
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
      <p v-else>Come back tomorrow to continue with the next cycle.</p>
      <button v-if="stats.total === 0 && hasSupabase()" class="btn btn-secondary" style="margin-top:12px;width:100%" @click="$emit('goToSettings')">
        🔐 Sign in (Settings → Account)
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
      <div class="session-content">
        <Swiper
          :key="'swiper-' + displayOrder.length"
          :modules="[FreeMode]"
          class="session-swiper"
          direction="vertical"
          :slides-per-view="1"
          :space-between="16"
          :initial-slide="displayIndex"
          :speed="300"
          :free-mode="{
            enabled: true,
            sticky: true,
            momentum: true,
            momentumBounce: false,
            momentumRatio: 1.08,
            momentumVelocityRatio: 1.45,
            minimumVelocity: 0.22,
          }"
          :threshold="8"
          :long-swipes-ratio="0.28"
          :long-swipes-ms="240"
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
import { FreeMode } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/free-mode'
import { useSession } from '../composables/useSession.js'
import { useAudio } from '../composables/useAudio.js'
import { getData, getStats, downloadJSON, preloadTTS, explainSentence } from '../store/data.js'
import { hasSupabase } from '../lib/supabase.js'
import { getCurrentUser } from '../store/sync.js'
import Stage1 from './stage/Stage1.vue'
import Stage2 from './stage/Stage2.vue'
import Stage3 from './stage/Stage3.vue'

const emit = defineEmits(['end', 'goToSettings'])

const sessionAudio = useAudio()
provide('sessionAudio', sessionAudio)

const {
  activeWords, sessionOrder, currentIndex, displayOrder, displayIndex, prevWord, nextWord,
  distractorPool, progressPct, remaining, totalAtStart,
  correct, answeredCount, currentWord, sessionDone,
  startSession, handleAnswer, advance, advanceToDisplayIndex, getS3Type, syncWordFromStore,
} = useSession()

const completedCount = computed(() => Math.max(0, (totalAtStart?.value ?? 0) - (remaining?.value ?? 0)))
const accuracyPct = computed(() => {
  const ans = answeredCount?.value ?? 0
  const cor = correct?.value ?? 0
  return ans > 0 ? Math.round((cor / ans) * 100) : 0
})

const phase       = ref('idle')
const feedback    = ref(null)
const displayWord  = ref(null) // frozen snapshot while feedback shown (prevents realtime from advancing before Continue)
const answeringLock = ref(false) // prevents double-processing answers
const nextLock     = ref(false) // prevents double-click Continue / racing cards
const progressDisplay = ref(null) // { count, required } when showing feedback — avoids realtime delay
const stage3Explanation = ref('')
const stage3ExplanationLoading = ref(false)
const questionKey  = ref(0)
const contentRefreshKey = ref(0)
const swiperRef = ref(null)
const s3UseCorrect = ref(true)
const errorMessage = ref('')
const currentUser = ref(null)
const learningTargetIndex = ref(0)

const stats = computed(() => getStats())
const masteredCount = computed(() => getData().words.filter(w => w.status === 'mastered').length)

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
    todayAnswered: (stats.value?.todayAnswered ?? 0) + ans,
    eligibleToday: stats.value?.eligibleToday ?? 0,
    sessionLimit: stats.value?.sessionLimit ?? 50,
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
  preloadTTS(currentWord.value)
  questionKey.value++
  if (currentWord.value?.stage === 3) s3UseCorrect.value = getS3Type()
  nextTick(() => { nextLock.value = false })
}

// شبكة أمان: إذا انتهت الكلمات أثناء phase=question (مثلاً بعد إزالة آخر كلمة)، انتقل لشاشة النهاية
watch([() => phase.value, currentWord, displayOrder], () => {
  if (phase.value === 'question' && displayOrder.value.length === 0) {
    phase.value = 'end'
  }
}, { immediate: true })

onUnmounted(() => {
  sessionAudio.stopAudio()
})

onMounted(async () => {
  try {
    currentUser.value = await getCurrentUser()
    const result = await startSession()
    if (result === 'done_today' || result === 'no_words') { phase.value = 'done_today'; return }
    if (currentWord.value?.stage === 3) s3UseCorrect.value = getS3Type()
    preloadTTS(currentWord.value)
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
    const sentArr = s3UseCorrect.value ? (wordSnapshot.stage3_correct ?? []) : (wordSnapshot.stage3_incorrect ?? [])
    const sentence = (typeof sentArr[0] === 'string' ? sentArr[0] : String(sentArr[0] ?? '')).trim()
    if (stored) {
      stage3Explanation.value = stored
    } else {
      // No API call — use fallback. AI generates only when user clicks "☁️ AI explain"
      stage3Explanation.value = getFallbackExplanation(wordSnapshot, s3UseCorrect.value)
    }
  }
  const settings = getData().settings
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

async function retryExplanation() {
  const w = displayWord.value
  if (!w || w.stage !== 3 || stage3ExplanationLoading.value) return
  const sentArr = s3UseCorrect.value ? (w.stage3_correct ?? []) : (w.stage3_incorrect ?? [])
  const sentence = (typeof sentArr[0] === 'string' ? sentArr[0] : String(sentArr[0] ?? '')).trim()
  if (!sentence) {
    stage3Explanation.value = getFallbackExplanation(w, s3UseCorrect.value)
    return
  }
  stage3ExplanationLoading.value = true
  stage3Explanation.value = ''
  try {
    const user = currentUser.value ?? (await getCurrentUser())
    const text = user ? await explainSentence(user.id, w.word ?? '', sentence, s3UseCorrect.value) : null
    stage3Explanation.value = text ?? getFallbackExplanation(w, s3UseCorrect.value)
  } catch {
    stage3Explanation.value = getFallbackExplanation(w, s3UseCorrect.value)
  } finally {
    stage3ExplanationLoading.value = false
  }
}

async function onContentGenerated(wordId) {
  syncWordFromStore(wordId, { fullContent: true })
  await nextTick()
  contentRefreshKey.value++
}

function next() {
  if (nextLock.value) return
  nextLock.value = true
  doNextCleanup()
  const hasMore = advance()
  if (!hasMore) { phase.value = 'end'; nextLock.value = false; return }
  learningTargetIndex.value = displayIndex.value
  if (swiperRef.value && !swiperRef.value.destroyed) {
    swiperRef.value.slideTo(displayIndex.value)
  }
  preloadTTS(currentWord.value)
  questionKey.value++
  if (currentWord.value?.stage === 3) s3UseCorrect.value = getS3Type()
  phase.value = 'question'
  nextTick(() => { nextLock.value = false })
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
  preloadTTS(currentWord.value)
  questionKey.value++
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
.stage-transition-wrap {
  flex: 1;
  min-height: min(560px, 80vh);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--sp);
  width: 100%;
  position: relative;
}
.stage-transition-wrap > * {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  width: 100%;
}
.session-content :deep(.card) {
  width: 100%;
  max-width: 100%;
  min-height: min(560px, 80vh);
  padding: calc(var(--sp) * 1.1);
  margin: 0 auto;
  box-sizing: border-box;
}
.session-content :deep(.definition-text) {
  display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical;
  overflow: hidden; line-height: 1.5;
}
.session-content :deep(.stage3-sentence) {
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
  overflow: hidden; line-height: 1.5;
}
.session-content :deep(.stage1-root),
.session-content :deep(.stage2-root),
.session-content :deep(.stage3-root) {
  width: 100%;
  margin: 0 auto;
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
  align-items: center;
  justify-content: center;
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

/* Slide card transition — smooth professional animation */
.slide-card-enter-active,
.slide-card-leave-active {
  transition: all 0.35s cubic-bezier(0.32, 0.72, 0, 1);
}
.slide-card-enter-from {
  opacity: 0;
  transform: translateX(60px);
}
.slide-card-leave-to {
  opacity: 0;
  transform: translateX(-60px);
}
.slide-card-enter-to,
.slide-card-leave-from {
  opacity: 1;
  transform: translateX(0);
}

.big-emoji { font-size: calc(var(--icon) * 2.2); margin-bottom: calc(var(--sp) * 0.8); }

.idle-msg { text-align: center; padding: calc(var(--sp) * 3) 0; }
.idle-msg h2 { font-family: 'Fraunces', serif; font-size: 1.7rem; color: var(--gold2); margin-bottom: 12px; }
.idle-msg p { color: var(--text2); }
.error-detail { font-family: 'JetBrains Mono', monospace; font-size: 0.9rem; color: var(--red); margin: 12px 0; }
.error-hint { font-size: 0.9rem; color: var(--text3); }

.session-end { text-align: center; padding: calc(var(--sp) * 2.4) 0; }
.session-end h2 { font-family: 'Fraunces', serif; font-size: 2.1rem; color: var(--gold2); margin-bottom: 12px; }
.session-end p { color: var(--text2); margin-bottom: 28px; }
.end-stats { display: grid; grid-template-columns: repeat(3,1fr); gap: var(--sp); margin-bottom: calc(var(--sp) * 2); }
.end-stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: calc(var(--sp) * 1.2) calc(var(--sp) * 0.9); }
.end-stat .num { font-family: 'JetBrains Mono', monospace; font-size: 1.9rem; color: var(--gold); }
.end-stat .lbl { font-size: 0.85rem; color: var(--text3); margin-top: 4px; }

</style>
