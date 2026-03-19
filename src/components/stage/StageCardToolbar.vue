<template>
  <div class="card-toolbar">
    <button class="toolbar-btn generate" :disabled="generating" @click.stop="$emit('generate')" title="Make full card">
      {{ generating ? '⏳' : '☁️' }}
    </button>
    <button class="toolbar-btn play" @click.stop="$emit('play')" title="Play" :disabled="isMuted">🔊</button>
    <button class="toolbar-btn mute" @click.stop="$emit('mute')" :title="isMuted ? 'Unmute' : 'Mute'">
      {{ isMuted ? '🔇' : '🔈' }}
    </button>
    <button v-if="showExit" class="toolbar-btn exit" @click.stop="$emit('exit')" title="Exit">✕</button>
  </div>
</template>

<script setup>
defineProps({
  generating: { type: Boolean, default: false },
  isMuted: { type: Boolean, default: false },
  showExit: { type: Boolean, default: true },
})

defineEmits(['generate', 'play', 'mute', 'exit'])
</script>

<style scoped>
.card-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: clamp(8px, 2.5vw, 12px);
  flex-shrink: 0;
}

.toolbar-btn {
  width: clamp(42px, 12vw, 56px);
  height: clamp(42px, 12vw, 56px);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.03), transparent), var(--surface2);
  color: var(--text2);
  font-size: clamp(1.1rem, 4.5vw, 1.6rem);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18);
  transition: all 0.2s ease;
  -webkit-tap-highlight-color: transparent;
}

.toolbar-btn:hover {
  border-color: var(--gold);
  color: var(--gold);
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
}

.toolbar-btn:active { transform: translateY(0) scale(0.97); }
.toolbar-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.toolbar-btn.exit {
  color: var(--text3);
  font-size: clamp(0.9rem, 3.5vw, 1.2rem);
}
.toolbar-btn.exit:hover {
  color: var(--red);
  border-color: var(--red);
}
</style>
