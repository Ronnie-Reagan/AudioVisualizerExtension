import { clamp, lerp } from "./math.js";

export function ensureFrequencyBuffers(analyser, freqData, normData, fallbackSize = 2048) {
  const targetLength = analyser?.frequencyBinCount ?? fallbackSize;
  let changed = false;
  if (!freqData || freqData.length !== targetLength) {
    freqData = new Uint8Array(Math.max(1, targetLength));
    changed = true;
  }
  if (!normData || normData.length !== freqData.length) {
    normData = new Float32Array(freqData.length);
    changed = true;
  }
  return { freqData, normData, changed };
}

export function resampleLinear(input, output) {
  const inputLength = input?.length ?? 0;
  const outputLength = output?.length ?? 0;
  if (!output || outputLength === 0) return;
  if (!input || inputLength === 0) {
    output.fill(0);
    return;
  }
  if (outputLength === 1) {
    output[0] = input[0];
    return;
  }
  const step = (inputLength - 1) / (outputLength - 1);
  for (let i = 0; i < outputLength; i++) {
    const position = i * step;
    const index = Math.floor(position);
    const frac = position - index;
    const nextIndex = Math.min(index + 1, inputLength - 1);
    output[i] = lerp(input[index], input[nextIndex], frac);
  }
}

export function resampleLogarithmic(input, output, curvature = 3) {
  const inputLength = input?.length ?? 0;
  const outputLength = output?.length ?? 0;
  if (!output || outputLength === 0) return;
  if (!input || inputLength === 0) {
    output.fill(0);
    return;
  }
  const curve = clamp(curvature, 0.25, 6);
  for (let i = 0; i < outputLength; i++) {
    const norm = outputLength === 1 ? 0 : i / (outputLength - 1);
    const position = Math.pow(norm, curve) * (inputLength - 1);
    const base = Math.floor(position);
    const frac = position - base;
    const next = Math.min(base + 1, inputLength - 1);
    output[i] = lerp(input[base], input[next], frac);
  }
}
