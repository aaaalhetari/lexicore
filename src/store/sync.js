import { supabase, hasSupabase } from '../lib/supabase.js'

/** Get current user */
export async function getCurrentUser() {
  if (!hasSupabase()) return null
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/** Sign in with GitHub OAuth */
export async function signInWithGitHub() {
  if (!hasSupabase()) throw new Error('Supabase not configured')
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo },
  })
  if (error) throw error
  if (data?.url) window.location.href = data.url
}

/** Sign out */
export async function signOut() {
  if (!hasSupabase()) return
  await supabase.auth.signOut()
}

/** Subscribe to auth changes */
export function onAuthChange(callback) {
  if (!hasSupabase()) return () => {}
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback)
  return () => subscription.unsubscribe()
}
