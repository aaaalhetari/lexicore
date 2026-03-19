<template>
  <div class="stage2-root">
    <div v-if="isPlaceholder" class="card placeholder-only">
      <div class="card-toolbar">
        <button class="toolbar-btn generate" :disabled="generating" @click="onMakeFullCard" title="Make full card">
          {{ generating ? '⏳' : '☁️' }}
        </button>
        <button class="toolbar-btn play" @click.stop="onPlayClick" title="Play" :disabled="isMuted">🔊</button>
        <button class="toolbar-btn mute" @click.stop="toggleMute" :title="isMuted ? 'Unmute' : 'Mute'">
          {{ isMuted ? '🔇' : '🔈' }}
        </button>
        <button v-if="sessionStats" class="toolbar-btn exit" @click.stop="sessionStats.onClose?.()" title="Exit">✕</button>
      </div>
      <div class="placeholder-warn">
        <span>⚠️ Card content not generated yet.</span>
        <div class="placeholder-actions">
          <button class="btn-generate" :disabled="generating" @click="onMakeFullCard">
            {{ generating ? '⏳ Generating…' : '☁️ Make full card' }}
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
        <button class="toolbar-btn generate" :disabled="generating" @click.stop="onMakeFullCard" title="Make full card">
          {{ generating ? '⏳' : '☁️' }}
        </button>
        <button class="toolbar-btn play" @click.stop="onPlayClick" title="Play" :disabled="isMuted">🔊</button>
        <button class="toolbar-btn mute" @click.stop="toggleMute" :title="isMuted ? 'Unmute' : 'Mute'">
          {{ isMuted ? '🔇' : '🔈' }}
        </button>
        <button class="toolbar-btn exit" @click.stop="sessionStats.onClose?.()" title="Exit">✕</button>
      </div>
      <div class="definition-label">Put the word in the sentence</div>
      <div
        class="sentence-text no-swipe-scroll"
        :class="{ revealed, tappable: !revealed }"
        @click="onSentenceClick"
      >
        <span class="sentence-part">{{ part1 }}</span>
        <span class="blank-wrapper">
          <span class="stage2-meaning-hint">{{ currentMeaning }}</span>
          <span class="blank" :class="{ filled: revealed }">{{ revealed ? word.word : '___' }}</span>
        </span>
        <span class="sentence-part">{{ part2 }}</span>
      </div>
      <div class="tap-zones">
        <div
          class="tap-zone tap-wrong"
          :class="{
            disabled: !revealed,
            selected: answered && chosen === false,
            'selected-correct': answered && chosen === false && feedback?.type === 'correct',
            'selected-wrong': answered && chosen === false && feedback?.type === 'wrong',
          }"
          @click.stop="revealed && !answered && answer(false)"
        >✗</div>
        <div
          class="tap-zone tap-correct"
          :class="{
            disabled: !revealed,
            selected: answered && chosen === true,
            'selected-correct': answered && chosen === true && feedback?.type === 'correct',
            'selected-wrong': answered && chosen === true && feedback?.type === 'wrong',
          }"
          @click.stop="revealed && !answered && answer(true)"
        >✓</div>
      </div>
      <div class="swipe-hint">← tap ✗ &nbsp;|&nbsp; tap ✓ →</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, inject } from 'vue'
import SessionStatsBar from '../SessionStatsBar.vue'
import { useAudio } from '../../composables/useAudio.js'
import { useSwipe } from '../../composables/useSwipe.js'
import { makeFullCard } from '../../store/data.js'
import { refetchWord } from '../../store/realtime.js'
import { getCurrentUser } from '../../store/sync.js'

const props = defineProps({ word: Object, feedback: Object, sessionStats: Object })
const emit = defineEmits(['answered', 'skip', 'content-generated'])

const { playWord, playStoredAudio, stopAudio, toggleMute, isMuted } = inject('sessionAudio') ?? useAudio()
const revealed = ref(false)
const answered = ref(false)
const chosen = ref(null)
const generating = ref(false)
const cardEl = ref(null)

const swipe = useSwipe({
  threshold: 50,
  onSwipeLeft: () => answer(false),
  onSwipeRight: () => answer(true),
  enabled: () => revealed.value && !answered.value,
})

const currentSentenceItem = computed(() => {
  const s2 = props.word?.stage2_sentences ?? []
  const first = s2[0]
  return first ? { ...first, index: 0 } : null
})

const currentSentence = computed(() => {
  const item = currentSentenceItem.value
  const text = (item?.sentence ?? props.word?.example ?? '').trim()
  return text || `Use ___ in context.`
})

const sentenceAudioUrl = computed(() => {
  const arr = props.word?.audio_stage2_sentences ?? []
  const url = Array.isArray(arr) ? arr[0] : null
  return url
})

