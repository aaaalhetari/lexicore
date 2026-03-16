<template>
  <div>
    <!-- SESSION NOT STARTED -->
    <div v-if="phase === 'idle'" class="idle-msg">
      <p>Starting session...</p>
    </div>

    <!-- ALL DONE TODAY -->
    <div v-else-if="phase === 'done_today'" class="idle-msg">
      <div class="big-emoji">🌙</div>
      <h2>All done for today!</h2>
      <p>Come back tomorrow to continue with the next cycle.</p>
      <button class="btn btn-primary" style="margin-top:24px;width:100%" @click="$emit('end')">Back Home</button>
    </div>

    <!-- SESSION END -->
    <div v-else-if="phase === 'end'" class="session-end">
      <div class="big-emoji">✨</div>
      <h2>Session Complete</h2>
      <p>All words for today are done. Come back tomorrow!</p>
      <div class="end-stats">
        <div class="end-stat"><div class="num">{{ answeredCount }}</div><div class="lbl">Answers</div></div>
        <div class="end-stat"><div class="num">{{ correct }}</div><div class="lbl">Correct</div></div>
        <div class="end-stat"><div class="num">{{ masteredCount }}</div><div class="lbl">Mastered</div></div>
      </div>
      <div class="btn-row" style="justify-content:center;gap:14px">
        <button class="btn btn-primary" @click="downloadJSON">⬇ Save JSON</button>
        <button class="btn btn-secondary" @click="$emit('end')">Back Home</button>
      </div>
    </div>

    <!-- MASTERED WORD -->
    <div v-else-if="phase === 'mastered'" class="mastered-card">
      <div class="trophy">🏆</div>
      <h2>{{ masteredWord }}</h2>
      <p>Fully mastered after 3 cycles. This word is yours forever.</p>
      <p v-if="remaining > 0" class="remaining-note">{{ remaining }} word{{ remaining !== 1 ? 's' : '' }} remaining</p>
      <button class="next-btn" style="display:block;margin-top:20px" @click="next">Continue →</button>
    </div>

    <!-- ACTIVE QUESTION -->
    <div v-else-if="phase === 'question' && currentWord">
      <!-- Progress bar -->
      <div class="progress-header">
        <button class="icon-btn" @click="$emit('end')" title="End session">✕</button>
        <div class="progress-bar-wrap">
          <div class="progress-bar" :style="{ width: progressPct + '%' }"></div>
        </div>
        <div class="progress-text">{{ remaining }} left</div>
      </div>

      <!-- Badge + Counter -->
      <div class="word-badge">
        <span class="badge-cycle">Cycle {{ currentWord.cycle || 1 }}</span>
        <div class="badge-dot" :class="'s' + currentWord.stage"></div>
        <span>Stage {{ currentWord.stage }}</span>
      </div>
      <br>
      <div class="counter-pill">
        <span style="color:var(--text3)">Progress</span>
        <div class="counter-dots">
          <div v-for="i in dotsCount" :key="i" class="counter-dot" :class="{ filled: i <= currentWord.consecutive_correct }"></div>
        </div>
        {{ currentWord.consecutive_correct }}/{{ required }}
      </div>

      <!-- Stage Component -->
      <Transition name="fade" mode="out-in">
        <Stage1 v-if="currentWord?.stage === 1" :key="currentWord.id + '-s1-' + questionKey"
          :word="currentWord" :distractorPool="distractorPool" @answered="onAnswered" />
        <Stage2 v-else-if="currentWord?.stage === 2" :key="currentWord.id + '-s2-' + questionKey"
          :word="currentWord" @answered="onAnswered" />
        <Stage3 v-else-if="currentWord?.stage === 3" :key="currentWord.id + '-s3-' + questionKey"
          :word="currentWord" :useCorrect="s3UseCorrect" @answered="onAnswered" />
      </Transition>

      <!-- Feedback -->
      <div v-if="feedback" class="feedback" :class="feedback.type">
        {{ feedback.text }}
      </div>

      <!-- Continue -->
      <button v-if="feedback" class="next-btn" @click="next">Continue →</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSession } from '../composables/useSession.js'
import { getData, downloadJSON } from '../store/data.js'
import Stage1 from './stage/Stage1.vue'
import Stage2 from './stage/Stage2.vue'
import Stage3 from './stage/Stage3.vue'

defineEmits(['end'])

const {
  activeWords, distractorPool, progressPct, remaining,
  correct, answeredCount, currentWord, sessionDone,
  startSession, handleAnswer, advance, getS3Type,
} = useSession()

const phase       = ref('idle')
const feedback    = ref(null)
const masteredWord = ref('')
const questionKey  = ref(0)
const s3UseCorrect = ref(true)

const masteredCount = computed(() => getData().words.filter(w => w.status === 'mastered').length)

const required = computed(() => {
  if (!currentWord.value) return 4
  const c = currentWord.value.cycle || 1
  const s = currentWord.value.stage
  return getData().settings[`cycle_${c}`]?.[`stage_${s}_required`] || 4
})

const dotsCount = computed(() => Math.min(required.value, 8))

onMounted(async () => {
  const result = await startSession()
  if (result === 'done_today') { phase.value = 'done_today'; return }
  if (result === 'no_words') { phase.value = 'done_today'; return }
  if (currentWord.value?.stage === 3) s3UseCorrect.value = getS3Type()
  phase.value = 'question'
})

