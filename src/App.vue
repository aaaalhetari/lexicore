<template>
  <div class="app-loading" v-if="loading">Loading words…</div>
  <div class="app" v-else>
    <!-- HEADER -->
    <div class="header">
      <div class="logo">LexiCore <span>v2.0</span></div>
      <div class="header-btns" v-if="screen !== 'session'">
        <button class="icon-btn" @click="goTo('words')" title="Word List">📚</button>
        <button class="icon-btn" @click="goTo('settings')" title="Settings">⚙️</button>
      </div>
    </div>

    <!-- SCREENS -->
    <div class="content">
      <Transition name="fade" mode="out-in">
        <HomeScreen     v-if="screen === 'home'"     @start="goTo('session')" />
        <SessionScreen  v-else-if="screen === 'session'"  @end="goTo('home')" />
        <SettingsScreen v-else-if="screen === 'settings'" @back="goTo('home')" />
        <WordListScreen v-else-if="screen === 'words'"    @back="goTo('home')" />
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { subscribeRealtime, unsubscribeRealtime } from './store/realtime.js'
import { getCurrentUser } from './store/sync.js'
import { checkRefillNeeded } from './store/data.js'
import HomeScreen from './components/HomeScreen.vue'
import SessionScreen from './components/SessionScreen.vue'
import SettingsScreen from './components/SettingsScreen.vue'
import WordListScreen from './components/WordListScreen.vue'

const screen = ref('home')
const loading = ref(true)

function goTo(name) {
  screen.value = name
}

onMounted(async () => {
  const user = await getCurrentUser()
  await subscribeRealtime(user?.id ?? null)
  if (user) checkRefillNeeded()
  loading.value = false
})

onUnmounted(() => {
  unsubscribeRealtime()
})
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.header {
  display: flex; align-items: center; justify-content: space-between;
  padding: calc(var(--sp) * 1.1) 0 calc(var(--sp) * 1.6);
}
.logo {
  font-family: 'Fraunces', serif;
  font-size: clamp(1.3rem, 1.4vmin + 1rem, 2.2rem);
  color: var(--gold); letter-spacing: 0.5px;
}
.logo span {
  color: var(--text3);
  font-size: 0.85rem;
  font-family: 'JetBrains Mono', monospace;
  margin-left: calc(var(--sp) * 0.8);
}
.header-btns { display: flex; gap: calc(var(--sp) * 0.6); }
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
.icon-btn:hover { border-color: var(--gold); color: var(--gold); }

.app-loading {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text2);
  font-size: 1.1rem;
}
</style>
