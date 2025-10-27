let rafId = null;

export function scheduleNextFrame(callback) {
  rafId = requestAnimationFrame(callback);
  return rafId;
}

export function cancelScheduledFrame() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

export function getCurrentFrameId() {
  return rafId;
}
