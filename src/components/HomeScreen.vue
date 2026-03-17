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
      <div class="stat-item" title="Words you can practice today">
        <div class="stat-num">{{ stats.eligibleToday }}</div>
        <div class="stat-label">Available Today</div>
      </div>
    </div>

    <!-- Action Cards -->
    <div class="home-actions">
      <div class="home-card" @click="$emit('start')">
        <div class="card-icon">🎯</div>
        <div class="card-text">
          <h3>Start Session</h3>
          <p>Continue your training</p>
        </div>
      </div>
      <div class="home-card" @click="$emit('words')">
        <div class="card-icon">📖</div>
        <div class="card-text">
          <h3>Word List</h3>
          <p>View all your words</p>
        </div>
      </div>
      <div class="home-card" @click="$emit('settings')">
        <div class="card-icon">⚙️</div>
        <div class="card-text">
          <h3>Settings</h3>
          <p>Account & preferences</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { getStats } from '../store/data.js'

defineEmits(['start', 'words', 'settings'])

const stats = computed(() => getStats())
</script>

<style scoped>
.home-hero {
  text-align: center;
  padding: 28px 0 24px;
  margin-bottom: 20px;
}
.home-hero h1 {
  font-family: 'Fraunces', serif;
  font-size: clamp(1.8rem, 5vw, 2.4rem);
  font-weight: 700;
  background: linear-gradient(135deg, var(--gold2), var(--gold));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  line-height: 1.2;
  margin-bottom: 8px;
}
.home-hero p {
  color: var(--text2);
  font-size: 0.95rem;
  line-height: 1.5;
  margin: 0 auto;
}

.stats-bar {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 16px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 10px;
}
.stats-bar-2 { grid-template-columns: 1fr 1fr; }
.stat-item { text-align: center; }
.stat-num {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1.25rem;
  font-weight: 500;
  color: var(--gold);
}
.stat-label {
  font-size: 0.65rem;
  color: var(--text3);
  margin-top: 2px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.home-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 20px;
}
.home-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px 18px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 72px;
  -webkit-tap-highlight-color: transparent;
}
.home-card:active { transform: scale(0.98); }
.home-card:hover { border-color: var(--gold); background: var(--surface2); }
.home-card .card-icon {
  font-size: 2rem;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface2);
  border-radius: var(--radius-sm);
}
.home-card .card-text { flex: 1; min-width: 0; }
.home-card h3 { font-size: 1rem; font-weight: 500; margin-bottom: 2px; }
.home-card p { font-size: 0.85rem; color: var(--text2); }
</style>
