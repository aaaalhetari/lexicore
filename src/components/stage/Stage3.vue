<template>
  <div class="stage3-root">
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
      <div class="definition-label">Is this sentence correct?</div>
      <button class="card-action" @click.stop="onAudioClick" :title="isMuted ? 'Unmute' : 'Play'">
        {{ isMuted ? '🔇' : '🔊' }}
      </button>
      <div class="stage3-sentence" v-html="displaySentence"></div>
      <div class="swipe-hint">← swipe ✗ &nbsp;|&nbsp; swipe ✓ →</div>
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

const props = defineProps({ word: Object, useCorrect: Boolean })
const emit = defineEmits(['answered', 'skip', 'content-generated'])

const { playWord, playTextAI, playStoredAudio, stopAudio, toggleMute, isMuted } = inject('sessionAudio') ?? useAudio()
const answered = ref(false)
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

onMounted(() => {
  try {
    stopAudio()
    if (sentenceAudioUrl.value) {
      playStoredAudio(sentenceAudioUrl.value, 2)
    } else {
      playTextAI(sentence.value, { times: 2 })
    }
  } catch {
    // ignore audio errors
  }
})
onUnmounted(() => {
  try {
    stopAudio?.()
    swipe.unbind(cardEl.value)
  } catch { /* ignore */ }
})

function onAudioClick() {
  if (isMuted.value) {
    toggleMute()
    if (answered.value && props.word?.audio_word) {
      playWord(props.word, 5)
    } else if (sentenceAudioUrl.value) {
      playStoredAudio(sentenceAudioUrl.value, 2)
    } else {
      playTextAI(sentence.value, { times: 2 })
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

function answer(chosen) {
  if (answered.value) return
  stopAudio()
  answered.value = true
  playWord(props.word, 5)
  emit('answered', chosen === props.useCorrect)
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
.stage3-sentence {
  font-family: 'DM Sans', sans-serif;
  font-size: clamp(1.4rem, 1.2vw + 1rem, 2.3rem);
  line-height: 1.7;
  color: var(--text);
  margin-bottom: 24px;
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
.swipe-hint {
  font-size: 0.8rem;
  color: var(--text3);
  margin-top: 12px;
  text-align: center;
}
.swipe-card {
  touch-action: pan-y;
}
.stage3-root {
  display: flex; flex-direction: column; min-height: 0;
}
.stage3-root .card { flex-shrink: 0; }
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