const currentMeaning = computed(() => {
  const s2 = props.word?.stage2_sentences ?? []
  const first = s2[0]
  return first?.meaning ?? props.word?.example_meaning ?? 'Used in context.'
})

const sentenceParts = computed(() => {
  const s = currentSentence.value
  const idx = s.indexOf('___')
  if (idx === -1) return { part1: s, part2: '' }
  return { part1: s.slice(0, idx), part2: s.slice(idx + 3) }
})
const part1 = computed(() => sentenceParts.value.part1)
const part2 = computed(() => sentenceParts.value.part2)

const isPlaceholder = computed(() => {
  const s = currentSentence.value
  const m = currentMeaning.value
  return s === 'Use ___ in context.' && m === 'Used in context.'
})

watch(cardEl, (el, prev) => {
  if (prev) swipe.unbind(prev)
  if (el) swipe.bind(el)
}, { immediate: true })

function playCardAudio() {
  if (isMuted.value) return
  stopAudio()
  if (sentenceAudioUrl.value) playStoredAudio(sentenceAudioUrl.value, 2)
}

watch(() => props.sessionStats, (stats, prev) => {
  if (stats && !prev) playCardAudio()
  if (!stats && prev) stopAudio()
}, { immediate: true })

onUnmounted(() => {
  stopAudio()
  swipe.unbind(cardEl.value)
})

function onPlayClick() {
  if (isMuted.value) return
  if (revealed.value && props.word?.audio_word) {
    playWord(props.word, 5)
  } else if (sentenceAudioUrl.value) {
    playStoredAudio(sentenceAudioUrl.value, 2)
  }
}

async function onMakeFullCard() {
  if (!props.word?.id || !props.word?.word || generating.value) return
  const user = await getCurrentUser()
  if (!user) {
    alert('Sign in required')
    return
  }
  generating.value = true
  try {
    await makeFullCard(user.id, props.word.id, props.word.word)
    await new Promise((r) => setTimeout(r, 800))
    await refetchWord(props.word.id, user.id)
    emit('content-generated', props.word.id)
    if (sentenceAudioUrl.value && !isMuted.value) playStoredAudio(sentenceAudioUrl.value, 2)
  } catch (e) {
    alert('Generate failed: ' + (e?.message || e))
  } finally {
    generating.value = false
  }
}

function onSentenceClick() {
  if (!revealed.value) {
    stopAudio()
    revealed.value = true
    playWord(props.word, 5)
  }
}

function answer(val) {
  if (answered.value) return
  stopAudio()
  chosen.value = val
  answered.value = true
  emit('answered', val)
}
</script>

<style scoped>
.blank-wrapper {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  vertical-align: middle;
  margin: 0 4px;
}
.stage2-meaning-hint {
  font-size: 0.9rem;
  color: var(--gold);
  margin-bottom: 4px;
  text-align: center;
  max-width: 320px;
  line-height: 1.4;
}
.sentence-text {
  font-family: 'DM Sans', sans-serif;
  font-size: clamp(1.35rem, 1.2vw + 1rem, 2.2rem);
  line-height: 1.7;
  color: var(--text);
  margin: 0 0 8px;
  font-weight: 400;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.blank {
  display: inline-block;
  min-width: 60px;
  margin: 0;
  border-bottom: 2px solid var(--gold);
  padding: 0 4px 2px;
  vertical-align: baseline;
  color: var(--gold);
  font-size: 0.5em;
  line-height: 1.4;
  max-width: 320px;
}
.blank:not(.filled) { min-height: 1em; }
.blank.filled {
  border-color: var(--gold2);
  color: var(--gold2);
  font-size: 1em;
  font-weight: 600;
}
.sentence-part {
  vertical-align: middle;
}
.sentence-text.tappable { cursor: pointer; }
.sentence-text.tappable::after {
  content: 'Tap to reveal'; font-size: 0.75rem; color: var(--text3);
  display: block; margin-top: 8px;
}
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
.tap-zone.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}
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
.swipe-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  border: 1px solid var(--border);
  transition: background 0.25s ease, border-color 0.25s ease, border-width 0.2s ease;
  min-height: 0;
}
.swipe-card.feedback-correct {
  background: rgba(76, 175, 130, 0.12) !important;
  border: 2px solid var(--green) !important;
}
.swipe-card.feedback-wrong {
  background: rgba(224, 92, 92, 0.15) !important;
  border: 2px solid var(--red) !important;
}
.swipe-card { touch-action: pan-x; }
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
.stage2-root {
  display: flex; flex-direction: column; min-height: 0;
}
.stage2-root .card { flex: 1; min-height: 0; position: relative; }
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
