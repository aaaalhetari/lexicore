<template>
  <div class="card placeholder-only">
    <StageCardToolbar
      :generating="generating"
      :is-muted="isMuted"
      :show-exit="showExit"
      @generate="$emit('generate')"
      @play="$emit('play')"
      @mute="$emit('mute')"
      @exit="$emit('exit')"
    />

    <div class="placeholder-warn">
      <span>⚠️ Card content not generated yet.</span>
      <div class="placeholder-actions">
        <button class="btn-generate" :disabled="generating" @click="$emit('generate')">
          {{ generating ? '⏳ Generating…' : '☁️ Make full card' }}
        </button>
        <button class="btn-skip" :disabled="generating" @click="$emit('skip')">Skip & continue →</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import StageCardToolbar from './StageCardToolbar.vue'

defineProps({
  generating: { type: Boolean, default: false },
  isMuted: { type: Boolean, default: false },
  showExit: { type: Boolean, default: true },
})

defineEmits(['generate', 'play', 'mute', 'exit', 'skip'])
</script>

<style scoped>
.card.placeholder-only {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.placeholder-warn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  background: linear-gradient(160deg, rgba(224, 92, 92, 0.14), rgba(224, 92, 92, 0.06) 60%);
  border: 1px solid rgba(224, 92, 92, 0.3);
  border-radius: var(--radius-sm);
  padding: 14px 18px;
  margin-bottom: 12px;
  font-size: 0.9rem;
  color: var(--red);
  box-shadow: 0 4px 16px rgba(224, 92, 92, 0.06);
}

.placeholder-warn .placeholder-actions { flex: 0 0 auto; }

.placeholder-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.btn-generate {
  background: linear-gradient(160deg, rgba(210, 177, 90, 0.08), transparent 50%), var(--surface2);
  border: 1px solid var(--gold);
  color: var(--gold);
  padding: 9px 16px;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  cursor: pointer;
  font-family: 'DM Sans', sans-serif;
  min-width: 120px;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.btn-generate:hover:not(:disabled) {
  background: linear-gradient(160deg, rgba(210, 177, 90, 0.2), transparent 50%), var(--surface2);
  border-color: var(--gold2);
  color: var(--gold2);
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
}

.btn-generate:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-skip {
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.025), transparent), var(--surface2);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 9px 16px;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  cursor: pointer;
  font-family: 'DM Sans', sans-serif;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.btn-skip:hover {
  border-color: var(--gold);
  color: var(--gold);
  transform: translateY(-1px);
}
</style>
