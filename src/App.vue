<template>
  <div class="app-loading" v-if="loading">Loading words…</div>
  <div class="app" :class="{ 'session-active': screen === 'session' }" v-else>
    <!-- HEADER: hide nav on session (stats in card) -->
    <div v-if="screen !== 'session'" class="header">
      <div class="logo-wrap">
        <div class="logo">LexiCore <span>v2.0</span></div>
        <div class="logo-sub">Focused vocabulary training</div>
      </div>
    </div>

    <!-- SCREENS -->
    <div class="content">
      <Transition :name="transitionName" mode="out-in">
        <HomeScreen     v-if="screen === 'home'"     @start="goTo('session')" @words="goTo('words')" @settings="goTo('settings')" />
        <SessionScreen  v-else-if="screen === 'session'"  @end="goTo('home')" @goToSettings="goTo('settings')" />
        <SettingsScreen v-else-if="screen === 'settings'" @back="goTo('home')" />
        <WordListScreen v-else-if="screen === 'words'"    @back="goTo('home')" />
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, provide } from 'vue'
import { subscribeRealtime, unsubscribeRealtime } from './store/realtime.js'
import { getCurrentUser } from './store/sync.js'
import { ensureSchema, assignDailyQuota } from './store/data.js'
import HomeScreen from './components/HomeScreen.vue'
import SessionScreen from './components/SessionScreen.vue'
import SettingsScreen from './components/SettingsScreen.vue'
import WordListScreen from './components/WordListScreen.vue'

const screen = ref('home')
const loading = ref(true)
const transitionName = ref('fade')
provide('locale', typeof document !== 'undefined' ? document.documentElement.lang || 'en' : 'en')

// Sub-pages slide in from right; going back slides out to right
const subPages = new Set(['settings', 'words'])

function goTo(name) {
  const from = screen.value
  if (subPages.has(name) && !subPages.has(from)) {
    transitionName.value = 'slide-right'
  } else if (!subPages.has(name) && subPages.has(from)) {
    transitionName.value = 'slide-left'
  } else {
    transitionName.value = 'fade'
  }
  screen.value = name
}

onMounted(async () => {
  try {
    await ensureSchema()
    const user = await getCurrentUser()
    await subscribeRealtime(user?.id ?? null)
    if (user) {
      await assignDailyQuota(user.id)
    }
  } catch (err) {
    console.error('Init failed:', err)
  } finally {
    loading.value = false
  }
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
  height: 100vh;
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  min-height: 0;
}

.app.session-active .content {
  overflow: hidden;
  flex: 1;
  min-height: 0;
}

.header {
  display: flex; align-items: center; justify-content: space-between;
  padding: calc(env(safe-area-inset-top) + var(--sp) * 0.9) calc(var(--sp) * 0.9) calc(var(--sp) * 1.1);
  flex-shrink: 0;
  position: relative;
  z-index: 10;
  background: linear-gradient(180deg, rgba(12, 13, 16, 0.95), rgba(12, 13, 16, 0.65) 65%, transparent);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.logo-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.logo {
  font-family: 'Fraunces', serif;
  font-size: clamp(1.2rem, 1.2vmin + 1rem, 1.9rem);
  color: var(--gold); letter-spacing: 0.5px;
  line-height: 1;
}
.logo span {
  color: var(--text3);
  font-size: 0.72rem;
  font-family: 'JetBrains Mono', monospace;
  margin-left: calc(var(--sp) * 0.55);
}
.logo-sub {
  color: var(--text3);
  font-size: 0.72rem;
  letter-spacing: 0.02em;
}
.app-loading {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text2);
  font-size: 1.1rem;
}
</style>
