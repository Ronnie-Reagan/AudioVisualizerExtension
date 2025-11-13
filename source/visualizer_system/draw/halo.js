import { createAnimationLoop } from "../shared/animationLoop.js";

const TAU = Math.PI * 2;
const LOG_MAX = Math.log1p(255);
const BINS_OUT = 96;
const THRESH = 0.55;
const COOLDOWN = 0.18;
const LIFETIME = 1.8;
const W0 = 0.045;
const WT = 0.38;
const T0 = 6;
const TT = 28;
const BASE_R = 0.28;

// Earth texture loading (resolve relative to the module or via runtime URL)
const EARTH_ASSET_PATH = "visualizer_system/draw/visualizer-assets/halo/earth.png";
const fallbackEarthUrl = new URL("./visualizer-assets/halo/earth.png", import.meta.url).href;
const hasChromeRuntimeUrl =
  typeof chrome !== "undefined" &&
  chrome &&
  chrome.runtime &&
  typeof chrome.runtime.getURL === "function";
const earthImgSrc = hasChromeRuntimeUrl ? chrome.runtime.getURL(EARTH_ASSET_PATH) : fallbackEarthUrl;

const earthImg = new Image();
let earthReady = false;
earthImg.onload = () => { earthReady = true; };
earthImg.onerror = (err) => console.warn("Failed to load halo earth texture:", err);
earthImg.src = earthImgSrc;

const clamp = (value, min, max) => {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  const numeric = Number.isFinite(value) ? value : lower;
  return Math.min(Math.max(numeric, lower), upper);
};

const lerp = (a, b, t) => a + (b - a) * t;

function ensureFrequencyBuffers(analyser, freqData, normData) {
  const targetLength = analyser.frequencyBinCount || 0;
  if (targetLength === freqData.length) {
    return { freqData, normData, changed: false };
  }
  const nextFreq = new Uint8Array(targetLength || 2048);
  const nextNorm = new Float32Array(nextFreq.length);
  return { freqData: nextFreq, normData: nextNorm, changed: true };
}

