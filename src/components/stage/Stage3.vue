<template>
  <div class="stage3-root">
    <div v-if="isPlaceholder" class="card placeholder-only">
      <div class="card-toolbar">
        <button class="toolbar-btn generate" :disabled="generating" @click="onGenerateComplete" title="Generate content">
          {{ generating ? '⏳' : '☁️' }}
        </button>
        <button class="toolbar-btn play" @click.stop="onPlayClick" title="Play" :disabled="isMuted">🔊</button>
        <button class="toolbar-btn mute" @click.stop="toggleMute" :title="isMuted ? 'Unmute' : 'Mute'">
          {{ isMuted ? '🔇' : '🔈' }}
        </button>
        <button v-if="sessionStats" class="toolbar-btn exit" @click.stop="sessionStats.onClose?.()" title="Exit">✕</button>
      </div>
      <div class="placeholder-warn">
        <span>⚠️ Placeholder content — AI content not generated yet.</span>
        <div class="placeholder-actions">
          <button class="btn-generate" :disabled="generating" @click="onGenerateComplete">
            {{ generating ? '⏳ Generating…' : '☁️ Generate complete' }}
          </button>
          <button class="btn-skip" :disabled="generating" @click="emit('skip')">Skip & continue →</button>
        </div>
      </div>
    </div>
    <div
      v-else
      ref="cardEl"
      class="card swipe-card"
      :class="{ 'feedback-correct': feedback?.type === 'correct', 'feedback-wrong': feedback?.type === 'wrong' }"
    >
      <div v-if="sessionStats" class="card-stats">
        <SessionStatsBar :stats="sessionStats" />
      </div>
      <div class="card-toolbar">
        <button class="toolbar-btn generate" :disabled="generating" @click.stop="onGenerateComplete" title="Generate content">
          {{ generating ? '⏳' : '☁️' }}
        </button>
        <button class="toolbar-btn play" @click.stop="onPlayClick" title="Play" :disabled="isMuted">🔊</button>
        <button class="toolbar-btn mute" @click.stop="toggleMute" :title="isMuted ? 'Unmute' : 'Mute'">
          {{ isMuted ? '🔇' : '🔈' }}
        </button>
        <button class="toolbar-btn exit" @click.stop="sessionStats.onClose?.()" title="Exit">✕</button>
      </div>
      <div class="definition-label">Is this sentence correct?</div>
      <div class="stage3-sentence" v-html="displaySentence"></div>
      <div class="tap-zones">
        <div
          class="tap-zone tap-wrong"
          :class="{
            selected: answered && chosen === false,
            'selected-correct': answered && chosen === false && feedback?.type === 'correct',
            'selected-wrong': answered && chosen === false && feedback?.type === 'wrong',
          }"
          @click.stop="!answered && answer(false)"
        >✗</div>
        <div
          class="tap-zone tap-correct"
          :class="{
            selected: answered && chosen === true,
            'selected-correct': answered && chosen === true && feedback?.type === 'correct',
            'selected-wrong': answered && chosen === true && feedback?.type === 'wrong',
          }"
          @click.stop="!answered && answer(true)"
        >✓</div>
      </div>
      <div class="swipe-hint">← tap ✗ &nbsp;|&nbsp; tap ✓ →</div>
      <div v-if="feedback" class="stage3-explanation-block">
        <div v-if="stage3Explanation" class="explanation-text">{{ stage3Explanation }}</div>
        <button
          v-if="!stage3ExplanationLoading"
          class="btn-ai-explain"
          @click.stop="emit('retry-explanation')"
          title="Get AI explanation"
        >
          ☁️ AI explain
        </button>
        <span v-else class="explanation-loading">⏳ AI explaining…</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, inject } from 'vue'
import SessionStatsBar from '../SessionStatsBar.vue'
import { useAudio } from '../../composables/useAudio.js'
import { useSwipe } from '../../composables/useSwipe.js'
import { generateWordComplete } from '../../store/data.js'
import { refetchWord } from '../../store/realtime.js'
import { getCurrentUser } from '../../store/sync.js'

const props = defineProps({
  word: Object,
  useCorrect: Boolean,
  feedback: Object,
  sessionStats: Object,
  stage3Explanation: { type: String, default: '' },
  stage3ExplanationLoading: { type: Boolean, default: false },
})
const emit = defineEmits(['answered', 'skip', 'content-generated', 'retry-explanation'])

