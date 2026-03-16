<template>
  <div>
    <!-- SESSION NOT STARTED -->
    <div v-if="phase === 'idle'" class="idle-msg">
      <p>Starting session...</p>
    </div>

    <!-- ALL DONE TODAY -->
    <div v-else-if="phase === 'done_today'" class="idle-msg">
      <div style="font-size:48px;margin-bottom:16px">🌙</div>
      <h2>All done for today!</h2>
      <p>Come back tomorrow to continue with the next cycle.</p>
      <button class="btn btn-primary" style="margin-top:24px;width:100%" @click="$emit('end')">Back Home</button>
    </div>

    <!-- SESSION END -->
    <div v-else-if="phase === 'end'" class="session-end">
      <div style="font-size:52px;margin-bottom:16px">✨</div>
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
      <p v-if="remaining > 0" style="margin-top:8px;color:var(--gold);font-size:13px">{{ remaining }} word{{ remaining !== 1 ? 's' : '' }} remaining</p>
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
        <Stage1 v-if="currentWord.stage === 1" :key="currentWord.id + '-s1-' + questionKey"
          :word="currentWord" :distractorPool="distractorPool" @answered="onAnswered" />
        <Stage2 v-else-if="currentWord.stage === 2" :key="currentWord.id + '-s2-' + questionKey"
          :word="currentWord" @answered="onAnswered" />
        <Stage3 v-else-if="currentWord.stage === 3" :key="currentWord.id + '-s3-' + questionKey"
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

onMounted(() => {
  const result = startSession()
  if (result === 'done_today') { phase.value = 'done_today'; return }
  if (result === 'no_words')   { phase.value = 'done_today'; return }
  if (currentWord.value?.stage === 3) s3UseCorrect.value = getS3Type()
  phase.value = 'question'
})

function onAnswered(isCorrect) {
  const result = handleAnswer(isCorrect)
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
.progress-header { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; }
.progress-bar-wrap { flex: 1; background: var(--surface2); border-radius: 100px; height: 6px; overflow: hidden; }
.progress-bar { height: 100%; background: linear-gradient(90deg, var(--gold), var(--gold2)); border-radius: 100px; transition: width 0.4s ease; }
.progress-text { font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; color: var(--text3); white-space: nowrap; }

.word-badge {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--surface2); border: 1px solid var(--border);
  border-radius: 100px; padding: 6px 14px; margin-bottom: 4px;
  font-size: 0.85rem; font-family: 'JetBrains Mono', monospace; color: var(--text2);
}
.badge-cycle { color: var(--gold); }
.badge-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text3); }
.badge-dot.s1 { background: var(--blue); }
.badge-dot.s2 { background: var(--gold); }
.badge-dot.s3 { background: var(--green); }

.counter-pill {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--surface2); border: 1px solid var(--border);
  border-radius: 100px; padding: 5px 12px; font-size: 0.85rem;
  font-family: 'JetBrains Mono', monospace; color: var(--text2); margin-bottom: 20px;
}
.counter-dots { display: flex; gap: 4px; }
.counter-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--surface3); transition: background 0.3s; }
.counter-dot.filled { background: var(--gold); }

.feedback {
  padding: 14px 20px; border-radius: var(--radius-sm);
  font-size: 1rem; font-weight: 500; text-align: center;
  margin-top: 16px;
}
.feedback.correct { background: var(--green-dim); color: var(--green); border: 1px solid rgba(76,175,130,0.3); }
.feedback.wrong   { background: var(--red-dim);   color: var(--red);   border: 1px solid rgba(224,92,92,0.3); }

.next-btn {
  width: 100%; padding: 16px; background: var(--gold);
  color: #0e0e10; border: none; border-radius: var(--radius-sm);
  font-size: 1.05rem; font-weight: 600; cursor: pointer;
  transition: all 0.2s; margin-top: 14px;
  font-family: 'DM Sans', sans-serif;
}
.next-btn:hover { background: var(--gold2); transform: translateY(-1px); }

.mastered-card {
  background: linear-gradient(135deg, var(--gold-dim), transparent);
  border: 1px solid var(--gold); border-radius: var(--radius);
  padding: 32px; text-align: center; margin-bottom: 20px;
  animation: pulse 2s ease infinite;
}
@keyframes pulse {
  0%,100% { box-shadow: 0 0 0 0 rgba(201,168,76,0.1); }
  50%      { box-shadow: 0 0 0 12px rgba(201,168,76,0); }
}
.mastered-card .trophy { font-size: 48px; margin-bottom: 12px; }
.mastered-card h2 { font-family: 'Fraunces', serif; font-size: 1.7rem; color: var(--gold2); margin-bottom: 8px; }
.mastered-card p { color: var(--text2); font-size: 1rem; }

.idle-msg { text-align: center; padding: 60px 0; }
.idle-msg h2 { font-family: 'Fraunces', serif; font-size: 1.7rem; color: var(--gold2); margin-bottom: 12px; }
.idle-msg p { color: var(--text2); }

.session-end { text-align: center; padding: 40px 0; }
.session-end h2 { font-family: 'Fraunces', serif; font-size: 2.1rem; color: var(--gold2); margin-bottom: 12px; }
.session-end p { color: var(--text2); margin-bottom: 28px; }
.end-stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin-bottom: 32px; }
.end-stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 20px 12px; }
.end-stat .num { font-family: 'JetBrains Mono', monospace; font-size: 1.9rem; color: var(--gold); }
.end-stat .lbl { font-size: 0.85rem; color: var(--text3); margin-top: 4px; }

.icon-btn {
  background: var(--surface2); border: 1px solid var(--border);
  color: var(--text2); width: 38px; height: 38px; border-radius: var(--radius-sm);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  font-size: 16px; transition: all 0.2s;
}
.icon-btn:hover { border-color: var(--red); color: var(--red); }
</style>
