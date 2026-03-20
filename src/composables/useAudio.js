/**
 * LexiCore — audio from stored URLs (Supabase Storage)
 * - No cache-busting query params (allows HTTP cache for fast repeats / card flips)
 * - playGeneration invalidates in-flight playback when stopping (rapid swiper)
 * - prefetchAudioUrls: warm cache for adjacent cards
 */

import { ref } from 'vue'

const WORD_REPEAT = 5
const TEXT_REPEAT = 2

const isMuted = ref(false)

/** URLs needed for typical autoplay on a word (by stage). */
export function collectSessionAudioUrls(word) {
  if (!word) return []
  const out = []
  const push = (u) => {
    if (typeof u === 'string') {
      const s = u.trim()
      if (s.length > 8 && /^https?:\/\//i.test(s)) out.push(s)
    }
  }
  push(word.audio_word)
  const stage = word.stage ?? 1
  if (stage === 1) {
    const defs = word.stage1_definitions ?? []
    const idx = defs.findIndex((d) => d?.is_correct)
    const arr = word.audio_stage1_definitions ?? []
    if (idx >= 0 && arr[idx]) push(arr[idx])
  } else if (stage === 2) {
    const arr = word.audio_stage2_sentences ?? []
    push(Array.isArray(arr) ? arr[0] : null)
  } else if (stage === 3) {
    const c = word.audio_stage3_correct ?? []
    const inc = word.audio_stage3_incorrect ?? []
    push(Array.isArray(c) ? c[0] : null)
    push(Array.isArray(inc) ? inc[0] : null)
  }
  return [...new Set(out)]
}

const prefetched = new Set()

export function prefetchAudioUrls(urls) {
  if (!urls?.length) return
  for (const raw of urls) {
    if (typeof raw !== 'string') continue
    const u = raw.trim()
    if (!u || prefetched.has(u)) continue
    prefetched.add(u)
    fetch(u, { mode: 'cors', credentials: 'omit', cache: 'force-cache' }).catch(() => {
      prefetched.delete(u)
    })
  }
}

export function useAudio() {
  const audioRef = ref(null)
  const stoppedRef = ref(false)
  let playGeneration = 0

  function bumpPlayGeneration() {
    playGeneration++
  }

  function stopCurrentAudio() {
    stoppedRef.value = true
    bumpPlayGeneration()
    const audio = audioRef.value
    if (audio) {
      audio.onended = null
      audio.onpause = null
      audio.onerror = null
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    audioRef.value = null
  }

  function playAudioUrl(url) {
    const gen = playGeneration
    return new Promise((resolve, reject) => {
      if (!url || isMuted.value) {
        resolve()
        return
      }
      let audio = audioRef.value
      if (!audio) {
        audio = new Audio()
        audio.preload = 'auto'
        try {
          audio.playsInline = true
        } catch {
          /* ignore */
        }
        audioRef.value = audio
      }
      audio.pause()
      audio.currentTime = 0
      audio.src = url

      const finish = () => {
        audio.onended = null
        audio.onpause = null
        audio.onerror = null
        resolve()
      }
      const done = () => {
        if (gen !== playGeneration) {
          finish()
          return
        }
        finish()
      }
      const fail = (e) => {
        audio.onpause = null
        audio.onerror = null
        if (gen !== playGeneration) {
          resolve()
          return
        }
        reject(e)
      }
      audio.onended = done
      audio.onpause = done
      audio.onerror = fail
      audio.play().catch(fail)
    })
  }

  function playStoredAudio(url, times = TEXT_REPEAT) {
    if (isMuted.value || !url) return
    stopCurrentAudio()
    stoppedRef.value = false
    const gen = playGeneration
    const run = async () => {
      for (let i = 0; i < times; i++) {
        if (stoppedRef.value || gen !== playGeneration) return
        try {
          await playAudioUrl(url)
        } catch {
          return
        }
      }
    }
    run()
  }

  /** Same loop as playStoredAudio — avoids relying on chained `ended` + play() (often blocked after 1× on mobile). */
  function playWord(word, times = WORD_REPEAT) {
    if (isMuted.value) return
    const url = word?.audio_word
    if (!url) return
    playStoredAudio(url, times)
  }

  function stopAudio() {
    stopCurrentAudio()
  }

  function toggleMute() {
    isMuted.value = !isMuted.value
    if (isMuted.value) stopAudio()
  }

  return {
    playWord,
    playStoredAudio,
    stopAudio,
    toggleMute,
    isMuted,
    audioRef,
    prefetchAudioUrls,
  }
}
