/**
 * Swipe composable for card-based answer gestures.
 * Minimal movement (50px) for small hands + large phones.
 * Swipe right = correct (✓), Swipe left = wrong (✗)
 */
export function useSwipe({ onSwipeLeft, onSwipeRight, threshold = 50, enabled = () => true } = {}) {
  let startX = 0
  let startY = 0

  function getClientX(e) {
    return e.touches?.[0]?.clientX ?? e.clientX
  }
  function getClientY(e) {
    return e.touches?.[0]?.clientY ?? e.clientY
  }

  function handleEnd(clientX, clientY) {
    if (!enabled()) return
    const dx = clientX - startX
    const dy = clientY - startY

    if (Math.abs(dx) < threshold) return
    if (Math.abs(dy) > Math.abs(dx) * 1.5) return // vertical scroll, ignore

    if (dx > 0) {
      onSwipeRight?.()
    } else {
      onSwipeLeft?.()
    }
  }

  function onTouchEnd(e) {
    const t = e.changedTouches?.[0]
    if (t) handleEnd(t.clientX, t.clientY)
  }

  function onMouseUp(e) {
    handleEnd(e.clientX, e.clientY)
    document.removeEventListener('mouseup', onMouseUp)
  }

  function onStart(e) {
    if (!enabled()) return
    startX = getClientX(e)
    startY = getClientY(e)
    if (e.type === 'mousedown') {
      document.addEventListener('mouseup', onMouseUp, { once: true })
    }
  }

  function bind(el) {
    if (!el) return
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('mousedown', onStart)
  }

  function unbind(el) {
    if (!el) return
    el.removeEventListener('touchstart', onStart)
    el.removeEventListener('touchend', onTouchEnd)
    el.removeEventListener('mousedown', onStart)
    document.removeEventListener('mouseup', onMouseUp)
  }

  return { bind, unbind }
}
