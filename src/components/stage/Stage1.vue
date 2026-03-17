<template>
  <div class="stage1-root">
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
    <template v-else>
    <div class="card" @click="onCardTap">
      <div class="definition-label">Definition</div>
      <div class="definition-text">{{ currentDefinition }}</div>
      <button class="card-action" @click.stop="onAudioClick" :title="isMuted ? 'Unmute' : 'Play'">
        {{ isMuted ? '🔇' : '🔊' }}
      </button>
    </div>
    <div class="choices">
      <button
        v-for="choice in choices"
        :key="choice.id"
        class="choice-btn"
        :class="{
          correct: answered && choice.id === word.id,
          wrong: answered && chosen === choice.id && choice.id !== word.id,
        }"
        :disabled="answered"
        @click="answer(choice.id)"
      >
        {{ choice.word }}
      </button>
    </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, inject } from 'vue'
import { useAudio } from '../../composables/useAudio.js'
import { generateWordComplete } from '../../store/data.js'
import { refetchWord } from '../../store/realtime.js'
import { getCurrentUser } from '../../store/sync.js'

const props = defineProps({ word: Object, distractorPool: Array })
const emit = defineEmits(['answered', 'skip', 'content-generated'])

const { playWord, playTextAI, playStoredAudio, stopAudio, toggleMute, isMuted } = inject('sessionAudio') ?? useAudio()
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
onMounted(() => {
  stopAudio()
  if (definitionAudioUrl.value) {
    playStoredAudio(definitionAudioUrl.value, 2)
  } else {
    playTextAI(currentDefinition.value, { times: 2 })
  }
})
onUnmounted(() => stopAudio())

function onCardTap() {
  if (isMuted.value) return
  if (definitionAudioUrl.value) playStoredAudio(definitionAudioUrl.value, 2)
  else playTextAI(currentDefinition.value, { times: 2 })
}

function onAudioClick() {
  if (isMuted.value) {
    toggleMute()
    if (answered.value && props.word?.audio_word) {
      playWord(props.word, 5)
    } else if (definitionAudioUrl.value) {
      playStoredAudio(definitionAudioUrl.value, 2)
    } else {
      playTextAI(currentDefinition.value, { times: 2 })
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
.choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  flex: 1;
  min-height: 0;
  align-content: end;
}
.choice-btn {
  background: var(--surface2);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 16px 18px;
  min-height: 52px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  font-family: 'JetBrains Mono', monospace;
  font-size: 1rem;
  color: var(--text);
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
  flex-shrink: 0;
  position: relative;
  cursor: pointer;
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
