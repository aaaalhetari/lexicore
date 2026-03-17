<template>
  <div class="stage2-root">
    <div v-if="isPlaceholder" class="card placeholder-only">
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
    <div v-else ref="cardEl" class="card swipe-card">
      <div class="definition-label">Fill in the blank</div>
      <button class="card-action" @click.stop="onAudioClick" :title="isMuted ? 'Unmute' : 'Play'">
        {{ isMuted ? '🔇' : '🔊' }}
      </button>
      <div
        class="sentence-text"
        :class="{ revealed, tappable: !revealed }"
        @click="() => { if (!revealed) onShowAnswer() }"
      >
        <span class="sentence-part">{{ part1 }}</span>
        <span class="blank-with-hint">
          <span class="meaning-hint-small">{{ currentMeaning }}</span>
          <span class="blank" :class="{ filled: revealed }">{{ revealed ? word.word : '…' }}</span>
          <span class="hint-spacer" v-if="!revealed"></span>
        </span>
        <span class="sentence-part">{{ part2 }}</span>
      </div>
      <div v-if="revealed" class="swipe-hint">← swipe ✗ &nbsp;|&nbsp; swipe ✓ →</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, inject } from 'vue'
import { useAudio } from '../../composables/useAudio.js'
import { useSwipe } from '../../composables/useSwipe.js'
import { generateWordComplete } from '../../store/data.js'
import { refetchWord } from '../../store/realtime.js'
import { getCurrentUser } from '../../store/sync.js'

const props = defineProps({ word: Object })
const emit = defineEmits(['answered', 'skip', 'content-generated'])

const { playWord, playTextAI, playStoredAudio, stopAudio, toggleMute, isMuted } = inject('sessionAudio') ?? useAudio()
const revealed = ref(false)
const answered = ref(false)
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

onMounted(() => {
  stopAudio()
  if (sentenceAudioUrl.value) {
    playStoredAudio(sentenceAudioUrl.value, 2)
  } else {
    playTextAI(currentSentence.value, { times: 2, pauseAtBlank: true })
  }
})
onUnmounted(() => {
  stopAudio()
  swipe.unbind(cardEl.value)
})

function onAudioClick() {
  if (isMuted.value) {
    toggleMute()
    if (revealed.value && props.word?.audio_word) {
      playWord(props.word, 5)
    } else if (sentenceAudioUrl.value) {
      playStoredAudio(sentenceAudioUrl.value, 2)
    } else {
      playTextAI(currentSentence.value, { times: 2, pauseAtBlank: true })
    }
  } else {
    toggleMute()
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

function onShowAnswer() {
  stopAudio()
  revealed.value = true
  playWord(props.word, 5)
}

function answer(val) {
  if (answered.value) return
  stopAudio()
  answered.value = true
  emit('answered', val)
}
</script>

<style scoped>
.definition-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.audio-btns {
  display: flex;
  align-items: center;
  gap: 6px;
}
.btn-gen-complete {
  background: var(--surface2);
  border: 1px solid var(--gold);
  color: var(--gold);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s;
}
.btn-gen-complete:hover:not(:disabled) {
  background: rgba(201,168,76,0.2);
}
.audio-btn {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  cursor: pointer;
  font-size: 1.2rem;
  transition: all 0.2s;
}
.audio-btn:hover {
  border-color: var(--gold);
  color: var(--gold);
}
.audio-btn.muted {
  opacity: 0.6;
}
.sentence-text {
  font-family: 'DM Sans', sans-serif;
  font-size: clamp(1.35rem, 1.2vw + 1rem, 2.2rem);
  line-height: 1.7;
  color: var(--text);
  margin-bottom: 16px;
  font-weight: 400;
}
.blank-with-hint {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  vertical-align: middle;
  margin: 0 6px;
  width: fit-content;
}
.meaning-hint-small {
  font-size: 0.667em;
  color: var(--gold);
  font-family: 'DM Sans', sans-serif;
  margin-bottom: 8px;
  font-weight: 400;
  max-width: 360px;
  text-align: center;
  line-height: 1.4;
}
.hint-spacer {
  height: calc(0.667em + 8px);
}
.blank {
  display: block;
  min-width: 60px;
  border-bottom: 1px solid var(--gold);
  padding: 0 4px;
}
.blank:not(.filled) { min-height: 1.2em; }
.blank.filled { border-color: var(--gold2); }
.sentence-part {
  vertical-align: middle;
}
.sentence-text.tappable { cursor: pointer; }
.sentence-text.tappable::after {
  content: 'Tap to reveal'; font-size: 0.75rem; color: var(--text3);
  display: block; margin-top: 8px;
}
.blank.filled { color: var(--gold2); font-weight: 600; }
.swipe-hint {
  font-size: 0.8rem;
  color: var(--text3);
  margin-top: 12px;
  text-align: center;
}
.swipe-card {
  touch-action: pan-y;
}
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
.stage2-root {
  display: flex; flex-direction: column; min-height: 0;
}
.stage2-root .card { flex-shrink: 0; position: relative; }
.card.placeholder-only { display: flex; align-items: center; justify-content: center; min-height: 200px; }
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
