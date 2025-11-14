const panes = new Map();

export function registerCanvas(paneId, canvas2d, glCanvas = null, options = { willReadFrequently: true }) {
  if (!paneId || !canvas2d) return null;
  const ctx = canvas2d.getContext("2d", options) ?? null;
  panes.set(paneId, {
    ctx,
    canvas2d,
    canvasGl: glCanvas,
    surface: "2d",
  });
  updateSurfaceVisibility(panes.get(paneId));
  return ctx;
}

export function unregisterCanvas(paneId) {
  if (!paneId) return;
  const entry = panes.get(paneId);
  if (entry) {
    entry.canvas2d.hidden = false;
    if (entry.canvasGl) {
      entry.canvasGl.hidden = true;
    }
  }
  panes.delete(paneId);
}

export function getCanvasContext(paneId) {
  return panes.get(paneId)?.ctx ?? null;
}

export function getGlCanvas(paneId) {
  return panes.get(paneId)?.canvasGl ?? null;
}

export function setCanvasSurface(paneId, surface = "2d") {
  const entry = panes.get(paneId);
  if (!entry) return;
  entry.surface = surface;
  updateSurfaceVisibility(entry);
}

function updateSurfaceVisibility(entry) {
  if (!entry) return;
  const useGl = entry.surface === "gl" && entry.canvasGl;
  entry.canvas2d.hidden = !!useGl;
  if (entry.canvasGl) {
    entry.canvasGl.hidden = !useGl;
  }
}

export function clearCanvas(paneId) {
  const ctx = panes.get(paneId)?.ctx;
  if (!ctx) return;
  const canvas = ctx.canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

export function clearAllCanvases() {
  for (const entry of panes.values()) {
    const ctx = entry.ctx;
    if (!ctx) continue;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
}

export function forEachCanvas(callback) {
  for (const [paneId, entry] of panes.entries()) {
    if (!entry?.ctx) continue;
    callback(paneId, entry.ctx);
  }
}
