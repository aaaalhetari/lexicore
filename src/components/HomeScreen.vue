<template>
  <div>
    <div class="home-hero">
      <h1>Master Every Word</h1>
      <p>A precision vocabulary trainer built on active recall, spaced cycles, and zero guesswork.</p>
    </div>

    <!-- Stats Row 1 -->
    <div v-if="stats.total > 0" class="stats-bar">
      <div class="stat-item">
        <div class="stat-num">{{ stats.total }}</div>
        <div class="stat-label">Total</div>
      </div>
      <div class="stat-item">
        <div class="stat-num">{{ stats.learning }}</div>
        <div class="stat-label">Learning</div>
      </div>
      <div class="stat-item">
        <div class="stat-num">{{ stats.mastered }}</div>
        <div class="stat-label">Mastered</div>
      </div>
      <div class="stat-item">
        <div class="stat-num">{{ stats.waiting }}</div>
        <div class="stat-label">Waiting</div>
      </div>
    </div>

    <!-- Stats Row 2 -->
    <div v-if="stats.total > 0" class="stats-bar stats-bar-2">
      <div class="stat-item">
        <div class="stat-num">{{ stats.todayAnswered }}</div>
        <div class="stat-label">Questions Today</div>
      </div>
      <div class="stat-item" title="Max words you can practice today (1 cycle per word per day)">
        <div class="stat-num">{{ stats.availableToday }}</div>
        <div class="stat-label">Available Today</div>
      </div>
    </div>

    <!-- Add Word (compact) -->
    <div class="add-word-card">
      <h3 class="add-word-title">+ Add Word</h3>
      <div class="add-word-row">
        <input v-model="addForm.word" placeholder="Word" class="form-input" @keydown.enter="onAddWord">
        <input v-model="addForm.definition" placeholder="Definition" class="form-input" @keydown.enter="onAddWord">
        <button class="btn btn-primary" @click="onAddWord">Add</button>
      </div>
    </div>

    <!-- Action Cards -->
    <div class="home-actions">
      <div class="home-card" @click="$emit('start')">
        <div class="card-icon">🎯</div>
        <h3>Start Session</h3>
        <p>Continue your training</p>
      </div>
      <div class="home-card" @click="$emit('words')">
        <div class="card-icon">📖</div>
        <h3>Word List</h3>
        <p>View all your words</p>
      </div>
      <div class="home-card" @click="$emit('settings')">
        <div class="card-icon">⚙️</div>
        <h3>Settings</h3>
        <p>Account & preferences</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { getStats, addWord } from '../store/data.js'

defineEmits(['start', 'words', 'settings'])

const addForm = ref({ word: '', definition: '' })

async function onAddWord() {
  const { word, definition } = addForm.value
  if (!word.trim() || !definition.trim()) {
    alert('Word and definition are required.')
    return
  }
  const ok = await addWord({ word: word.trim(), definition: definition.trim() })
  if (!ok) {
    alert(`"${word}" already exists.`)
    return
  }
  addForm.value = { word: '', definition: '' }
}

const stats = computed(() => getStats())
</script>

<style scoped>
.home-hero {
  text-align: center; padding: 40px 0 48px;
  border-bottom: 1px solid var(--border); margin-bottom: 28px;
}
.home-hero h1 {
  font-family: 'Fraunces', serif;
  font-size: clamp(2.2rem, 2.4vw + 1.2rem, 3.8rem); font-weight: 700;
  background: linear-gradient(135deg, var(--gold2), var(--gold));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  line-height: 1.2; margin-bottom: 12px;
}
.home-hero p { color: var(--text2); font-size: 1.05rem; line-height: 1.6; max-width: 60ch; margin: 0 auto; }

.stats-bar {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 16px 20px;
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 12px; margin-bottom: 12px;
}
.stats-bar-2 { grid-template-columns: 1fr 1fr; }
.stat-item { text-align: center; }
.stat-num { font-family: 'JetBrains Mono', monospace; font-size: 1.45rem; font-weight: 500; color: var(--gold); }
.stat-label { font-size: 0.75rem; color: var(--text3); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }

.add-word-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 16px 20px;
  margin-bottom: 20px;
}
.add-word-title { font-size: 0.9rem; color: var(--text3); margin-bottom: 12px; }
.add-word-row {
  display: flex; gap: 10px; flex-wrap: wrap;
}
.add-word-row .form-input {
  flex: 1; min-width: 120px;
  background: var(--surface2); border: 1px solid var(--border);
  color: var(--text); border-radius: var(--radius-sm);
  padding: 10px 14px; font-size: 1rem; outline: none;
  font-family: 'DM Sans', sans-serif;
}
.add-word-row .form-input:focus { border-color: var(--gold); }

.home-actions { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 14px; margin-top: 24px; }
.home-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 24px 20px;
  cursor: pointer; transition: all 0.25s; text-align: center;
}
.home-card:hover { border-color: var(--gold); background: var(--surface2); transform: translateY(-2px); }
.home-card .card-icon { font-size: 2rem; margin-bottom: 12px; }
.home-card h3 { font-size: 1.05rem; font-weight: 500; margin-bottom: 6px; }
.home-card p { font-size: 0.95rem; color: var(--text2); }
</style>
