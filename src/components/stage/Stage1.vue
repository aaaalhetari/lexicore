<template>
  <div class="stage1-root">
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
      class="card unified-card"
      :class="{ 'feedback-correct': feedback?.type === 'correct', 'feedback-wrong': feedback?.type === 'wrong' }"
      @click="onCardTap"
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
        <button v-if="sessionStats" class="toolbar-btn exit" @click.stop="sessionStats.onClose?.()" title="Exit">✕</button>
      </div>
      <div class="definition-label">Choose the right meaning</div>
      <div class="definition-text no-swipe-scroll definition-scroll">{{ currentDefinition }}</div>
      <div class="choices-inline">
        <button
          v-for="choice in choices"
          :key="choice.id"
          class="choice-btn"
          :class="{
            correct: answered && choice.id === word.id,
            wrong: answered && chosen === choice.id && choice.id !== word.id,
          }"
          :disabled="answered"
          @click.stop="answer(choice.id)"
        >
          {{ choice.word }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, inject } from 'vue'
import SessionStatsBar from '../SessionStatsBar.vue'
import { useAudio } from '../../composables/useAudio.js'
import { makeFullCard } from '../../store/data.js'
import { refetchWord } from '../../store/realtime.js'
import { getCurrentUser } from '../../store/sync.js'

const props = defineProps({ word: Object, distractorPool: Array, feedback: Object, sessionStats: Object })
const emit = defineEmits(['answered', 'skip', 'content-generated'])

const { playWord, playStoredAudio, stopAudio, toggleMute, isMuted } = inject('sessionAudio') ?? useAudio()
const answered = ref(false)
const chosen = ref(null)
const generating = ref(false)

const currentDefinitionItem = computed(() => {
  const defs = props.word?.stage1_definitions ?? []
  const idx = defs.findIndex((d) => d.is_correct)
  return idx >= 0 ? { ...defs[idx], index: idx } : null
})

const currentDefinition = computed(() => {
  const item = currentDefinitionItem.value
  const text = (item?.definition ?? props.word?.definition ?? '').trim()
  return text || `Definition for "${props.word?.word ?? 'this word'}"`
})

const definitionAudioUrl = computed(() => {
  const idx = currentDefinitionItem.value?.index ?? -1
  if (idx >= 0) {
    const arr = props.word?.audio_stage1_definitions ?? []
    const url = Array.isArray(arr) ? arr[idx] : null
    if (url) return url
  }
  return null
})

const isPlaceholder = computed(() => {
  const def = currentDefinition.value
  const w = props.word?.word ?? 'this word'
  return def === `Definition for "${w}"`
})

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const choices = ref([])

function buildChoices() {
  if (!props.word) return
  const distractors = (props.distractorPool ?? [])
    .filter((w) => w.id !== props.word?.id)
    .slice()
  shuffle(distractors)
  choices.value = shuffle([props.word, ...distractors.slice(0, 3)])
}

watch(() => props.word?.id, () => buildChoices(), { immediate: true })

function playCardAudio() {
  if (isMuted.value) return
  stopAudio()
  if (definitionAudioUrl.value) playStoredAudio(definitionAudioUrl.value, 2)
}

watch(() => props.sessionStats, (stats, prev) => {
  if (stats && !prev) playCardAudio()
  if (!stats && prev) stopAudio()
}, { immediate: true })

onUnmounted(() => stopAudio())

function onCardTap() {
  if (isMuted.value) return
  if (definitionAudioUrl.value) playStoredAudio(definitionAudioUrl.value, 2)
}

function onPlayClick() {
  if (isMuted.value) return
  if (answered.value && props.word?.audio_word) {
    playWord(props.word, 5)
  } else if (definitionAudioUrl.value) {
    playStoredAudio(definitionAudioUrl.value, 2)
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
    if (definitionAudioUrl.value && !isMuted.value) playStoredAudio(definitionAudioUrl.value, 2)
  } catch (e) {
    alert('Generate failed: ' + (e?.message || e))
  } finally {
    generating.value = false
  }
}

function answer(id) {
  if (answered.value) return
  stopAudio()
  answered.value = true
  chosen.value = id
  playWord(props.word, 5)
  emit('answered', id === props.word.id)
}
</script>

<style scoped>
.unified-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  border: 1px solid var(--border);
  transition: background 0.25s ease, border-color 0.25s ease, border-width 0.2s ease;
  min-height: 0;
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
.toolbar-btn.exit { order: 4; }
.toolbar-btn.mute { order: 3; }
.toolbar-btn.play { order: 2; }
.toolbar-btn.generate { order: 1; }
.unified-card.feedback-correct {
  background: rgba(76, 175, 130, 0.12) !important;
  border: 2px solid var(--green) !important;
}
.unified-card.feedback-wrong {
  background: rgba(224, 92, 92, 0.15) !important;
  border: 2px solid var(--red) !important;
}
.choices-inline {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 8px;
  flex-shrink: 0;
}
.choice-btn {
  background: var(--surface2);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  min-height: 44px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  font-family: 'JetBrains Mono', monospace;
  font-size: 1rem;
  color: var(--text);
  overflow-wrap: anywhere;
  word-break: break-word;
}
.choice-btn:hover:not(:disabled) {
  border-color: var(--gold);
  background: var(--gold-dim);
}
.choice-btn.correct {
  border-color: var(--green) !important;
  background: var(--green-dim) !important;
  color: var(--green);
}
.choice-btn.wrong {
  border-color: var(--red) !important;
  background: var(--red-dim) !important;
  color: var(--red);
}
.choice-btn:disabled {
  cursor: default;
}
.stage1-root {
  display: flex; flex-direction: column; min-height: 0;
}
.stage1-root .card {
  flex: 1;
  min-height: 0;
  cursor: pointer;
}
.definition-scroll {
  flex: 1 1 auto;
  min-height: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}
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
  margin-bottom: 12px;
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
