<template>
  <div>
    <!-- Tabs -->
    <div class="nav-tabs">
      <button class="nav-tab" :class="{ active: tab === 'general' }" @click="tab = 'general'">General</button>
      <button class="nav-tab" :class="{ active: tab === 'cycles'  }" @click="tab = 'cycles'">Cycles</button>
      <button class="nav-tab" :class="{ active: tab === 'account' }" @click="tab = 'account'">Account</button>
    </div>

    <!-- General -->
    <div v-if="tab === 'general'">
      <div class="settings-section">
        <h3>Session</h3>
        <div class="setting-row">
          <div><div class="setting-label">Words per session</div><div class="setting-desc">Total words per session (learning + new)</div></div>
          <input class="setting-input" type="number" min="1" max="50" v-model.number="local.new_words_per_session">
        </div>
        <div class="setting-row">
          <div><div class="setting-label">Pool size</div><div class="setting-desc">Words used for Stage 1 distractors</div></div>
          <input class="setting-input" type="number" min="4" max="50" v-model.number="local.pool_size">
        </div>
      </div>
      <div class="settings-section">
        <h3>Progress File</h3>
        <div class="setting-row">
          <div><div class="setting-label">Upload JSON</div><div class="setting-desc">Restore progress from another device</div></div>
          <label class="btn btn-secondary small-btn" style="cursor:pointer">
            ⬆ Upload
            <input type="file" accept=".json" @change="onUpload" style="display:none">
          </label>
        </div>
        <div class="setting-row">
          <div><div class="setting-label">Download JSON</div><div class="setting-desc">Save your current progress</div></div>
          <button class="btn btn-secondary small-btn" @click="downloadJSON()">⬇ Download</button>
        </div>
      </div>
    </div>

    <!-- Cycles -->
    <div v-if="tab === 'cycles'">
      <div v-for="c in [1,2,3]" :key="c" class="settings-section">
        <h3>Cycle {{ c }} — Day {{ c }}</h3>
        <div v-for="s in [1,2,3]" :key="s" class="setting-row">
          <div><div class="setting-label">Stage {{ s }} required</div></div>
          <input class="setting-input" type="number" min="1" v-model.number="local[`cycle_${c}`][`stage_${s}_required`]">
        </div>
      </div>
    </div>

    <!-- Account / Sync -->
    <div v-if="tab === 'account'" class="settings-section">
      <h3>Sync across devices</h3>
      <p class="sync-desc">Sign in to sync progress and settings across computer, phone, and tablet.</p>
      <template v-if="!hasSync">
        <p class="sync-hint">Sync requires Supabase. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable.</p>
      </template>
      <template v-else-if="user">
        <p class="sync-status">Signed in as <strong>{{ user.user_metadata?.user_name || user.email || 'GitHub user' }}</strong></p>
        <button class="btn btn-secondary" @click="handleSignOut">Sign out</button>
      </template>
      <template v-else>
        <div class="auth-form">
          <button class="btn btn-primary github-btn" @click="handleSignInWithGitHub">
            Sign in with GitHub
          </button>
          <p v-if="authError" class="auth-error">{{ authError }}</p>
        </div>
      </template>
      <div v-if="user" class="audio-gen-section">
        <h3>Audio storage</h3>
        <button
          class="btn btn-secondary migrate-btn"
          :disabled="migratingAudio"
          @click="runAudioMigration"
          title="Move old audio to all-lexicore-audio folder and delete old files"
        >
          {{ migratingAudio ? 'Migrating…' : '📁 Migrate audio to new structure' }}
        </button>
        <button
          class="btn btn-secondary cleanup-btn"
          :disabled="cleaningAudio"
          @click="runAudioCleanup"
          title="Delete old folders (userId, tts), keep only all-lexicore-audio"
        >
          {{ cleaningAudio ? 'Cleaning…' : '🗑️ Delete old audio folders' }}
        </button>
      </div>
    </div>

    <!-- Sticky Buttons -->
    <div class="sticky-bottom">
      <button class="btn btn-primary" @click="save">Save & Back</button>
      <button class="btn btn-secondary" @click="cancel">Back without Saving</button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getSettings, updateSettings, snapshotSettings, restoreSettings, importJSON, downloadJSON, migrateAudioStructure, cleanupOldAudio } from '../store/data.js'
import { hasSupabase } from '../lib/supabase.js'
import { getCurrentUser, signInWithGitHub, signOut } from '../store/sync.js'

const emit = defineEmits(['back'])
const tab = ref('general')
const snapshot = ref(null)
const hasSync = hasSupabase()
const user = ref(null)
const authError = ref('')
const migratingAudio = ref(false)
const cleaningAudio = ref(false)

onMounted(async () => {
  if (hasSync) user.value = await getCurrentUser()
})

