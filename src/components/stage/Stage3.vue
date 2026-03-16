<template>
  <div class="card">
    <div class="definition-header">
      <div class="definition-label">Is this sentence correct?</div>
      <button
        v-if="word.audio_url"
        class="audio-btn"
        @click="playAudio"
        title="Play pronunciation"
      >
        🔊
      </button>
    </div>
    <div class="stage3-sentence" v-html="displaySentence"></div>
    <div class="tf-btns">
      <button class="tf-btn true-btn" :disabled="answered" @click="answer(true)">
        ✅ True
      </button>
      <button class="tf-btn false-btn" :disabled="answered" @click="answer(false)">
        ❌ False
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAudio } from '../../composables/useAudio.js'

const props = defineProps({ word: Object, useCorrect: Boolean })
const emit = defineEmits(['answered'])

const { playWord } = useAudio()
const answered = ref(false)

const sentence = computed(() => {
  if (props.useCorrect) {
    const arr = props.word?.stage3_correct ?? []
    return arr[0] ?? props.word?.s3_correct ?? ''
  }
  const arr = props.word?.stage3_incorrect ?? []
  return arr[0] ?? props.word?.s3_wrong ?? ''
})

const highlighted = computed(() => {
  const pattern = new RegExp(`\\b(${props.word?.word ?? ''})\\b`, 'gi')
  return sentence.value.replace(pattern, '<strong style="color:var(--gold2)">$1</strong>')
})

const displaySentence = computed(() => `"${highlighted.value}"`)

function playAudio() {
  if (props.word?.audio_url) playWord(props.word)
}

function answer(chosen) {
  if (answered.value) return
  answered.value = true
  playWord(props.word)
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
.stage3-sentence {
  font-family: 'DM Sans', sans-serif;
  font-size: clamp(1.4rem, 1.2vw + 1rem, 2.3rem);
  line-height: 1.7;
  color: var(--text);
  margin-bottom: 24px;
  font-weight: 400;
}
.tf-btns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.tf-btn {
  padding: 18px;
  border-radius: var(--radius-sm);
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: 1.5px solid;
  font-family: 'DM Sans', sans-serif;
}
.true-btn {
  background: var(--green-dim);
  border-color: rgba(76, 175, 130, 0.3);
  color: var(--green);
}
.false-btn {
  background: var(--red-dim);
  border-color: rgba(224, 92, 92, 0.3);
  color: var(--red);
}
.tf-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  filter: brightness(1.2);
}
.tf-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
