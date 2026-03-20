<template>
  <div class="words-page">
    <!-- Page Header -->
    <div class="page-bar">
      <button class="back-btn" @click="$emit('back')" title="Back">
        <span class="back-arrow">←</span> Word List
      </button>
    </div>

    <!-- File Actions -->
    <div class="file-actions card">
      <label class="btn btn-secondary" style="cursor:pointer">
        ⬆ Import CSV
        <input type="file" accept=".csv" @change="onImportCSV" style="display:none">
      </label>
      <button class="btn btn-secondary" @click="downloadCSV()">⬇ Export CSV</button>
    </div>

    <!-- Word List -->
    <div v-if="words.length === 0" class="empty-msg card">
      No active study words (new / learning). Waiting and mastered are not listed here.
    </div>
    <div v-else class="word-list">
      <div v-for="w in words" :key="w.id" class="word-item">
        <div>
          <div class="w-name">{{ w.word }}</div>
          <div class="w-def">{{ w.definition }}</div>
        </div>
        <span class="word-status" :class="statusClass(w)">{{ statusLabel(w) }}</span>
      </div>
    </div>

  </div>
</template>

<script setup>
import { computed } from 'vue'
import { getData, importCSV, downloadCSV } from '../store/data.js'

defineEmits(['back'])

const words = computed(() => getData().words)

function statusClass(w) {
  return {
    waiting: 'ws-waiting',
    new_word: 'ws-new-word',
    learning_today: 'ws-learning-today',
    learning_before_today: 'ws-learning',
    mastered: 'ws-mastered',
  }[w.status] || 'ws-waiting'
}
function statusLabel(w) {
  if (w.status === 'learning_today' || w.status === 'learning_before_today') return `C${w.cycle} S${w.stage}`
  if (w.status === 'new_word') return 'New'
  return w.status?.replace(/_/g, ' ') || w.status
}

async function onImportCSV(e) {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async (ev) => {
    const added = await importCSV(ev.target.result)
    alert(`Imported ${added} new word(s).`)
  }
  reader.readAsText(file)
}

</script>

<style scoped>
.words-page {
  padding-bottom: calc(var(--sp) * 2);
}

.file-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.empty-msg {
  color: var(--text3);
  text-align: center;
  padding: 22px;
}

.word-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 80px;
}
.word-item {
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.02), transparent 35%), var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px;
  box-shadow: var(--shadow-sm);
}
.w-name { font-family: 'JetBrains Mono', monospace; font-size: 1.05rem; color: var(--gold); }
.w-def  { font-size: 0.95rem; color: var(--text2); margin-top: 3px; }
.word-status {
  padding: 4px 10px; border-radius: 100px; font-size: 0.8rem;
  font-family: 'JetBrains Mono', monospace; white-space: nowrap;
}
.ws-waiting  { background: var(--surface2); color: var(--text3); }
.ws-new-word { background: rgba(201,168,76,0.15); color: var(--gold); }
.ws-learning-today { background: rgba(92,158,224,0.2); color: var(--blue); }
.ws-learning { background: rgba(92,158,224,0.12); color: var(--blue); }
.ws-mastered { background: var(--green-dim); color: var(--green); }

@media (max-width: 420px) {
  .file-actions :deep(.btn) {
    flex: 1;
    min-width: 130px;
  }
}
</style>
