<template>
  <div class="home-page">
    <div v-if="statsLoadError" class="stats-warn card" role="status">
      <p class="stats-warn-text">Dashboard numbers may be incomplete (couldn’t load full stats).</p>
      <button type="button" class="btn btn-secondary stats-warn-retry" @click="retryStats">Retry</button>
    </div>

    <div v-if="showHomeEmpty" class="home-empty card">
      <p class="home-empty-title">No vocabulary activity yet</p>
      <p class="home-empty-hint">Start a session or open Word list once you’re signed in.</p>
      <div class="home-empty-actions">
        <button type="button" class="btn btn-primary" @click="$emit('start')">Start session</button>
        <button type="button" class="btn btn-secondary" @click="$emit('words')">Word list</button>
      </div>
    </div>

    <div v-if="showStatsDashboard" class="dashboard">
      <section class="dash-hero" aria-label="Today's study queue">
        <div class="dash-hero-top">
          <span class="dash-kicker">Today</span>
          <span class="dash-hero-hint">remaining cycles + new cards</span>
        </div>
        <div class="dash-hero-mid">
          <span class="dash-hero-num">{{ remainingPlusNewSum }}</span>
          <span class="dash-hero-unit">cards</span>
        </div>
        <div class="dash-hero-split">
          <div
            class="dash-pill dash-pill-rem"
            title="Learning cards still due today (cycles not finished today)"
          >
            <span class="dash-pill-n">{{ stats.eligibleToday ?? 0 }}</span>
            <span class="dash-pill-l">Remaining</span>
          </div>
          <span class="dash-plus" aria-hidden="true">+</span>
          <div
            class="dash-pill dash-pill-new"
            title="New words queued for today’s session (from your daily quota)"
          >
            <span class="dash-pill-n">{{ stats.newWord ?? 0 }}</span>
            <span class="dash-pill-l">New</span>
          </div>
        </div>
      </section>

      <section class="dash-section" aria-label="Learning mix">
        <span class="dash-section-title">Learning mix</span>
        <div
          class="mastery-bar"
          role="img"
          :aria-label="`Mix: ${mixBarPct.before}% before today, ${mixBarPct.today}% today`"
        >
          <div class="mb-segment mb-mix-before" :style="{ width: mixBarPct.before + '%' }" />
          <div class="mb-segment mb-mix-today" :style="{ width: mixBarPct.today + '%' }" />
        </div>
        <div class="dash-mix-tiles">
          <div class="dash-tile">
            <span class="dash-tile-n">{{ stats.learningBeforeToday ?? 0 }}</span>
            <span class="dash-tile-l">Words learned before today</span>
            <span class="dash-tile-dot dbefore" aria-hidden="true" />
          </div>
          <div class="dash-tile">
            <span class="dash-tile-n">{{ stats.learningToday ?? 0 }}</span>
            <span class="dash-tile-l">New words learned today</span>
            <span class="dash-tile-dot dtoday" aria-hidden="true" />
          </div>
        </div>
      </section>

      <section
        class="dash-section dash-pool"
        aria-label="Word pool"
        title="Pre-generated waiting words vs your target (same as Settings → Pool)"
      >
        <div class="dash-pool-inner">
          <div class="dash-pool-main">
            <div class="dash-pool-row">
              <span class="dash-pool-title">Pool</span>
              <span class="dash-pool-caption">waiting vs target</span>
              <span class="dash-pool-nums">{{ stats.waiting ?? 0 }} / {{ stats.waiting_target ?? 50 }}</span>
            </div>
            <div
              class="dash-pool-track"
              role="progressbar"
              :aria-valuenow="waitingBufferPct"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-label="Waiting words vs target"
            >
              <div class="dash-pool-fill" :style="{ width: waitingBufferPct + '%' }" />
            </div>
          </div>
          <div
            class="dash-pool-mastered"
            aria-label="Mastered words"
            title="Words that completed all cycles"
          >
            <span class="dash-pool-m-num">{{ stats.mastered ?? 0 }}</span>
            <span class="dash-pool-m-lbl">mastered</span>
          </div>
        </div>
      </section>
    </div>

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
import { computed } from 'vue'
import { hasSupabase } from '../lib/supabase.js'
import { getStats, getStatsLoadError } from '../store/data.js'
import { isReady, requestQuickResync } from '../store/realtime.js'

defineEmits(['start', 'words', 'settings'])

const stats = computed(() => getStats())
const statsLoadError = computed(() => getStatsLoadError())

