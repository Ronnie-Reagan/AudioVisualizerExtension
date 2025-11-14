import { clamp } from "./math.js";

export function computeVisibleSpan(total, zoom, offset, minSpan = 1) {
  const safeTotal = Math.max(1, Math.floor(total ?? 1));
  const safeZoom = clamp(zoom ?? 1, 0.25, safeTotal);
  const span = clamp(Math.floor(safeTotal / safeZoom), minSpan, safeTotal);
  const maxStart = Math.max(0, safeTotal - span);
  const safeOffset = clamp(offset ?? 0, 0, 1);
  const start = Math.round(safeOffset * maxStart);
  return {
    start,
    span,
    end: start + span,
    maxStart,
  };
}

export function computeBaseline(height, offsetY) {
  const h = Math.max(1, height);
  return clamp(h - clamp(offsetY ?? 0, -1, 1) * h * 0.45, -h, h * 2);
}
