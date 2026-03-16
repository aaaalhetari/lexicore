<template>
  <div class="app">
    <!-- HEADER -->
    <div class="header">
      <div class="logo">LexiCore <span>v1.0</span></div>
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
import { ref, onMounted } from 'vue'
import { loadFromStorage } from './store/data.js'
import HomeScreen    from './components/HomeScreen.vue'
import SessionScreen from './components/SessionScreen.vue'
import SettingsScreen from './components/SettingsScreen.vue'
import WordListScreen from './components/WordListScreen.vue'

const screen = ref('home')

function goTo(name) { screen.value = name }

onMounted(() => { loadFromStorage() })
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
  padding: 20px 0 32px;
}
.logo {
  font-family: 'Fraunces', serif;
  font-size: 22px; color: var(--gold); letter-spacing: 0.5px;
}
.logo span { color: var(--text3); font-size: 13px; font-family: 'JetBrains Mono', monospace; margin-left: 10px; }
.header-btns { display: flex; gap: 10px; }
.icon-btn {
  background: var(--surface2); border: 1px solid var(--border);
  color: var(--text2); width: 38px; height: 38px; border-radius: var(--radius-sm);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  font-size: 16px; transition: all 0.2s;
}
.icon-btn:hover { border-color: var(--gold); color: var(--gold); }
</style>