function resampleLinear(input, output) {
  const inputLength = input.length;
  const outputLength = output.length;
  if (inputLength === 0 || outputLength === 0) {
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

function drawBase(ctx, cx, cy, radius, maxRadius, energy = 0) {
  const glowRadius = Math.max(radius * 1.6, maxRadius);
  const energyFactor = clamp(energy, 0, 1);
  const innerAlpha = 0.22 + energyFactor * 0.35;
  const midAlpha = 0.08 + energyFactor * 0.22;
  const ringAlpha = 0.18 + energyFactor * 0.4;
  const glow = ctx.createRadialGradient(cx, cy, Math.max(1, radius * 0.2), cx, cy, glowRadius);
  glow.addColorStop(0, `rgba(0, 180, 255, ${innerAlpha})`);
  glow.addColorStop(0.55, `rgba(0, 110, 220, ${midAlpha})`);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, glowRadius, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.97, 0, TAU);
  ctx.fillStyle = `rgba(2, 6, 12, ${0.62 + energyFactor * 0.24})`;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `rgba(200, 225, 255, ${ringAlpha})`;
  ctx.lineWidth = 1.5 + energyFactor * 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

export function drawHalo(analyser, ctx, view = {}) {
  if (!analyser || !ctx) return () => { };

  if (typeof analyser.smoothingTimeConstant === "number") {
    analyser.smoothingTimeConstant = 0;
  }

  let freqData = new Uint8Array(analyser.frequencyBinCount || 2048);
  let normData = new Float32Array(freqData.length);
  const resampled = new Float32Array(BINS_OUT);
  const smoothed = new Float32Array(BINS_OUT);
  const prevAmplitudes = new Float32Array(BINS_OUT);
  const lastFire = new Float64Array(BINS_OUT);
  lastFire.fill(-Infinity);
  const pulses = [];

  let smoothingInitialized = false;
  let prevTime = performance.now() / 1000;

  const render = () => {
    const now = performance.now() / 1000;
    prevTime = now;

    const { canvas } = ctx;
    const devicePixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    const displayWidth = Math.max(1, Math.floor((canvas.clientWidth || canvas.width || 1) * devicePixelRatio));
    const displayHeight = Math.max(1, Math.floor((canvas.clientHeight || canvas.height || 1) * devicePixelRatio));
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
    }

    const width = canvas.width || 1;
    const height = canvas.height || 1;
    if (width < 4 || height < 4) {
      ctx.clearRect(0, 0, width, height);
      return;
    }

    const ensured = ensureFrequencyBuffers(analyser, freqData, normData);
    ({ freqData, normData } = ensured);
    if (ensured.changed) {
      smoothingInitialized = false;
      smoothed.fill(0);
      prevAmplitudes.fill(0);
    }

    analyser.getByteFrequencyData(freqData);

    let hasEnergy = false;
    for (let i = 0; i < freqData.length; i++) {
      const normalized = Math.log1p(freqData[i]) / LOG_MAX;
      normData[i] = normalized;
      if (!hasEnergy && normalized > 0.002) {
        hasEnergy = true;
      }
    }

    resampleLinear(normData, resampled);

    let maxAmplitude = 0;
    if (!smoothingInitialized) {
      smoothed.set(resampled);
      prevAmplitudes.set(resampled);
      for (let i = 0; i < BINS_OUT; i++) {
        if (smoothed[i] > maxAmplitude) {
          maxAmplitude = smoothed[i];
        }
      }
      smoothingInitialized = true;
    } else {
      for (let i = 0; i < BINS_OUT; i++) {
        const previous = smoothed[i];
        prevAmplitudes[i] = previous;
        smoothed[i] = previous * 0.7 + resampled[i] * 0.3;
        if (smoothed[i] > maxAmplitude) {
          maxAmplitude = smoothed[i];
        }
      }
    }

    const zoom = clamp(view?.zoomX ?? 1, 0.4, 4);
    const radialScale = clamp(view?.zoomY ?? 1, 0.4, 3);
    const offsetY = clamp(view?.offsetY ?? 0, -1, 1);

    const minDim = Math.min(width, height);
    const baseRadius = Math.max(18, minDim * BASE_R * zoom);
    const centerX = width / 2;
    const centerY = height / 2 + offsetY * height * 0.2;
    const maxRadius = baseRadius * 1.02 + (T0 + TT * LIFETIME) * radialScale;

    ctx.fillStyle = "rgba(3, 6, 12, 0.92)";
    ctx.fillRect(0, 0, width, height);

    if (hasEnergy) {
      for (let i = 0; i < BINS_OUT; i++) {
        const amplitude = clamp(smoothed[i], 0, 1);
        const previously = prevAmplitudes[i];
        if (previously >= THRESH || amplitude < THRESH) continue;
        if (now - lastFire[i] < COOLDOWN) continue;
        lastFire[i] = now;
        const position = BINS_OUT > 1 ? i / (BINS_OUT - 1) : 0.5;
        pulses.push({
          position,
          amp: amplitude,
          born: now,
        });
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    let writeIndex = 0;
    for (let i = 0; i < pulses.length; i++) {
      const pulse = pulses[i];
      const age = now - pulse.born;
      if (age >= LIFETIME) {
        continue;
      }

      const fade = 1 - age / LIFETIME;
      const widthBase = W0 + WT * age;
      const verticalProgress = clamp(pulse.position, 0, 1);
      const verticalOffset = (0.5 - verticalProgress) * baseRadius * 2;
      const lateral = Math.sqrt(Math.max(0, baseRadius * baseRadius - verticalOffset * verticalOffset));
      const spread = (T0 + TT * age) * radialScale * (0.4 + pulse.amp * 0.6);
      const outerHalf = spread * 0.5;
      const innerHalf = Math.max(outerHalf * 0.18, outerHalf * widthBase * 0.55);

      const hue = 206 - Math.min(1, pulse.amp) * 170;
      const saturation = 58 + pulse.amp * 40;
      const lightness = 32 + pulse.amp * 46;
      const alpha = clamp(fade * (0.25 + pulse.amp * 0.55), 0, 1);

      ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;

      const startRadius = baseRadius * (0.06 + widthBase * 0.45);
      const maxReach = Math.max(width, height);
      const distanceToEdge = (sx, sy, dx, dy) => {
        const eps = 1e-5;
        const candidates = [];
        if (Math.abs(dx) > eps) {
          const tx = dx > 0 ? (width - sx) / dx : (0 - sx) / dx;
          if (tx > 0) candidates.push(tx);
        }
        if (Math.abs(dy) > eps) {
          const ty = dy > 0 ? (height - sy) / dy : (0 - sy) / dy;
          if (ty > 0) candidates.push(ty);
        }
        if (!candidates.length) return maxReach;
        return Math.min(...candidates);
      };
      const directionScale = clamp(0.65 + pulse.amp * 0.35, 0.1, 1);

      for (let side = -1; side <= 1; side += 2) {
        const radiusX = side * lateral;
        const dirLength = Math.hypot(radiusX, verticalOffset) || 1;
        const dirX = radiusX / dirLength;
        const dirY = verticalOffset / dirLength;
        const normalX = -dirY;
        const normalY = dirX;

        const startX = centerX + dirX * startRadius;
        const startY = centerY + dirY * startRadius;
        const edgeDistance = distanceToEdge(startX, startY, dirX, dirY);
        const length = edgeDistance * directionScale;
        const endX = startX + dirX * length;
        const endY = startY + dirY * length;

        ctx.beginPath();
        ctx.moveTo(startX + normalX * innerHalf, startY + normalY * innerHalf);
        ctx.lineTo(endX + normalX * outerHalf, endY + normalY * outerHalf);
        ctx.lineTo(endX - normalX * outerHalf, endY - normalY * outerHalf);
        ctx.lineTo(startX - normalX * innerHalf, startY - normalY * innerHalf);
        ctx.closePath();
        ctx.fill();
      }

      pulses[writeIndex++] = pulse;
    }
    pulses.length = writeIndex;
    ctx.restore();

    drawBase(ctx, centerX, centerY, baseRadius, maxRadius, maxAmplitude);

    if (!hasEnergy && pulses.length === 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(120, 150, 220, 0.25)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * 0.9, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    if (earthReady) {
      ctx.save();
      ctx.globalCompositeOperation = "source-over"; // draw normally, above inner glow

      // Earth size relative to radius — adjustment needed
      const earthRadius = baseRadius * 1.25;
      const size = earthRadius * 2;

      ctx.drawImage(
        earthImg,
        centerX - earthRadius,
        centerY - earthRadius,
        size,
        size
      );

      ctx.restore();
    }
  };

  render();
  return createAnimationLoop(render);
}
