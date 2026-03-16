/**
 * LexiCore v2: Audio playback - manual + auto 5x on reveal
 */

import { ref } from 'vue'

const REPEAT_COUNT = 5

export function useAudio() {
  const audioRef = ref(null)
  let repeatCount = 0

  function playWord(word) {
    const url = word?.audio_url
    if (!url) return

    const audio = new Audio(url)
    audioRef.value = audio
    repeatCount = 0

    function onEnded() {
      if (repeatCount >= REPEAT_COUNT) {
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
    if (audioRef.value) {
      audioRef.value.pause()
      audioRef.value = null
    }
  }

  return { playWord, stopAudio, audioRef }
}
