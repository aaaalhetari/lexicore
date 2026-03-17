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
        Sign in (Settings → Account) and words will be added automatically, or add some manually in Word List.
      </p>
      <p v-else>Come back tomorrow to continue with the next cycle.</p>
      <button v-if="stats.total === 0 && hasSupabase()" class="btn btn-secondary" style="margin-top:12px;width:100%" :disabled="generating" @click="currentUser ? generateWords() : $emit('goToSettings')">
        {{ generating ? 'Generating…' : (currentUser ? '☁️ Generate words from cloud' : '🔐 Sign in first (tap to go to Settings)') }}
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

    <!-- ACTIVE QUESTION -->
    <div v-else-if="phase === 'question' && currentWord" class="session-question-wrap">
      <div class="session-content">
      <div
        ref="swipeNextEl"
        class="stage-transition-wrap swipe-next-wrap"
        :class="{ 'can-swipe': !!feedback }"
      >
      <Transition name="slide-card" mode="out-in">
        <Stage1 v-if="(displayWord ?? currentWord)?.stage === 1" :key="(displayWord ?? currentWord)?.id + '-s1-' + questionKey + '-' + contentRefreshKey"
          :word="displayWord ?? currentWord" :distractorPool="distractorPool" :feedback="feedback"
          :sessionStats="sessionStats"
          @answered="onAnswered" @skip="onSkip" @content-generated="onContentGenerated" />
        <Stage2 v-else-if="(displayWord ?? currentWord)?.stage === 2" :key="(displayWord ?? currentWord)?.id + '-s2-' + questionKey + '-' + contentRefreshKey"
          :word="displayWord ?? currentWord" :feedback="feedback"
          :sessionStats="sessionStats"
          @answered="onAnswered" @skip="onSkip" @content-generated="onContentGenerated" />
        <Stage3 v-else-if="(displayWord ?? currentWord)?.stage === 3" :key="(displayWord ?? currentWord)?.id + '-s3-' + questionKey + '-' + contentRefreshKey"
          :word="displayWord ?? currentWord" :useCorrect="s3UseCorrect" :feedback="feedback"
          :sessionStats="sessionStats"
          @answered="onAnswered" @skip="onSkip" @content-generated="onContentGenerated" />
      </Transition>
      </div>
      <div v-if="feedback" class="swipe-next-hint">← swipe to next →</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, provide, nextTick } from 'vue'
import { useSession } from '../composables/useSession.js'
import { useAudio } from '../composables/useAudio.js'
import { useSwipe } from '../composables/useSwipe.js'
import { getData, getStats, downloadJSON, checkRefillNeeded, processRefillJobs, preloadTTS, explainSentence } from '../store/data.js'
import { hasSupabase } from '../lib/supabase.js'
import { getCurrentUser } from '../store/sync.js'
import Stage1 from './stage/Stage1.vue'
import Stage2 from './stage/Stage2.vue'
import Stage3 from './stage/Stage3.vue'

const emit = defineEmits(['end', 'goToSettings'])

const sessionAudio = useAudio()
provide('sessionAudio', sessionAudio)