const { playWord, playTextAI, playStoredAudio, stopAudio, toggleMute, isMuted } = inject('sessionAudio') ?? useAudio()
const answered = ref(false)
const chosen = ref(null)
const generating = ref(false)
const cardEl = ref(null)

const swipe = useSwipe({
  threshold: 50,
  onSwipeLeft: () => answer(false),
  onSwipeRight: () => answer(true),
  enabled: () => !answered.value,
})

const sentenceAudioUrl = computed(() => {
  const arr = props.useCorrect
    ? (props.word?.audio_stage3_correct ?? [])
    : (props.word?.audio_stage3_incorrect ?? [])
  return Array.isArray(arr) ? arr[0] : null
})

const sentence = computed(() => {
  let text = ''
  try {
    if (props.useCorrect) {
      const arr = props.word?.stage3_correct ?? []
      const raw = arr[0] ?? props.word?.s3_correct ?? ''
      text = (typeof raw === 'string' ? raw : String(raw ?? '')).trim()
    } else {
      const arr = props.word?.stage3_incorrect ?? []
      const raw = arr[0] ?? props.word?.s3_wrong ?? ''
      text = (typeof raw === 'string' ? raw : String(raw ?? '')).trim()
    }
  } catch {
    text = ''
  }
  return text || `Is "${props.word?.word ?? 'this word'}" used correctly?`
})

