export function createAnimationLoop(callback) {
  let rafId = null;

  const tick = () => {
    rafId = requestAnimationFrame(tick);
    callback();
  };

  rafId = requestAnimationFrame(tick);

  return () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}
