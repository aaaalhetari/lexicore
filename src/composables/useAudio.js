/**
 * LexiCore v2: Audio playback — stored URLs only (batch-generated)
 * - playStoredAudio: play from stored URL
 * - playWord: word pronunciation from stored audio_word
 */

import { ref } from 'vue'

const WORD_REPEAT = 5
const TEXT_REPEAT = 2

const isMuted = ref(false)

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
      const cacheBuster = (u) => (u && (u.includes('?') ? `${u}&_t=` : `${u}?_t=`)) + Date.now()
      audio.src = cacheBuster(url)
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
    if (!url) return

    let audio = audioRef.value
    if (!audio) {
      audio = new Audio()
      audioRef.value = audio
    }
    audio.pause()
    audio.currentTime = 0
    const cacheBuster = (u) => (u && (u.includes('?') ? `${u}&_t=` : `${u}?_t=`)) + Date.now()
    audio.src = cacheBuster(url)
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

  return { playWord, playStoredAudio, playAudioUrl, stopAudio, toggleMute, isMuted, audioRef }
}