const highlighted = computed(() => {
  const w = props.word?.word ?? ''
  if (!w) return sentence.value
  try {
    const pattern = new RegExp(`\\b(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi')
    return sentence.value.replace(pattern, '<strong style="color:var(--gold2)">$1</strong>')
  } catch {
    return sentence.value
  }
})

const displaySentence = computed(() => `"${highlighted.value}"`)

const isPlaceholder = computed(() => {
  const w = props.word?.word ?? 'this word'
  return sentence.value === `Is "${w}" used correctly?`
})

watch(cardEl, (el, prev) => {
  if (prev) swipe.unbind(prev)
  if (el) swipe.bind(el)
}, { immediate: true })

function playCardAudio() {
  if (isMuted.value) return
  stopAudio()
  if (sentenceAudioUrl.value) {
    playStoredAudio(sentenceAudioUrl.value, 2)
  } else {
    playTextAI(sentence.value, { times: 2 })
  }
}

watch(() => props.sessionStats, (stats, prev) => {
  if (stats && !prev) playCardAudio()
  if (!stats && prev) stopAudio()
}, { immediate: true })

onUnmounted(() => {
  try {
    stopAudio?.()
    swipe.unbind(cardEl.value)
  } catch (e) {
    if (import.meta.env.DEV) console.warn('Stage3 unmount:', e)
  }
})

function onPlayClick() {
  if (isMuted.value) return
  if (answered.value && props.word?.audio_word) {
    playWord(props.word, 5)
  } else if (sentenceAudioUrl.value) {
    playStoredAudio(sentenceAudioUrl.value, 2)
  } else {
    playTextAI(sentence.value, { times: 2 })
  }
}

async function onGenerateComplete() {
  if (!props.word?.id || !props.word?.word || generating.value) return
  const user = await getCurrentUser()
  if (!user) {
    alert('Sign in required')
    return
  }
  generating.value = true
  try {
    await generateWordComplete(user.id, props.word.id, props.word.word)
    await refetchWord(props.word.id, user.id)
    emit('content-generated', props.word.id)
    if (sentenceAudioUrl.value && !isMuted.value) playStoredAudio(sentenceAudioUrl.value, 2)
  } catch (e) {
    alert('Generate failed: ' + (e?.message || e))
  } finally {
    generating.value = false
  }
}

function answer(val) {
  if (answered.value) return
  stopAudio()
  chosen.value = val
  answered.value = true
  playWord(props.word, 5)
  emit('answered', val === props.useCorrect)
}
</script>

<style scoped>
.stage3-sentence {
  font-family: 'DM Sans', sans-serif;
  font-size: clamp(1.4rem, 1.2vw + 1rem, 2.3rem);
  line-height: 1.7;
  color: var(--text);
  margin: 0 0 8px;
  font-weight: 400;
}
.stage3-root .card { position: relative; }
.card-action {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text2);
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.card-action:hover { border-color: var(--gold); color: var(--gold); }
.tap-zones {
  display: flex;
  gap: 0;
  margin-top: 4px;
  min-height: 56px;
}
.tap-zone {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.8rem;
  font-weight: 700;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background 0.15s, transform 0.1s;
  -webkit-tap-highlight-color: transparent;
}
.tap-zone:active { transform: scale(0.97); }
.tap-wrong {
  background: rgba(224, 92, 92, 0.15);
  color: var(--red);
  margin-right: 6px;
}
.tap-wrong:hover { background: rgba(224, 92, 92, 0.25); }
.tap-correct {
  background: rgba(76, 175, 130, 0.15);
  color: var(--green);
  margin-left: 6px;
}
.tap-correct:hover { background: rgba(76, 175, 130, 0.25); }
.tap-zone.selected-correct {
  background: rgba(76, 175, 130, 0.35) !important;
  border: 2px solid var(--green) !important;
  color: var(--green) !important;
  box-shadow: 0 0 0 2px rgba(76, 175, 130, 0.3);
}
.tap-zone.selected-wrong {
  background: rgba(224, 92, 92, 0.35) !important;
  border: 2px solid var(--red) !important;
  color: var(--red) !important;
  box-shadow: 0 0 0 2px rgba(224, 92, 92, 0.3);
}
.swipe-hint {
  font-size: 0.8rem;
  color: var(--text3);
  margin-top: 4px;
  text-align: center;
}
.stage3-explanation-block {
  margin-top: 12px;
  padding: 14px 16px;
  border-top: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.04);
  border-radius: var(--radius-sm);
}
.explanation-text {
  font-size: 1.05rem;
  line-height: 1.65;
  color: var(--text);
  margin-bottom: 12px;
  font-weight: 450;
}
.btn-ai-explain {
  background: var(--surface2);
  border: 1px solid var(--gold);
  color: var(--gold);
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  cursor: pointer;
  font-family: 'DM Sans', sans-serif;
}
.btn-ai-explain:hover {
  background: rgba(201, 168, 76, 0.2);
  border-color: var(--gold2);
  color: var(--gold2);
}
.explanation-loading {
  font-size: 0.9rem;
  color: var(--text3);
}
.swipe-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  touch-action: pan-y;
  border: 1px solid var(--border);
  transition: background 0.25s ease, border-color 0.25s ease, border-width 0.2s ease;
}
.card-stats { flex-shrink: 0; width: 100%; }
.card-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: clamp(8px, 2.5vw, 14px);
  flex-shrink: 0;
}
.toolbar-btn {
  width: clamp(48px, 14vw, 64px);
  height: clamp(48px, 14vw, 64px);
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--text2);
  font-size: clamp(1.2rem, 5vw, 1.8rem);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  transition: all 0.2s;
  -webkit-tap-highlight-color: transparent;
}
.toolbar-btn:hover { border-color: var(--gold); color: var(--gold); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
.toolbar-btn:active { transform: translateY(0); }
.toolbar-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.swipe-card.feedback-correct {
  background: rgba(76, 175, 130, 0.12) !important;
  border: 2px solid var(--green) !important;
}
.swipe-card.feedback-wrong {
  background: rgba(224, 92, 92, 0.15) !important;
  border: 2px solid var(--red) !important;
}
.stage3-root {
  display: flex; flex-direction: column; min-height: 0;
}
.stage3-root .card { flex-shrink: 0; }
.card.placeholder-only {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}
.placeholder-warn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: rgba(224, 92, 92, 0.15);
  border: 1px solid rgba(224, 92, 92, 0.4);
  border-radius: var(--radius-sm);
  padding: 12px 16px;
  margin-bottom: 16px;
  font-size: 0.9rem;
  color: var(--red);
}
.placeholder-warn .placeholder-actions { flex: 0 0 auto; }
.placeholder-actions { display: flex; gap: 10px; flex-wrap: wrap; flex-shrink: 0; }
.btn-generate {
  background: var(--surface2);
  border: 1px solid var(--gold);
  color: var(--gold);
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  cursor: pointer;
  font-family: 'DM Sans', sans-serif;
  min-width: 120px;
}
.btn-generate:hover:not(:disabled) { background: rgba(201,168,76,0.2); border-color: var(--gold2); color: var(--gold2); }
.btn-generate:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-skip {
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  cursor: pointer;
  font-family: 'DM Sans', sans-serif;
}
.btn-skip:hover {
  border-color: var(--gold);
  color: var(--gold);
}
</style>
