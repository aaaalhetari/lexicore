<template>
  <div v-if="stats" class="session-stats-bar">
    <div class="stats-row">
      <div class="stat-item stat-cycles" :title="t.cycleTip">
        <span class="stat-lbl">{{ t.cycle }}</span>
        <div class="cycle-dots">
          <span v-for="c in 3" :key="'c'+c" class="dot" :class="{ active: stats.cycle === c }">{{ c }}</span>
        </div>
      </div>
      <div class="stat-item stat-stages" :title="t.stageTip">
        <span class="stat-lbl">{{ t.stage }}</span>
        <div class="stage-dots">
          <span v-for="s in 3" :key="'s'+s" class="dot" :class="{ active: stats.stage === s }">{{ s === 1 ? 'D' : s === 2 ? 'S' : 'U' }}</span>
        </div>
      </div>
      <div class="stat-item stat-progress" :title="t.progressTip">
        <span class="stat-lbl">{{ t.progress }}</span>
        <div class="progress-dots">
          <span v-for="i in Math.max(1, stats.displayRequired ?? 4)" :key="'p'+i" class="dot" :class="{ active: i <= (stats.displayCount ?? 0) }">{{ i }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, inject } from 'vue'

const props = defineProps({ stats: Object, lang: { type: String, default: '' } })
const locale = inject('locale', 'en')
const effectiveLang = computed(() => props.lang || locale)

const t = computed(() => {
  const ar = effectiveLang.value?.startsWith('ar')
  return ar ? {
    cycle: 'الدورة',
    cycleTip: 'دورة التعلم: 1=أولى، 2=ثانية، 3=ثالثة',
    stage: 'المرحلة',
    stageTip: 'D=تعريف، S=جملة، U=استخدام',
    progress: 'التقدم',
    progressTip: 'إجابات صحيحة مطلوبة للتقدم (مثلاً 2/4 = 2 من 4)',
  } : {
    cycle: 'Cycle',
    cycleTip: 'Learning cycle: 1=first pass, 2=second, 3=third',
    stage: 'Stage',
    stageTip: 'D=Definition, S=Sentence, U=Usage',
    progress: 'Progress',
    progressTip: 'Correct answers needed to advance (e.g. 2/4 = 2 of 4 done)',
  }
})
</script>

<style scoped>
.session-stats-bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex: 1;
  min-width: 0;
  font-size: 0.7rem;
}
.stats-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  min-height: 28px;
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: var(--text2);
}
.stat-item b { font-weight: 600; color: var(--text); font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; }
.stat-lbl {
  font-size: 0.58rem;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.6px;
}
.cycle-dots, .stage-dots, .progress-dots {
  display: flex;
  align-items: center;
  gap: 3px;
}
.stat-item .dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--surface3);
  color: var(--text3);
  font-size: 0.55rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.stat-item .dot.active {
  background: linear-gradient(140deg, rgba(210, 177, 90, 0.25), rgba(210, 177, 90, 0.1));
  color: var(--gold);
  border: 1px solid var(--gold);
  box-shadow: 0 0 8px rgba(210, 177, 90, 0.15);
}
</style>
