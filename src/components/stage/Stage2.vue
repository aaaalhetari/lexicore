<template>
  <div class="card">
    <div class="definition-label">Fill in the blank</div>
    <div class="sentence-text" v-html="sentenceHtml"></div>
    <div class="meaning-text">{{ word.example_meaning }}</div>

    <button v-if="!revealed" class="show-answer-btn" @click="revealed = true">
      🔍 Show Answer
    </button>

    <div v-if="revealed" class="answer-reveal">
      <div class="answer-word">{{ word.word }}</div>
      <div class="judge-btns">
        <button class="btn" :class="['btn-knew']" :disabled="answered" @click="answer(true)">✅ I knew it</button>
        <button class="btn" :class="['btn-didnt']" :disabled="answered" @click="answer(false)">❌ I didn't</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({ word: Object })
const emit  = defineEmits(['answered'])

const revealed = ref(false)
const answered = ref(false)

const sentenceHtml = computed(() =>
  props.word.example.replace('___', '<span class="blank"></span>')
)

function answer(val) {
  if (answered.value) return
  answered.value = true
  emit('answered', val)
}
</script>

<style scoped>
.sentence-text {
  font-family: 'DM Sans', sans-serif;
  font-size: 18px; line-height: 1.7; color: var(--text);
  margin-bottom: 16px; font-weight: 400;
}
:deep(.blank) {
  display: inline-block; width: 120px; height: 2px;
  background: var(--gold); vertical-align: middle;
  margin: 0 6px; position: relative; top: -4px;
}
.meaning-text {
  font-size: 15px; color: var(--text); line-height: 1.65;
  background: var(--surface2); border-radius: var(--radius-sm);
  padding: 14px 18px; border-left: 3px solid var(--gold);
  font-family: 'DM Sans', sans-serif;
}
.show-answer-btn {
  width: 100%; padding: 14px; background: var(--surface2);
  border: 1.5px dashed var(--border); color: var(--text2);
  border-radius: var(--radius-sm); font-size: 14px; cursor: pointer;
  transition: all 0.2s; margin-top: 20px;
  font-family: 'DM Sans', sans-serif;
}
.show-answer-btn:hover { border-color: var(--gold); color: var(--gold); }
.answer-reveal {
  margin-top: 20px; padding: 20px; background: var(--surface2);
  border-radius: var(--radius-sm); border: 1px solid var(--border);
  text-align: center;
}
.answer-word {
  font-family: 'Fraunces', serif; font-size: 28px;
  color: var(--gold2); margin-bottom: 16px; letter-spacing: 0.5px;
}
.judge-btns { display: flex; gap: 12px; justify-content: center; }
.btn-knew {
  background: var(--green-dim); color: var(--green);
  border: 1.5px solid rgba(76,175,130,0.3); min-width: 120px;
}
.btn-didnt {
  background: var(--red-dim); color: var(--red);
  border: 1.5px solid rgba(224,92,92,0.3); min-width: 120px;
}
</style>
