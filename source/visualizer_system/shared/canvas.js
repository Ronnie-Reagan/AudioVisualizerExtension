let ctx = null;

export function initCanvas(canvas, options = { willReadFrequently: true }) {
  ctx = canvas?.getContext?.("2d", options) ?? null;
  return ctx;
}

export function getCanvasContext() {
  if (!ctx) {
    throw new Error("Canvas context has not been initialised yet.");
  }
  return ctx;
}

export function tryGetCanvasContext() {
  return ctx;
}

export function clearCanvas() {
  const context = tryGetCanvasContext();
  if (!context) return;
  const canvas = context.canvas;
  context.clearRect(0, 0, canvas.width, canvas.height);
}

export function getCanvasElement() {
  return tryGetCanvasContext()?.canvas ?? null;
}
