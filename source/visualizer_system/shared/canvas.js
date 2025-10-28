const contexts = new Map();

export function registerCanvas(paneId, canvas, options = { willReadFrequently: true }) {
  if (!paneId || !canvas) return null;
  const ctx = canvas.getContext("2d", options) ?? null;
  if (!ctx) return null;
  contexts.set(paneId, ctx);
  return ctx;
}

export function unregisterCanvas(paneId) {
  if (!paneId) return;
  contexts.delete(paneId);
}

export function getCanvasContext(paneId) {
  return contexts.get(paneId) ?? null;
}

export function clearCanvas(paneId) {
  const ctx = contexts.get(paneId);
  if (!ctx) return;
  const canvas = ctx.canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

export function clearAllCanvases() {
  for (const ctx of contexts.values()) {
    const canvas = ctx.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

export function forEachCanvas(callback) {
  for (const [paneId, ctx] of contexts.entries()) {
    callback(paneId, ctx);
  }
}