async function onAnswered(isCorrect) {
  const result = await handleAnswer(isCorrect)
  if (!result) return
  switch (result.type) {
    case 'correct':
      feedback.value = { type: 'correct', text: `✅ Correct! ${result.count}/${result.required}` }
      break
    case 'wrong':
      feedback.value = { type: 'wrong', text: '❌ Incorrect — counter reset. Keep going!' }
      break
    case 'stage_advance':
      feedback.value = { type: 'correct', text: `✅ Correct! Moving to Stage ${result.stage}` }
      break
    case 'cycle_complete':
      feedback.value = { type: 'correct', text: `🎉 Cycle ${result.cycle} complete! ${result.remaining} word${result.remaining !== 1 ? 's' : ''} remaining today.` }
      break
    case 'mastered':
      masteredWord.value = result.word
      phase.value = 'mastered'
      return
  }
}

function next() {
  feedback.value = null
  const hasMore = advance()
  if (!hasMore) { phase.value = 'end'; return }
  questionKey.value++
  if (currentWord.value?.stage === 3) s3UseCorrect.value = getS3Type()
  phase.value = 'question'
}
</script>

<style scoped>
.progress-header { display: flex; align-items: center; gap: var(--sp); margin-bottom: calc(var(--sp) * 1.6); }
.progress-bar-wrap { flex: 1; background: var(--surface2); border-radius: 100px; height: 6px; overflow: hidden; }
.progress-bar { height: 100%; background: linear-gradient(90deg, var(--gold), var(--gold2)); border-radius: 100px; transition: width 0.4s ease; }
.progress-text { font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; color: var(--text3); white-space: nowrap; }

.word-badge {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--surface2); border: 1px solid var(--border);
  border-radius: 100px; padding: calc(var(--sp) * 0.45) calc(var(--sp) * 0.9); margin-bottom: 4px;
  font-size: 0.85rem; font-family: 'JetBrains Mono', monospace; color: var(--text2);
}
.badge-cycle { color: var(--gold); }
.badge-dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--text3); }
.badge-dot.s1 { background: var(--blue); }
.badge-dot.s2 { background: var(--gold); }
.badge-dot.s3 { background: var(--green); }

.counter-pill {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--surface2); border: 1px solid var(--border);
  border-radius: 100px; padding: calc(var(--sp) * 0.35) calc(var(--sp) * 0.8); font-size: 0.85rem;
  font-family: 'JetBrains Mono', monospace; color: var(--text2); margin-bottom: 20px;
}
.counter-dots { display: flex; gap: 4px; }
.counter-dot { width: 0.65rem; height: 0.65rem; border-radius: 50%; background: var(--surface3); transition: background 0.3s; }
.counter-dot.filled { background: var(--gold); }

.feedback {
  padding: calc(var(--sp) * 0.9) calc(var(--sp) * 1.2);
  border-radius: var(--radius-sm);
  font-size: 1rem; font-weight: 500; text-align: center;
  margin-top: 16px;
}
.feedback.correct { background: var(--green-dim); color: var(--green); border: 1px solid rgba(76,175,130,0.3); }
.feedback.wrong   { background: var(--red-dim);   color: var(--red);   border: 1px solid rgba(224,92,92,0.3); }

.next-btn {
  width: 100%;
  padding: calc(var(--sp) * 1.15);
  background: var(--gold);
  color: #0e0e10; border: none; border-radius: var(--radius-sm);
  font-size: 1.05rem; font-weight: 600; cursor: pointer;
  transition: all 0.2s; margin-top: 14px;
  font-family: 'DM Sans', sans-serif;
}
.next-btn:hover { background: var(--gold2); transform: translateY(-1px); }

.mastered-card {
  background: linear-gradient(135deg, var(--gold-dim), transparent);
  border: 1px solid var(--gold); border-radius: var(--radius);
  padding: calc(var(--sp) * 2);
  text-align: center;
  margin-bottom: calc(var(--sp) * 1.2);
  animation: pulse 2s ease infinite;
}
@keyframes pulse {
  0%,100% { box-shadow: 0 0 0 0 rgba(201,168,76,0.1); }
  50%      { box-shadow: 0 0 0 12px rgba(201,168,76,0); }
}
.mastered-card .trophy { font-size: calc(var(--icon) * 2); margin-bottom: calc(var(--sp) * 0.8); }
.mastered-card h2 { font-family: 'Fraunces', serif; font-size: 1.7rem; color: var(--gold2); margin-bottom: 8px; }
.mastered-card p { color: var(--text2); font-size: 1rem; }
.remaining-note { margin-top: calc(var(--sp) * 0.5); color: var(--gold); font-size: 0.9rem; }
.big-emoji { font-size: calc(var(--icon) * 2.2); margin-bottom: calc(var(--sp) * 0.8); }

.idle-msg { text-align: center; padding: calc(var(--sp) * 3) 0; }
.idle-msg h2 { font-family: 'Fraunces', serif; font-size: 1.7rem; color: var(--gold2); margin-bottom: 12px; }
.idle-msg p { color: var(--text2); }

.session-end { text-align: center; padding: calc(var(--sp) * 2.4) 0; }
.session-end h2 { font-family: 'Fraunces', serif; font-size: 2.1rem; color: var(--gold2); margin-bottom: 12px; }
.session-end p { color: var(--text2); margin-bottom: 28px; }
.end-stats { display: grid; grid-template-columns: repeat(3,1fr); gap: var(--sp); margin-bottom: calc(var(--sp) * 2); }
.end-stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: calc(var(--sp) * 1.2) calc(var(--sp) * 0.9); }
.end-stat .num { font-family: 'JetBrains Mono', monospace; font-size: 1.9rem; color: var(--gold); }
.end-stat .lbl { font-size: 0.85rem; color: var(--text3); margin-top: 4px; }

.icon-btn {
  background: var(--surface2); border: 1px solid var(--border);
  color: var(--text2);
  width: var(--tap);
  height: var(--tap);
  border-radius: var(--radius-sm);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  font-size: var(--icon);
  transition: all 0.2s;
}
.icon-btn:hover { border-color: var(--red); color: var(--red); }
</style>
