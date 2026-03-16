<template>
  <div>
    <div class="card">
      <div class="definition-header">
        <div class="definition-label">Definition</div>
        <button
          v-if="word.audio_url"
          class="audio-btn"
          @click="playAudio"
          title="Play pronunciation"
        >
          🔊
        </button>
      </div>
      <div class="definition-text">{{ currentDefinition }}</div>
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
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAudio } from '../../composables/useAudio.js'

const props = defineProps({ word: Object, distractorPool: Array })
const emit = defineEmits(['answered'])

const { playWord } = useAudio()
const answered = ref(false)
const chosen = ref(null)

const currentDefinition = computed(() => {
  const defs = props.word?.stage1_definitions ?? []
  const correct = defs.find((d) => d.is_correct)
  return correct?.definition ?? props.word?.definition ?? ''
})

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const choices = computed(() => {
  const distractors = (props.distractorPool ?? [])
    .filter((w) => w.id !== props.word?.id)
    .slice()
  shuffle(distractors)
  return shuffle([props.word, ...distractors.slice(0, 3)])
})

function playAudio() {
  if (props.word?.audio_url) playWord(props.word)
}

function answer(id) {
  if (answered.value) return
  answered.value = true
  chosen.value = id
  playWord(props.word)
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
.choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.choice-btn {
  background: var(--surface2);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 16px 18px;
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
</style>
