/**
 * Swipe-drag composable: card follows finger during drag, then snaps or completes.
 * Feels like the card is physically being pulled.
 */
import { ref } from 'vue'

const RESISTANCE = 0.85
const THRESHOLD = 70
const MAX_DRAG = 280

export function useSwipeDrag({ onSwipeLeft, onSwipeRight, threshold = THRESHOLD, enabled = () => true } = {}) {
  const dragX = ref(0)
  const isDragging = ref(false)
  const isAnimating = ref(false)

  let startX = 0
  let startY = 0

  function getClientX(e) {
    return e.touches?.[0]?.clientX ?? e.clientX
  }
  function getClientY(e) {
    return e.touches?.[0]?.clientY ?? e.clientY
  }

  function handleMove(clientX, clientY) {
    if (!enabled() || !isDragging.value || isAnimating.value) return
    const dx = clientX - startX
    const dy = clientY - startY

    if (Math.abs(dy) > Math.abs(dx) * 1.5) return

    let val = dx * RESISTANCE
    if (val > MAX_DRAG) val = MAX_DRAG
    if (val < -MAX_DRAG) val = -MAX_DRAG
    dragX.value = val
  }

  function handleEnd(clientX, clientY) {
    if (!enabled() || !isDragging.value) return
    isDragging.value = false

    const dx = clientX - startX
    const dy = clientY - startY

    if (Math.abs(dy) > Math.abs(dx) * 1.5) {
      dragX.value = 0
      return
    }

    if (Math.abs(dragX.value) >= threshold) {
      isAnimating.value = true
      const sign = dragX.value > 0 ? 1 : -1
      const target = sign * 350
      dragX.value = target

      requestAnimationFrame(() => {
        setTimeout(() => {
          if (sign > 0) onSwipeRight?.()
          else onSwipeLeft?.()
          requestAnimationFrame(() => {
            dragX.value = 0
            isAnimating.value = false
          })
        }, 260)
      })
    } else {
      dragX.value = 0
    }
  }

  function onTouchMove(e) {
    e.preventDefault()
    handleMove(getClientX(e), getClientY(e))
  }

  function onTouchEnd(e) {
    const t = e.changedTouches?.[0]
    if (t) handleEnd(t.clientX, t.clientY)
  }

  function onMouseMove(e) {
    handleMove(e.clientX, e.clientY)
  }

  function onMouseUp(e) {
    handleEnd(e.clientX, e.clientY)
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  function onStart(e) {
    if (!enabled() || isAnimating.value) return
    startX = getClientX(e)
    startY = getClientY(e)
    isDragging.value = true
    dragX.value = 0

    if (e.type === 'mousedown') {
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp, { once: true })
    }
  }

  function bind(el) {
    if (!el) return
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('mousedown', onStart)
  }

  function unbind(el) {
    if (!el) return
    el.removeEventListener('touchstart', onStart)
    el.removeEventListener('touchmove', onTouchMove)
    el.removeEventListener('touchend', onTouchEnd)
    el.removeEventListener('mousedown', onStart)
    document.removeEventListener('mousemove', onTouchMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  return { dragX, isDragging, isAnimating, bind, unbind }
}