// Local copy of settings for editing
const local = reactive({
  new_words_per_session: 20,
  pool_size: 20,
  cycle_1: { stage_1_required: 4, stage_2_required: 4, stage_3_required: 4 },
  cycle_2: { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
  cycle_3: { stage_1_required: 2, stage_2_required: 2, stage_3_required: 2 },
})

onMounted(() => {
  snapshot.value = snapshotSettings()
  const s = getSettings()
  local.new_words_per_session = s.new_words_per_session
  local.pool_size = s.pool_size
  for (let c = 1; c <= 3; c++) {
    for (let st = 1; st <= 3; st++) {
      local[`cycle_${c}`][`stage_${st}_required`] = s[`cycle_${c}`][`stage_${st}_required`]
    }
  }
})

async function save() {
  await updateSettings(local)
  emit('back')
}

function cancel() {
  const restored = restoreSettings(snapshot.value)
  if (restored) {
    local.new_words_per_session = restored.new_words_per_session
    local.pool_size = restored.pool_size
    for (let c = 1; c <= 3; c++) {
      for (let st = 1; st <= 3; st++) {
        local[`cycle_${c}`][`stage_${st}_required`] = restored[`cycle_${c}`]?.[`stage_${st}_required`]
      }
    }
  }
  emit('back')
}

async function onUpload(e) {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async (ev) => {
    try {
      const added = await importJSON(ev.target.result)
      alert(`Imported ${added} word(s). Reload to see updates.`)
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }
  reader.readAsText(file)
}

async function handleSignInWithGitHub() {
  authError.value = ''
  try {
    await signInWithGitHub()
  } catch (e) {
    authError.value = e.message || 'Sign in failed'
  }
}

async function handleSignOut() {
  await signOut()
  window.location.reload()
}

async function runAudioMigration() {
  if (!hasSync || !user.value) return
  if (!confirm('Migrate old audio files to all-lexicore-audio folder? Old files will be deleted.')) return
  migratingAudio.value = true
  try {
    const result = await migrateAudioStructure()
    alert(`Migration complete: ${result?.migrated ?? 0} migrated, ${result?.failed ?? 0} failed.`)
  } catch (e) {
    alert('Migration failed: ' + (e?.message || e))
  } finally {
    migratingAudio.value = false
  }
}

async function runAudioCleanup() {
  if (!hasSync || !user.value) return
  if (!confirm('Delete all folders except all-lexicore-audio? This removes userId/ and tts/ folders permanently.')) return
  cleaningAudio.value = true
  try {
    const result = await cleanupOldAudio()
    alert(`Cleanup complete: ${result?.deleted ?? 0} files deleted.`)
  } catch (e) {
    alert('Cleanup failed: ' + (e?.message || e))
  } finally {
    cleaningAudio.value = false
  }
}
</script>

<style scoped>
.nav-tabs {
  display: flex; background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 4px; gap: 4px; margin-bottom: 24px;
}
.nav-tab {
  flex: 1; padding: 9px; border-radius: var(--radius-sm);
  text-align: center; font-size: 0.95rem; cursor: pointer;
  transition: all 0.2s; color: var(--text2); border: none; background: none;
  font-family: 'DM Sans', sans-serif;
}
.nav-tab.active { background: var(--surface3); color: var(--text); }

.settings-section { margin-bottom: 28px; }
.settings-section h3 {
  font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px;
  color: var(--text3); font-family: 'JetBrains Mono', monospace;
  margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid var(--border);
}
.setting-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 0; border-bottom: 1px solid var(--border);
}
.setting-row:last-child { border-bottom: none; }
.setting-label { font-size: 1rem; }
.setting-desc { font-size: 0.9rem; color: var(--text3); margin-top: 2px; }
.setting-input {
  background: var(--surface2); border: 1px solid var(--border);
  color: var(--text); border-radius: var(--radius-sm); padding: 8px 12px;
  font-family: 'JetBrains Mono', monospace; font-size: 1rem; width: 5.5rem;
  text-align: center; outline: none;
}
.setting-input:focus { border-color: var(--gold); }

.small-btn {
  font-size: 0.95rem;
  padding: calc(var(--sp) * 0.6) calc(var(--sp) * 1.1);
}

.sync-desc { font-size: 0.95rem; color: var(--text2); margin-bottom: 14px; }
.sync-hint { font-size: 0.85rem; color: var(--text3); }
.sync-status { margin-bottom: 12px; }
.auth-form { display: flex; flex-direction: column; gap: 10px; max-width: 280px; }
.github-btn { width: 100%; }
.auth-form .form-input {
  background: var(--surface2); border: 1px solid var(--border);
  color: var(--text); border-radius: var(--radius-sm); padding: 10px 14px;
  font-size: 1rem; outline: none; font-family: 'DM Sans', sans-serif;
}
.auth-form .form-input:focus { border-color: var(--gold); }
.auth-actions { display: flex; gap: 10px; }
.auth-error { font-size: 0.9rem; color: var(--red); margin-top: 4px; }

.content-gen-section,
.audio-gen-section { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border); }
.content-gen-section .btn,
.audio-gen-section .btn { margin-top: 8px; }
.audio-gen-section .migrate-btn,
.audio-gen-section .cleanup-btn { margin-left: 8px; }
</style>
