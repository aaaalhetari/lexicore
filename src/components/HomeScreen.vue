<template>
  <div class="home-page">
    <!-- Key stats: two groups (not only total — RPC may lag or fallback uses local words for mix) -->
    <div v-if="showStatsDashboard" class="dashboard">
      <div class="key-stats">
        <div class="ks-group">
          <div class="ks-group-title">Learning mix</div>
          <div class="ks-row">
            <div class="ks-icon">📘</div>
            <div class="ks-info">
              <div class="ks-num">{{ stats.learningBeforeToday ?? 0 }}</div>
              <div class="ks-label">Learning before today</div>
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
          <div class="ks-row ks-sum">
            <div class="ks-icon">∑</div>
            <div class="ks-info">
              <div class="ks-num">{{ learningMixSum }}</div>
              <div class="ks-label">Sum <span class="ks-dim">(before today + today + new)</span></div>
            </div>
          </div>
        </div>

        <div class="ks-group ks-group-secondary">
          <div class="ks-group-title">Pool</div>
          <div class="ks-row">
            <div class="ks-icon">📋</div>
            <div class="ks-info">
              <div class="ks-num">{{ stats.eligibleToday ?? 0 }}</div>
              <div class="ks-label">Remaining</div>
            </div>
          </div>
          <div class="ks-row">
            <div class="ks-icon">⏳</div>
            <div class="ks-info">
              <div class="ks-num">{{ stats.waiting }}</div>
              <div class="ks-label">Waiting <span class="ks-dim">/ {{ stats.waiting_target ?? 50 }}</span></div>
            </div>
          </div>
          <div class="ks-row">
            <div class="ks-icon">🏆</div>
            <div class="ks-info">
              <div class="ks-num">{{ stats.mastered ?? 0 }}</div>
              <div class="ks-label">Mastered</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Learning mix bar (same breakdown as the stats group above) -->
    <div v-if="showStatsDashboard" class="mastery-bar-wrap">
      <div class="mix-bar-title">Learning mix</div>
      <div class="mastery-bar">
        <div
          class="mb-segment mb-mix-before"
          :style="{ width: mixSegPct('beforeToday') + '%' }"
        />
        <div
          class="mb-segment mb-mix-today"
          :style="{ width: mixSegPct('learningToday') + '%' }"
        />
        <div
          class="mb-segment mb-mix-new"
          :style="{ width: mixSegPct('newToday') + '%' }"
        />
      </div>
      <div class="mb-legend">
        <span class="mb-dot mb-mix-before" />Before today
        <span class="mb-dot mb-mix-today" />Today
        <span class="mb-dot mb-mix-new" />New today
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
          <p>New and learning words only</p>
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
import { computed, onMounted } from 'vue'
import { getStats } from '../store/data.js'
import { fetchStatsSummary } from '../store/realtime.js'

defineEmits(['start', 'words', 'settings'])

onMounted(() => {
  fetchStatsSummary()
})

const stats = computed(() => getStats())
const learningMixSum = computed(() => {
  const s = stats.value
  return (s.learningBeforeToday ?? 0) + (s.learningToday ?? 0) + (s.newWord ?? 0)
})
/** Show dashboard if there is any vocabulary activity (totals from server or learning mix from loaded words). */
const showStatsDashboard = computed(() => {
  const s = stats.value
  const mix = learningMixSum.value
  return (s.total ?? 0) > 0 || mix > 0 || (s.waiting ?? 0) > 0 || (s.mastered ?? 0) > 0
})
/** Width % for each slice of the learning-mix bar (denominator = sum of the three counts). */
function mixSegPct(part) {
  const s = stats.value
  const denom = learningMixSum.value || 1
  const v =
    part === 'beforeToday'
      ? (s.learningBeforeToday ?? 0)
      : part === 'learningToday'
        ? (s.learningToday ?? 0)
        : (s.newWord ?? 0)
  return Math.round((v / denom) * 100)
}
</script>

<style scoped>
.home-page {
  padding: calc(var(--sp) * 0.9) calc(var(--sp) * 0.9) calc(var(--tap) * 1.3);
}

/* ── Dashboard: grouped stats ─────────────── */
.dashboard {
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.03), transparent 36%), var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  margin-bottom: 12px;
  box-shadow: var(--shadow-sm);
}

.key-stats {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ks-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ks-group-secondary {
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.ks-group-title {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text3);
  margin-bottom: 2px;
}
.ks-row.ks-sum {
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
}
.ks-row.ks-sum .ks-icon {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.95rem;
  color: var(--gold);
}
.ks-row.ks-sum .ks-num {
  color: var(--gold);
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

/* ── Learning mix bar (matches ks-group "Learning mix") ─────────────── */
.mastery-bar-wrap {
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.02), transparent 45%), var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 12px;
  box-shadow: var(--shadow-sm);
}
.mix-bar-title {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text3);
  margin-bottom: 10px;
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
.mb-segment.mb-mix-before { background: var(--gold); }
.mb-segment.mb-mix-today { background: var(--green); }
.mb-segment.mb-mix-new { background: #5b9bd5; }

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
.mb-dot.mb-mix-before { background: var(--gold); }
.mb-dot.mb-mix-today { background: var(--green); }
.mb-dot.mb-mix-new { background: #5b9bd5; }

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
