import { supabase, hasSupabase } from '../lib/supabase.js'

const STORAGE_KEY = 'lexicore_data'
const SYNC_DEBOUNCE_MS = 1500
let syncTimeout = null

/** Get current user */
export async function getCurrentUser() {
  if (!hasSupabase()) return null
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/** Sign in with email + password */
export async function signIn(email, password) {
  if (!hasSupabase()) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.user
}

/** Sign up with email + password */
export async function signUp(email, password) {
  if (!hasSupabase()) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  return data.user
}

/** Sign out */
export async function signOut() {
  if (!hasSupabase()) return
  await supabase.auth.signOut()
}

/** Load user data from Supabase */
export async function loadFromCloud() {
  if (!hasSupabase()) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('user_data')
    .select('data')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw error
  return data?.data ?? null
}

/** Save user data to Supabase */
export async function saveToCloud(payload) {
  if (!hasSupabase()) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return // not signed in, skip sync
  const { error } = await supabase
    .from('user_data')
    .upsert(
      { user_id: user.id, data: payload, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  if (error) throw error
}

/** Queue a sync (debounced) */
export function queueSync(payload) {
  if (!hasSupabase()) return
  if (syncTimeout) clearTimeout(syncTimeout)
  syncTimeout = setTimeout(async () => {
    syncTimeout = null
    try {
      await saveToCloud(payload)
    } catch (e) {
      console.warn('Sync failed:', e)
    }
  }, SYNC_DEBOUNCE_MS)
}

/** Subscribe to auth changes */
export function onAuthChange(callback) {
  if (!hasSupabase()) return () => {}
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback)
  return () => subscription.unsubscribe()
}
