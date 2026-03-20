<template>
  <div class="app-loading" v-if="loading">Loading words…</div>
  <div class="app" :class="{ 'session-active': screen === 'session' }" v-else>
    <div class="content">
      <Transition :name="transitionName" mode="out-in">
        <HomeScreen     v-if="screen === 'home'"     @start="goTo('session')" @words="goTo('words')" @settings="goTo('settings')" />
        <SessionScreen  v-else-if="screen === 'session'"  @end="goTo('home')" @goToSettings="goTo('settings')" @goToWords="goTo('words')" />
        <SettingsScreen v-else-if="screen === 'settings'" @back="goTo('home')" />
        <WordListScreen v-else-if="screen === 'words'"    @back="goTo('home')" />
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, provide } from 'vue'
import { subscribeRealtime, unsubscribeRealtime, requestQuickResync } from './store/realtime.js'
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
  if (name === 'session' && from !== 'session') {
    transitionName.value = 'to-session'
  } else if (from === 'session' && name !== 'session') {
    transitionName.value = 'from-session'
  } else if (subPages.has(name) && !subPages.has(from)) {
    transitionName.value = 'slide-right'
  } else if (!subPages.has(name) && subPages.has(from)) {
    transitionName.value = 'slide-left'
  } else {
    transitionName.value = 'fade'
  }
  screen.value = name
  if (name === 'home') {
    // Ensure Home stats reflect the latest backend state without manual refresh.
    requestQuickResync(0)
  }
}

onMounted(async () => {
  try {
    await ensureSchema()
    const user = await getCurrentUser()
    await subscribeRealtime(user?.id ?? null)
    if (user) {
      await assignDailyQuota(user.id)
      requestQuickResync(0)
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
  padding-top: env(safe-area-inset-top);
}

.app.session-active .content {
  overflow: hidden;
  flex: 1;
  min-height: 0;
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
