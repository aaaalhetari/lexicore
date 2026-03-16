<template>
  <div class="card">
    <div class="definition-header">
      <div class="definition-label">Fill in the blank</div>
      <button
        v-if="word.audio_url"
        class="audio-btn"
        @click="playAudio"
        title="Play pronunciation"
      >
        🔊
      </button>
    </div>
    <div class="sentence-text" v-html="sentenceHtml"></div>
    <div class="meaning-text">{{ currentMeaning }}</div>

    <button v-if="!revealed" class="show-answer-btn" @click="onShowAnswer">
      🔍 Show Answer
    </button>

    <div v-if="revealed" class="answer-reveal">
      <div class="answer-word">{{ word.word }}</div>
      <div class="judge-btns">
        <button class="btn btn-knew" :disabled="answered" @click="answer(true)">
          ✅ I knew it
        </button>
        <button class="btn btn-didnt" :disabled="answered" @click="answer(false)">
          ❌ I didn't
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAudio } from '../../composables/useAudio.js'

const props = defineProps({ word: Object })
const emit = defineEmits(['answered'])

const { playWord } = useAudio()
const revealed = ref(false)
const answered = ref(false)

const currentSentence = computed(() => {
  const s2 = props.word?.stage2_sentences ?? []
  const first = s2[0]
  return first?.sentence ?? props.word?.example ?? 'Use ___ in context.'
})

const currentMeaning = computed(() => {
  const s2 = props.word?.stage2_sentences ?? []
  const first = s2[0]
  return first?.meaning ?? props.word?.example_meaning ?? 'Used in context.'
})

const sentenceHtml = computed(() =>
  currentSentence.value.replace('___', '<span class="blank"></span>')
)

function playAudio() {
  if (props.word?.audio_url) playWord(props.word)
}

function onShowAnswer() {
  revealed.value = true
  playWord(props.word)
}

function answer(val) {
  if (answered.value) return
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
.sentence-text {
  font-family: 'DM Sans', sans-serif;
  font-size: clamp(1.35rem, 1.2vw + 1rem, 2.2rem);
  line-height: 1.7;
  color: var(--text);
  margin-bottom: 16px;
  font-weight: 400;
}
:deep(.blank) {
  display: inline-block;
  width: clamp(110px, 10vmin, 220px);
  height: 2px;
  background: var(--gold);
  vertical-align: middle;
  margin: 0 6px;
  position: relative;
  top: -4px;
}
.meaning-text {
  font-size: clamp(1.05rem, 0.6vw + 0.95rem, 1.5rem);
  color: var(--text);
  line-height: 1.65;
  background: var(--surface2);
  border-radius: var(--radius-sm);
  padding: 14px 18px;
  border-left: 3px solid var(--gold);
  font-family: 'DM Sans', sans-serif;
}
.show-answer-btn {
  width: 100%;
  padding: 14px;
  background: var(--surface2);
  border: 1.5px dashed var(--border);
  color: var(--text2);
  border-radius: var(--radius-sm);
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 20px;
  font-family: 'DM Sans', sans-serif;
}
.show-answer-btn:hover {
  border-color: var(--gold);
  color: var(--gold);
}
.answer-reveal {
  margin-top: 20px;
  padding: 20px;
  background: var(--surface2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  text-align: center;
}
.answer-word {
  font-family: 'Fraunces', serif;
  font-size: clamp(1.9rem, 1.4vw + 1.4rem, 3rem);
  color: var(--gold2);
  margin-bottom: 16px;
  letter-spacing: 0.5px;
}
.judge-btns {
  display: flex;
  gap: 12px;
  justify-content: center;
}
.btn-knew {
  background: var(--green-dim);
  color: var(--green);
  border: 1.5px solid rgba(76, 175, 130, 0.3);
  min-width: 120px;
}
.btn-didnt {
  background: var(--red-dim);
  color: var(--red);
  border: 1.5px solid rgba(224, 92, 92, 0.3);
  min-width: 120px;
}
</style>
