<template>
  <div class="stage1-root">
    <StagePlaceholderCard
      v-if="isPlaceholder"
      :generating="generating"
      :is-muted="isMuted"
      :show-exit="!!sessionStats"
      @generate="onMakeFullCard"
      @play="onPlayClick"
      @mute="toggleMute"
      @exit="sessionStats?.onClose?.()"
      @skip="emit('skip')"
    />
    <div
      v-else
      class="card unified-card"
      :class="{ 'feedback-correct': feedback?.type === 'correct', 'feedback-wrong': feedback?.type === 'wrong' }"
      @click="onCardTap"
    >
      <div v-if="sessionStats" class="card-stats">
        <SessionStatsBar :stats="sessionStats" />
      </div>
      <StageCardToolbar
        :generating="generating"
        :is-muted="isMuted"
        :show-exit="!!sessionStats"
        @generate="onMakeFullCard"
        @play="onPlayClick"
        @mute="toggleMute"
        @exit="sessionStats?.onClose?.()"
      />
      <div class="definition-label">Choose the right definition</div>
      <div class="word-display">{{ word?.word }}</div>
      <div class="choices-defs no-swipe-scroll">
        <button
          v-for="(choice, ci) in choices"
          :key="ci"
          class="choice-btn"
          :class="{
            correct: answered && choice.wordId === word.id,
            wrong: answered && chosenIndex === ci && choice.wordId !== word.id,
          }"
          :disabled="answered"
          @click.stop="answer(ci)"
        >
          {{ choice.definition }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted, watch, inject } from 'vue'
import SessionStatsBar from '../SessionStatsBar.vue'
import StageCardToolbar from './StageCardToolbar.vue'
import StagePlaceholderCard from './StagePlaceholderCard.vue'
import { useAudio } from '../../composables/useAudio.js'
import { makeFullCard } from '../../store/data.js'
import { refetchWord } from '../../store/realtime.js'
import { getCurrentUser } from '../../store/sync.js'

const props = defineProps({
  word: Object,
  distractorPool: Array,
  feedback: Object,
  sessionStats: Object,
})
const emit = defineEmits(['answered', 'skip', 'content-generated'])

const { playWord, playStoredAudio, stopAudio, toggleMute, isMuted } = inject('sessionAudio') ?? useAudio()
const answered = ref(false)
const chosenIndex = ref(null)
const generating = ref(false)
const choices = ref([])

const isPlaceholder = computed(() => {
  const defs = props.word?.stage1_definitions ?? []
  return !defs.some((d) => d.is_correct)
})

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildChoices() {
  if (!props.word) return
  const defs = props.word.stage1_definitions ?? []
  const correctDefs = defs.filter((d) => d.is_correct)
  if (!correctDefs.length) return

  const correctDef = correctDefs[Math.floor(Math.random() * correctDefs.length)]
  const correctChoice = { wordId: props.word.id, definition: correctDef.definition }

  const candidates = (props.distractorPool ?? []).filter(
    (w) => w.id !== props.word.id && w.stage1_definitions?.some((d) => d.is_correct),
  )

  const picked = []
  const pool = shuffle(candidates)
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const w = pool[i]
    const wDefs = (w.stage1_definitions ?? []).filter((d) => d.is_correct)
    const def =
      wDefs.length > 0
        ? wDefs[Math.floor(Math.random() * wDefs.length)]
        : { definition: w.definition || 'Unknown' }
    picked.push({ wordId: w.id, definition: def.definition || w.definition || 'Unknown' })
  }

  choices.value = shuffle([correctChoice, ...picked])
}

watch(() => props.word?.id, () => buildChoices(), { immediate: true })

function playCardAudio() {
  if (isMuted.value || !props.word) return
  stopAudio()
  if (props.word.audio_word) playStoredAudio(props.word.audio_word, 5)
}

watch(
  () => props.sessionStats,
  (stats, prev) => {
    if (stats && !prev) playCardAudio()
    if (!stats && prev) stopAudio()
  },
  { immediate: true },
)

onUnmounted(() => stopAudio())

function onCardTap() {
  if (isMuted.value || !props.word) return
  if (props.word.audio_word) playStoredAudio(props.word.audio_word, 5)
}

function onPlayClick() {
  if (isMuted.value || !props.word) return
  if (props.word.audio_word) playStoredAudio(props.word.audio_word, 5)
}

async function onMakeFullCard() {
  if (!props.word?.id || !props.word?.word || generating.value) return
  const user = await getCurrentUser()
  if (!user) {
    alert('Sign in required')
    return
  }
  generating.value = true
  try {
    await makeFullCard(user.id, props.word.id, props.word.word)
    await new Promise((r) => setTimeout(r, 800))
    await refetchWord(props.word.id, user.id)
    emit('content-generated', props.word.id)
  } catch (e) {
    alert('Generate failed: ' + (e?.message || e))
  } finally {
    generating.value = false
  }
}

function answer(index) {
  if (answered.value) return
  stopAudio()
  answered.value = true
  chosenIndex.value = index
  const choice = choices.value[index]
  playWord(props.word, 5)
  emit('answered', choice.wordId === props.word.id)
}
</script>

<style scoped>
.unified-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  border: 1px solid var(--border);
  transition: background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
  min-height: 0;
}
.card-stats {
  flex-shrink: 0;
  width: 100%;
}
.unified-card.feedback-correct {
  background: linear-gradient(160deg, rgba(76, 175, 130, 0.18), rgba(76, 175, 130, 0.06) 60%) !important;
  border: 2px solid var(--green) !important;
  box-shadow: 0 0 24px rgba(76, 175, 130, 0.12);
}
.unified-card.feedback-wrong {
  background: linear-gradient(160deg, rgba(224, 92, 92, 0.18), rgba(224, 92, 92, 0.06) 60%) !important;
  border: 2px solid var(--red) !important;
  box-shadow: 0 0 24px rgba(224, 92, 92, 0.12);
}

.word-display {
  font-family: 'Fraunces', serif;
  font-size: clamp(1.8rem, 2.4vmin + 1rem, 2.8rem);
  font-weight: 700;
  background: linear-gradient(135deg, var(--gold2), var(--gold));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-align: center;
  padding: 10px 0;
  flex-shrink: 0;
  letter-spacing: 0.02em;
}

.choices-defs {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 0;
}

.choice-btn {
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.025), transparent 40%), var(--surface2);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  min-height: 44px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  font-size: 0.95rem;
  line-height: 1.45;
  color: var(--text);
  overflow-wrap: anywhere;
  word-break: break-word;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}
.choice-btn:hover:not(:disabled) {
  border-color: var(--gold);
  background: linear-gradient(160deg, rgba(210, 177, 90, 0.12), transparent 50%), var(--surface2);
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
}
.choice-btn:active:not(:disabled) {
  transform: translateY(0);
}
.choice-btn.correct {
  border-color: var(--green) !important;
  background: linear-gradient(160deg, rgba(76, 175, 130, 0.2), rgba(76, 175, 130, 0.08) 60%) !important;
  color: var(--green);
  box-shadow: 0 0 16px rgba(76, 175, 130, 0.1);
}
.choice-btn.wrong {
  border-color: var(--red) !important;
  background: linear-gradient(160deg, rgba(224, 92, 92, 0.2), rgba(224, 92, 92, 0.08) 60%) !important;
  color: var(--red);
  box-shadow: 0 0 16px rgba(224, 92, 92, 0.1);
}
.choice-btn:disabled {
  cursor: default;
}
.stage1-root {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.stage1-root .card {
  flex: 1;
  min-height: 0;
  cursor: pointer;
}
</style>
