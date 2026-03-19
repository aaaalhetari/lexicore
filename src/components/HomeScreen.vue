<template>
  <div class="home-page">
    <div class="home-hero">
      <h1>Master Every Word</h1>
      <p>A precision vocabulary trainer built on active recall, spaced cycles, and zero guesswork.</p>
    </div>

    <!-- Progress Ring + Key Stats -->
    <div v-if="stats.total > 0" class="dashboard">
      <div class="progress-ring-wrap">
        <svg class="progress-ring" viewBox="0 0 120 120">
          <circle class="ring-bg" cx="60" cy="60" r="52" />
          <circle
            class="ring-fill"
            cx="60" cy="60" r="52"
            :stroke-dasharray="circumference"
            :stroke-dashoffset="circumference - (circumference * masteryPct / 100)"
          />
        </svg>
        <div class="ring-label">
          <div class="ring-pct">{{ masteryPct }}%</div>
          <div class="ring-sub">mastered</div>
        </div>
      </div>

      <div class="key-stats">
        <div class="ks-row">
          <div class="ks-icon">📚</div>
          <div class="ks-info">
            <div class="ks-num">{{ stats.total }}</div>
            <div class="ks-label">Total Words</div>
          </div>
        </div>
        <div class="ks-row">
          <div class="ks-icon">🏆</div>
          <div class="ks-info">
            <div class="ks-num">{{ stats.mastered ?? 0 }}</div>
            <div class="ks-label">Mastered</div>
          </div>
        </div>
        <div class="ks-row">
          <div class="ks-icon">📘</div>
          <div class="ks-info">
            <div class="ks-num">{{ stats.learningBeforeToday ?? 0 }}</div>
            <div class="ks-label">Old Learning</div>
          </div>
        </div>
        <div class="ks-row">
          <div class="ks-icon">🧠</div>
          <div class="ks-info">
            <div class="ks-num">{{ stats.learningToday ?? 0 }}</div>
            <div class="ks-label">Learning Today</div>
          </div>
        </div>
        <div class="ks-row">
          <div class="ks-icon">✨</div>
          <div class="ks-info">
            <div class="ks-num">{{ stats.newWord }}</div>
            <div class="ks-label">New Today <span class="ks-dim">/ {{ stats.newWordsPerDay ?? 25 }}</span></div>
          </div>
        </div>
        <div class="ks-row">
          <div class="ks-icon">⏳</div>
          <div class="ks-info">
            <div class="ks-num">{{ stats.waiting }}</div>
            <div class="ks-label">Waiting <span class="ks-dim">/ {{ stats.waiting_target ?? 50 }}</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Mastery Bar -->
    <div v-if="stats.total > 0" class="mastery-bar-wrap">
      <div class="mastery-bar">
        <div class="mb-segment mb-mastered" :style="{ width: segPct('mastered') + '%' }" />
        <div class="mb-segment mb-learning" :style="{ width: segPct('learning') + '%' }" />
        <div class="mb-segment mb-new" :style="{ width: segPct('newWord') + '%' }" />
        <div class="mb-segment mb-waiting" :style="{ width: segPct('waiting') + '%' }" />
      </div>
      <div class="mb-legend">
        <span class="mb-dot mb-mastered" />Mastered
        <span class="mb-dot mb-learning" />Learning
        <span class="mb-dot mb-new" />New
        <span class="mb-dot mb-waiting" />Waiting
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
const circumference = 2 * Math.PI * 52
const masteryPct = computed(() => {
  const t = stats.value.total || 1
  return Math.round((stats.value.mastered / t) * 100)
})
function segPct(key) {
  const t = stats.value.total || 1
  return Math.round(((stats.value[key] ?? 0) / t) * 100)
}
</script>

<style scoped>
.home-page {
  padding-bottom: calc(var(--tap) * 1.3);
}

.home-hero {
  text-align: center;
  padding: 18px 0 16px;
  margin-bottom: 10px;
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

/* ── Dashboard: ring + stats ─────────────── */
.dashboard {
  display: flex;
  align-items: center;
  gap: 20px;
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.03), transparent 36%), var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  margin-bottom: 12px;
  box-shadow: var(--shadow-sm);
}

.progress-ring-wrap {
  position: relative;
  width: 110px;
  height: 110px;
  flex-shrink: 0;
}
.progress-ring {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.ring-bg {
  fill: none;
  stroke: var(--border);
  stroke-width: 10;
}
.ring-fill {
  fill: none;
  stroke: var(--gold);
  stroke-width: 10;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.6s ease;
}
.ring-label {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.ring-pct {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--gold);
  line-height: 1;
}
.ring-sub {
  font-size: 0.65rem;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 2px;
}

.key-stats {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ks-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ks-icon {
  font-size: 1.15rem;
  width: 28px;
  text-align: center;
  flex-shrink: 0;
}
.ks-info { flex: 1; display: flex; align-items: baseline; gap: 8px; }
.ks-num {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--text);
  min-width: 28px;
}
.ks-label {
  font-size: 0.82rem;
  color: var(--text2);
}
.ks-dim {
  color: var(--text3);
  font-size: 0.75rem;
}

/* ── Mastery breakdown bar ─────────────── */
.mastery-bar-wrap {
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.02), transparent 45%), var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 12px;
  box-shadow: var(--shadow-sm);
}
.mastery-bar {
  display: flex;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  background: var(--surface2);
}
.mb-segment {
  transition: width 0.5s ease;
  min-width: 0;
}
.mb-segment.mb-mastered { background: var(--gold); }
.mb-segment.mb-learning { background: var(--green); }
.mb-segment.mb-new { background: #5b9bd5; }
.mb-segment.mb-waiting { background: var(--border); }

.mb-legend {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 0.7rem;
  color: var(--text3);
  flex-wrap: wrap;
}
.mb-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  margin-left: 8px;
}
.mb-dot:first-child { margin-left: 0; }
.mb-dot.mb-mastered { background: var(--gold); }
.mb-dot.mb-learning { background: var(--green); }
.mb-dot.mb-new { background: #5b9bd5; }
.mb-dot.mb-waiting { background: var(--border); }

/* ── Action cards ─────────────── */
.home-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}
.home-card {
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.02), transparent 35%), var(--surface);
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
  box-shadow: var(--shadow-sm);
}
.home-card:active { transform: scale(0.98); }
.home-card:hover {
  border-color: var(--gold);
  background: linear-gradient(155deg, rgba(210, 177, 90, 0.1), transparent 35%), var(--surface2);
}
.home-card .card-icon {
  font-size: 2rem;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.04), transparent), var(--surface2);
  border-radius: var(--radius-sm);
}
.home-card .card-text { flex: 1; min-width: 0; }
.home-card h3 { font-size: 1rem; font-weight: 500; margin-bottom: 2px; }
.home-card p { font-size: 0.85rem; color: var(--text2); }
</style>
