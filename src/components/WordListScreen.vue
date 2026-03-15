<template>
  <div>
    <!-- File Actions -->
    <div class="file-actions">
      <label class="btn btn-secondary" style="cursor:pointer">
        ⬆ Import CSV
        <input type="file" accept=".csv" @change="onImportCSV" style="display:none">
      </label>
      <button class="btn btn-secondary" @click="downloadCSV()">⬇ Export CSV</button>
      <button class="btn btn-primary" @click="showForm = !showForm">+ Add Word</button>
    </div>

    <!-- Add Word Form -->
    <Transition name="fade">
      <div v-if="showForm" class="add-form">
        <h3>Add New Word</h3>
        <div class="form-grid">
          <input v-model="form.word"           placeholder="Word (e.g. scrutinize)" class="form-input">
          <input v-model="form.definition"     placeholder="Definition in English" class="form-input">
          <input v-model="form.example"        placeholder="Example sentence (use ___ for blank)" class="form-input">
          <input v-model="form.example_meaning" placeholder="Sentence meaning/explanation" class="form-input">
          <input v-model="form.s3_correct"     placeholder="Stage 3 CORRECT sentence" class="form-input">
          <input v-model="form.s3_wrong"       placeholder="Stage 3 WRONG sentence (incorrect usage)" class="form-input">
          <div class="btn-row">
            <button class="btn btn-primary" @click="onAdd">Add</button>
            <button class="btn btn-secondary" @click="showForm = false">Cancel</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Word List -->
    <div v-if="words.length === 0" class="empty-msg">
      No words yet. Add some or import a CSV.
    </div>
    <div v-else class="word-list" style="padding-bottom:80px">
      <div v-for="w in words" :key="w.id" class="word-item">
        <div>
          <div class="w-name">{{ w.word }}</div>
          <div class="w-def">{{ w.definition }}</div>
        </div>
        <span class="word-status" :class="statusClass(w)">{{ statusLabel(w) }}</span>
      </div>
    </div>

    <!-- Sticky Buttons -->
    <div class="sticky-bottom">
      <button class="btn btn-primary" @click="saveAndBack">Save & Back</button>
      <button class="btn btn-secondary" @click="$emit('back')">Back without Saving</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { getData, addWord, importCSV, downloadCSV, downloadJSON } from '../store/data.js'

const emit = defineEmits(['back'])

const words    = computed(() => getData().words)
const showForm = ref(false)

const form = ref({
  word: '', definition: '', example: '',
  example_meaning: '', s3_correct: '', s3_wrong: ''
})

function statusClass(w) {
  return { waiting: 'ws-waiting', learning: 'ws-learning', mastered: 'ws-mastered' }[w.status]
}
function statusLabel(w) {
  return w.status === 'learning' ? `C${w.cycle} S${w.stage}` : w.status
}

function onAdd() {
  const { word, definition } = form.value
  if (!word.trim() || !definition.trim()) { alert('Word and definition are required.'); return }
  const ok = addWord({ ...form.value })
  if (!ok) { alert(`"${word}" already exists.`); return }
  form.value = { word: '', definition: '', example: '', example_meaning: '', s3_correct: '', s3_wrong: '' }
  showForm.value = false
}

function onImportCSV(e) {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = ev => {
    const added = importCSV(ev.target.result)
    alert(`Imported ${added} new word(s).`)
  }
  reader.readAsText(file)
}

function saveAndBack() {
  downloadJSON()
  emit('back')
}
</script>

<style scoped>
.file-actions { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }

.add-form {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 20px; margin-bottom: 20px;
}
.add-form h3 { margin-bottom: 16px; font-size: 15px; }
.form-grid { display: grid; gap: 10px; }
.form-input {
  background: var(--surface2); border: 1px solid var(--border);
  color: var(--text); border-radius: var(--radius-sm);
  padding: 10px 14px; font-size: 14px; outline: none; width: 100%;
  font-family: 'DM Sans', sans-serif;
}
.form-input:focus { border-color: var(--gold); }

.empty-msg { color: var(--text3); text-align: center; padding: 32px; }

.word-list { display: flex; flex-direction: column; gap: 10px; }
.word-item {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 14px 18px;
  display: flex; align-items: center; justify-content: space-between;
}
.w-name { font-family: 'JetBrains Mono', monospace; font-size: 15px; color: var(--gold); }
.w-def  { font-size: 13px; color: var(--text2); margin-top: 3px; }
.word-status {
  padding: 4px 10px; border-radius: 100px; font-size: 11px;
  font-family: 'JetBrains Mono', monospace; white-space: nowrap;
}
.ws-waiting  { background: var(--surface2); color: var(--text3); }
.ws-learning { background: rgba(92,158,224,0.12); color: var(--blue); }
.ws-mastered { background: var(--green-dim); color: var(--green); }
</style>
