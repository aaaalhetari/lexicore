<template>
  <div class="card">
    <div class="definition-label">Is this sentence correct?</div>
    <div class="stage3-sentence" v-html="displaySentence"></div>
    <div class="tf-btns">
      <button class="tf-btn true-btn" :disabled="answered" @click="answer(true)">✅ True</button>
      <button class="tf-btn false-btn" :disabled="answered" @click="answer(false)">❌ False</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({ word: Object, useCorrect: Boolean })
const emit  = defineEmits(['answered'])

const answered = ref(false)

const sentence = computed(() =>
  props.useCorrect ? props.word.s3_correct : props.word.s3_wrong
)

const highlighted = computed(() => {
  const pattern = new RegExp(`\\b(${props.word.word})\\b`, 'gi')
  return sentence.value.replace(pattern, '<strong style="color:var(--gold2)">$1</strong>')
})

const displaySentence = computed(() => `"${highlighted.value}"`)

function answer(chosen) {
  if (answered.value) return
  answered.value = true
  emit('answered', chosen === props.useCorrect)
}
</script>

<style scoped>
.stage3-sentence {
  font-family: 'DM Sans', sans-serif;
  font-size: clamp(1.4rem, 1.2vw + 1rem, 2.3rem);
  line-height: 1.7; color: var(--text);
  margin-bottom: 24px; font-weight: 400;
}
.tf-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.tf-btn {
  padding: 18px; border-radius: var(--radius-sm); font-size: 1rem;
  font-weight: 500; cursor: pointer; transition: all 0.2s; border: 1.5px solid;
  font-family: 'DM Sans', sans-serif;
}
.true-btn  { background: var(--green-dim); border-color: rgba(76,175,130,0.3); color: var(--green); }
.false-btn { background: var(--red-dim);   border-color: rgba(224,92,92,0.3);  color: var(--red); }
.tf-btn:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.2); }
.tf-btn:disabled { opacity: 0.5; cursor: default; }
</style>