function retryStats() {
  requestQuickResync(0)
}
/** Bar widths: before-today vs learning-today only (excludes new_word). */
const mixBarPct = computed(() => {
  const s = stats.value
  const b = s.learningBeforeToday ?? 0
  const t = s.learningToday ?? 0
  const denom = Math.max(1, b + t)
  return { before: Math.round((b / denom) * 100), today: Math.round((t / denom) * 100) }
})
const remainingPlusNewSum = computed(() => {
  const s = stats.value
  return (s.eligibleToday ?? 0) + (s.newWord ?? 0)
})
/** % of waiting buffer vs target (cap 100). */
const waitingBufferPct = computed(() => {
  const s = stats.value
  const cap = Math.max(1, Number(s.waiting_target) || 50)
  return Math.min(100, Math.round(((Number(s.waiting) || 0) / cap) * 100))
})
/** Show dashboard if there is any vocabulary activity (totals from server or learning mix from loaded words). */
const showStatsDashboard = computed(() => {
  const s = stats.value
  const activeMix =
    (s.learningBeforeToday ?? 0) + (s.learningToday ?? 0) + (s.newWord ?? 0)
  return (
    (s.total ?? 0) > 0 ||
    activeMix > 0 ||
    (s.waiting ?? 0) > 0 ||
    (s.mastered ?? 0) > 0
  )
})

const showHomeEmpty = computed(
  () => hasSupabase() && isReady() && !showStatsDashboard.value
)
</script>

<style scoped>
.home-page {
  padding: calc(var(--sp) * 0.9) calc(var(--sp) * 0.9) calc(var(--tap) * 1.3);
}

.stats-warn {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 12px;
  background: var(--red-dim);
  border-color: rgba(224, 92, 92, 0.35);
}
.stats-warn-text {
  margin: 0;
  font-size: 0.88rem;
  color: var(--text2);
  flex: 1 1 200px;
}
.stats-warn-retry {
  flex-shrink: 0;
}

.home-empty {
  padding: 20px 16px;
  margin-bottom: 14px;
  text-align: center;
}
.home-empty-title {
  margin: 0 0 8px;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text);
}
.home-empty-hint {
  margin: 0 0 16px;
  font-size: 0.88rem;
  color: var(--text3);
  line-height: 1.45;
}
.home-empty-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
@media (min-width: 420px) {
  .home-empty-actions {
    flex-direction: row;
    justify-content: center;
  }
}

/* ── Dashboard (unified) ─────────────── */
.dashboard {
  background: linear-gradient(165deg, rgba(210, 177, 90, 0.06), transparent 42%), var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0;
  margin-bottom: 14px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.dash-hero {
  padding: 18px 18px 16px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent);
  border-bottom: 1px solid var(--border);
}
.dash-hero-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}
.dash-kicker {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--gold);
}
.dash-hero-hint {
  font-size: 0.72rem;
  color: var(--text3);
  text-align: right;
}
.dash-hero-mid {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 12px;
}
.dash-hero-num {
  font-family: 'JetBrains Mono', monospace;
  font-size: 2.35rem;
  font-weight: 700;
  line-height: 1;
  color: var(--text);
  letter-spacing: -0.02em;
}
.dash-hero-unit {
  font-size: 0.85rem;
  color: var(--text3);
  font-weight: 500;
}
.dash-hero-split {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.dash-pill {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface2);
}
.dash-pill-n {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text);
}
.dash-pill-l {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text3);
}
.dash-pill-rem .dash-pill-n { color: var(--green); }
.dash-pill-new .dash-pill-n { color: #6ba3d6; }
.dash-plus {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text3);
  flex-shrink: 0;
}

.dash-section {
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
}
.dash-section:last-of-type {
  border-bottom: none;
}
.dash-pool {
  background: rgba(0, 0, 0, 0.12);
}
.dash-pool-inner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px 14px;
  align-items: end;
}
.dash-pool-main {
  min-width: 0;
}
.dash-pool-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: baseline;
  gap: 8px 10px;
  margin-bottom: 8px;
  font-size: 0.72rem;
}
.dash-pool-title {
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text3);
}
.dash-pool-caption {
  color: var(--text3);
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dash-pool-nums {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text);
  text-align: right;
}
.dash-pool-track {
  height: 6px;
  border-radius: 3px;
  background: var(--surface2);
  overflow: hidden;
}
.dash-pool-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s ease;
  background: linear-gradient(90deg, #6b5a3a, var(--gold));
}
.dash-pool-mastered {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface2);
  min-width: 76px;
}
.dash-pool-m-num {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--green);
  line-height: 1.2;
}
.dash-pool-m-lbl {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text3);
  margin-top: 4px;
}
.dash-section-title {
  display: block;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text3);
  margin-bottom: 12px;
}

.mastery-bar {
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--surface2);
  margin-bottom: 12px;
}
.mb-segment {
  transition: width 0.45s ease;
  min-width: 0;
}
.mb-segment.mb-mix-before { background: var(--gold); }
.mb-segment.mb-mix-today { background: var(--green); }

.dash-mix-tiles {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.dash-tile {
  position: relative;
  padding: 10px 8px 10px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface2);
  border: 1px solid rgba(255, 255, 255, 0.06);
  min-width: 0;
}
.dash-tile-n {
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text);
}
.dash-tile-l {
  display: block;
  font-size: 0.62rem;
  color: var(--text3);
  margin-top: 4px;
  line-height: 1.35;
  hyphens: auto;
}
.dash-tile-dot {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.dash-tile-dot.dbefore { background: var(--gold); }
.dash-tile-dot.dtoday { background: var(--green); }

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