const {
  activeWords, distractorPool, progressPct, remaining, totalAtStart,
  correct, answeredCount, currentWord, sessionDone,
  startSession, handleAnswer, advance, getS3Type, syncWordFromStore,
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
const swipeNextEl = ref(null)

const swipeNext = useSwipe({
  threshold: 50,
  onSwipeLeft: () => feedback.value && next(),
  onSwipeRight: () => feedback.value && next(),
  enabled: () => !!feedback.value && !nextLock.value,
})
const s3UseCorrect = ref(true)
const errorMessage = ref('')
const generating = ref(false)
const currentUser = ref(null)

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
    availableToday: stats.value?.availableToday ?? 0,
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

const dotsCount = computed(() => Math.min(required.value, 8))

// Use progressDisplay during feedback; else use displayWord/currentWord — keep display stable
const displayCount = computed(() =>
  feedback.value && progressDisplay.value ? progressDisplay.value.count : ((displayWord.value ?? currentWord.value)?.consecutive_correct ?? 0))
const displayRequired = computed(() =>
  feedback.value && progressDisplay.value ? progressDisplay.value.required : required.value)
const progressSegCount = computed(() => Math.min(displayRequired.value, 8))
const filledSegCount = computed(() => {
  const req = displayRequired.value
  const cnt = displayCount.value
  if (!req) return 0
  return Math.round((cnt / req) * progressSegCount.value)
})
watch(swipeNextEl, (el, prev) => {
  if (prev) swipeNext.unbind(prev)
  if (el) swipeNext.bind(el)
}, { immediate: true })

onUnmounted(() => {
  sessionAudio.stopAudio()
  swipeNext.unbind(swipeNextEl.value)
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

async function generateWords() {
  if (!hasSupabase()) return
  generating.value = true
  try {
    await checkRefillNeeded()
    let result = await processRefillJobs()
    if (result?.processed > 0) {
      for (let i = 0; i < 20; i++) {
        await checkRefillNeeded()
        result = await processRefillJobs()
        if (!result?.processed) break
      }
      phase.value = 'idle'
      const r = await startSession()
      if (r === 'started') phase.value = 'question'
      else phase.value = 'done_today'
    } else {
      alert('No pending jobs. Add words in Word List or wait for automatic refill.')
    }
  } catch (e) {
    alert('Generate failed: ' + (e?.message || e))
  } finally {
    generating.value = false
  }
}

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

function onContentGenerated(wordId) {
  syncWordFromStore(wordId, { fullContent: true })
  contentRefreshKey.value++
}

function next() {
  if (nextLock.value) return
  nextLock.value = true
  sessionAudio.stopAudio()
  feedback.value = null
  displayWord.value = null
  progressDisplay.value = null
  stage3Explanation.value = ''
  stage3ExplanationLoading.value = false
  const hasMore = advance()
  if (!hasMore) { phase.value = 'end'; nextLock.value = false; return }
  preloadTTS(currentWord.value)
  questionKey.value++
  if (currentWord.value?.stage === 3) s3UseCorrect.value = getS3Type()
  phase.value = 'question'
  nextTick(() => { nextLock.value = false })
}

function onSkip() {
  if (nextLock.value) return
  nextLock.value = true
  sessionAudio.stopAudio()
  feedback.value = null
  displayWord.value = null
  const hasMore = advance()
  if (!hasMore) { phase.value = 'end'; nextLock.value = false; return }
  preloadTTS(currentWord.value)
  questionKey.value++
  if (currentWord.value?.stage === 3) s3UseCorrect.value = getS3Type()
  phase.value = 'question'
  nextTick(() => { nextLock.value = false })
}
</script>

<style scoped>
/* Session question layout (thumb-friendly) */
.session-fill { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.session-question-wrap {
  display: flex; flex-direction: column; min-height: 0; flex: 1;
  overflow: hidden;
  padding-bottom: env(safe-area-inset-bottom, 0);
}
.session-content {
  flex: 1; min-height: 0; overflow: hidden;
  display: flex; flex-direction: column;
}
.stage-transition-wrap {
  flex: 1; min-height: 0; overflow: hidden;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: var(--sp);
}
.stage-transition-wrap > * {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  width: 100%;
}
.session-content :deep(.card) {
  width: 100%;
  min-height: 320px;
  padding: calc(var(--sp) * 1.1);
  margin: 0 auto;
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
.swipe-next-wrap {
  touch-action: pan-y;
}
.swipe-next-hint {
  flex-shrink: 0;
  padding: 8px var(--sp);
  font-size: 0.85rem;
  color: var(--text3);
  text-align: center;
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

.icon-btn {
  background: var(--surface2); border: 1px solid var(--border);
  color: var(--text2);
  width: var(--tap);
  height: var(--tap);
  border-radius: var(--radius-sm);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  font-size: var(--icon);
  transition: all 0.2s;
}
.icon-btn:hover { border-color: var(--red); color: var(--red); }

.stage-transition-wrap {
  min-height: 320px;
  position: relative;
}
</style>
