const clampValue = (value, min, max) => {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  const numeric = Number.isFinite(value) ? value : lower;
  if (numeric <= lower) return lower;
  if (numeric >= upper) return upper;
  return numeric;
};

export function clamp(value, min, max) {
  return clampValue(value, min, max);
}

export function lerp(a, b, t) {
  if (!Number.isFinite(t)) return a;
  return a + (b - a) * t;
}

export function invLerp(a, b, value) {
  if (a === b) return 0;
  return clampValue((value - a) / (b - a), 0, 1);
}

export function smoothstep(edge0, edge1, x) {
  const t = clampValue((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function damp(current, target, smoothing, delta) {
  if (!Number.isFinite(delta) || delta <= 0) {
    return target;
  }
  const lambda = clampValue(smoothing, 0, 1);
  const factor = 1 - Math.exp(-lambda * delta * 60);
  return current + (target - current) * clampValue(factor, 0, 1);
}

export function mixAngles(a, b, t) {
  const shortest = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
  return a + shortest * clampValue(t, 0, 1);
}
