/**
 * LexiCore v2: Audio playback (AI-only, no device/browser TTS)
 * - Single Audio element to prevent overlaps
 * - playTextAI: OpenAI TTS for definitions/sentences
 * - playWord: word pronunciation from AI-generated URL (5x auto on reveal)
 * - No Web Speech API fallback — AI TTS only
 */

import { ref } from 'vue'
import { generateTTS } from '../store/data.js'
import { hasSupabase } from '../lib/supabase.js'

const WORD_REPEAT = 5
const TEXT_REPEAT = 2
const BLANK_PAUSE_MS = 700

const isMuted = ref(false)

function stripHtml(html) {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || div.innerText || ''
}

export function useAudio() {
  const audioRef = ref(null)
  const stoppedRef = ref(false)
  let repeatCount = 0

  function playAudioUrl(url) {
    return new Promise((resolve, reject) => {
      let audio = audioRef.value
      if (!audio) {
        audio = new Audio()
        audioRef.value = audio
      }
      audio.pause()
      audio.currentTime = 0
      audio.src = url
      const done = () => {
        audio.onended = null
        audio.onpause = null
        audio.onerror = null
        resolve()
      }
      audio.onended = done
      audio.onpause = done
      audio.onerror = (e) => { audio.onpause = null; reject(e) }
      audio.play()
    })
  }

  function stopCurrentAudio() {
    stoppedRef.value = true
    if (audioRef.value) {
      audioRef.value.pause()
      audioRef.value = null
    }
  }

  async function playTextAI(text, options = {}) {
    const { times = TEXT_REPEAT, pauseAtBlank = false } = options
    if (isMuted.value) return
    const clean = stripHtml(text).trim()
    if (!clean) return
    stopCurrentAudio()
    stoppedRef.value = false

    if (!hasSupabase()) return

    try {
      if (pauseAtBlank && clean.includes('___')) {
        const parts = clean.split('___')
        for (let round = 0; round < times; round++) {
          if (isMuted.value || stoppedRef.value) return
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim()
            if (part) {
              if (stoppedRef.value) return
              const url = await generateTTS(part)
              if (url && !isMuted.value && !stoppedRef.value) {
                await playAudioUrl(url)
                if (stoppedRef.value) return
              }
            }
            if (i < parts.length - 1 && !isMuted.value) {
              await new Promise((r) => setTimeout(r, BLANK_PAUSE_MS))
              if (stoppedRef.value) return
            }
          }
        }
      } else {
        if (stoppedRef.value) return
        const url = await generateTTS(clean)
        if (url && !stoppedRef.value) {
          for (let i = 0; i < times && !isMuted.value && !stoppedRef.value; i++) {
            await playAudioUrl(url)
            if (stoppedRef.value) return
          }
        }
      }
    } catch {
      /* no fallback — AI TTS only */
    }
  }

  function playStoredAudio(url, times = TEXT_REPEAT) {
    if (isMuted.value || !url) return
    stopCurrentAudio()
    stoppedRef.value = false
    const run = async () => {
      for (let i = 0; i < times && !stoppedRef.value; i++) {
        await playAudioUrl(url)
      }
    }
    run()
  }

  function playWord(word, times = WORD_REPEAT) {
    if (isMuted.value) return
    stopCurrentAudio()
    stoppedRef.value = false
    const url = word?.audio_word
    const wordText = typeof word === 'string' ? word : (word?.word ?? '')
    if (!url) {
      if (wordText) playTextAI(wordText, { times }) /* AI TTS for word */
      return
    }

    let audio = audioRef.value
    if (!audio) {
      audio = new Audio()
      audioRef.value = audio
    }
    audio.pause()
    audio.currentTime = 0
    audio.src = url
    repeatCount = 0

    function onEnded() {
      if (repeatCount >= times || stoppedRef.value) {
        audio.removeEventListener('ended', onEnded)
        return
      }
      repeatCount++
      audio.currentTime = 0
      audio.play()
    }

    audio.addEventListener('ended', onEnded)
    audio.play()
  }

  function stopAudio() {
    stopCurrentAudio()
  }

  function toggleMute() {
    isMuted.value = !isMuted.value
    if (isMuted.value) stopAudio()
  }

  return { playWord, playTextAI, playStoredAudio, playAudioUrl, stopAudio, toggleMute, isMuted, audioRef }
}
