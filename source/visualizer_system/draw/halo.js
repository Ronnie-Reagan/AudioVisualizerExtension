import { createAnimationLoop } from "../shared/animationLoop.js";

const TAU = Math.PI * 2;
const LOG_MAX = Math.log1p(255);
const BINS_OUT = 512;
const LIFETIME = 1.0;
const T0 = 6;
const TT = 28;
const BASE_R = 0.10;
const ARC_START = (3 * Math.PI) / 4; // bottom-left (canvas coordinates)
const ARC_SPAN = (Math.PI * 3) / 2; // 270°
const ANGLE_POWER = 1.0;
const PARTICLE_THRESHOLD = 0.0125;
const PARTICLE_EMIT_RATE = 60; // particles/sec at amplitude === 1
const SPEED_MIN_RATIO = 1.0;
const SPEED_MAX_RATIO = 2.4;
const TAIL_MIN_RATIO = 0.08;
const TAIL_MAX_RATIO = 0.1;
const THICKNESS_MIN = 0.5;
const THICKNESS_MAX = 1.5;
const MAX_PARTICLES = 1200;
const STAR_COUNT = 720;
const STAR_SPEED_MIN = 80;
const STAR_SPEED_MAX = 200;
const STAR_TWINKLE_MIN = 0.8;
const STAR_TWINKLE_MAX = 1.9;

const BIN_BASE_ANGLES = new Float32Array(BINS_OUT);
const BIN_COS_CACHE = new Float32Array(BINS_OUT);
const BIN_SIN_CACHE = new Float32Array(BINS_OUT);
const AMP_LUT_SIZE = 256;
const AMP_LUT_SCALE = AMP_LUT_SIZE - 1;
const AMP_POW_090 = new Float32Array(AMP_LUT_SIZE);
const AMP_POW_085 = new Float32Array(AMP_LUT_SIZE);

const clamp = (value, min, max) => {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  const numeric = Number.isFinite(value) ? value : lower;
  return Math.min(Math.max(numeric, lower), upper);
};

const lerp = (a, b, t) => a + (b - a) * t;

for (let i = 0; i < BINS_OUT; i++) {
  if (BINS_OUT <= 1) {
    BIN_BASE_ANGLES[i] = ARC_SPAN * 0.5;
  } else {
    const normalized = i / (BINS_OUT - 1);
    BIN_BASE_ANGLES[i] = Math.pow(clamp(normalized, 0, 1), ANGLE_POWER) * ARC_SPAN;
  }
}

for (let i = 0; i < AMP_LUT_SIZE; i++) {
  const value = i / AMP_LUT_SCALE;
  AMP_POW_090[i] = Math.pow(value, 0.9);
  AMP_POW_085[i] = Math.pow(value, 0.85);
}

const sampleLut = (lut, value) => {
  if (value <= 0) return lut[0];
  if (value >= 1) return lut[AMP_LUT_SCALE];
  return lut[Math.floor(value * AMP_LUT_SCALE)];
};

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

function ensureFrequencyBuffers(analyser, freqData, normData) {
  const targetLength = analyser.frequencyBinCount || 0;
  if (targetLength === freqData.length) {
    return { freqData, normData, changed: false };
  }
  const nextFreq = new Uint8Array(targetLength || 2048);
  const nextNorm = new Float32Array(nextFreq.length);
  return { freqData: nextFreq, normData: nextNorm, changed: true };
}

function resampleLog(input, output) {
  const N = input.length;
  const O = output.length;
  for (let i = 0; i < O; i++) {
    const t = i / (O - 1);
    const src = Math.pow(t, 3.2) * (N - 1); // skews toward highs
    const idx = Math.floor(src);
    const frac = src - idx;
    const next = Math.min(idx + 1, N - 1);
    output[i] = input[idx] * (1 - frac) + input[next] * frac;
  }
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
  const emissionResidue = new Float32Array(BINS_OUT);
  const particles = [];
  const particlePool = [];
  const stars = [];
  let starWidth = 0;
  let starHeight = 0;

  const createParticle = () => ({
    dirX: 0,
    dirY: 0,
    amplitude: 0,
    distance: 0,
    speed: 0,
    tail: 0,
    thickness: 0,
    hue: 0,
    saturation: 0,
    lightness: 0,
  });

  const acquireParticle = () => particlePool.pop() || createParticle();
  const recycleParticle = (particle) => {
    if (!particle) return;
    particlePool.push(particle);
  };

  const createStar = () => ({
    x: 0,
    y: 0,
    speed: 0,
    size: 0,
    alpha: 0,
    twinkle: 0,
    twinkleSpeed: 0,
  });

  const respawnStar = (
    star,
    width,
    height,
    centerX,
    centerY,
    dirX,
    dirY,
    distanceFactor = Math.random()
  ) => {
    const spread = Math.max(width, height) * 1.35;
    const offset = (Math.random() - 0.5) * spread;
    const baseX = centerX + -dirY * offset;
    const baseY = centerY + dirX * offset;
    const distance = spread * (0.2 + distanceFactor);
    star.x = baseX - dirX * distance;
    star.y = baseY - dirY * distance;
    star.speed = STAR_SPEED_MIN + Math.random() * (STAR_SPEED_MAX - STAR_SPEED_MIN);
    star.size = 0.35 + Math.random() * 1.2;
    star.alpha = 0.05 + Math.random() * 0.25;
    star.twinkle = Math.random() * TAU;
    star.twinkleSpeed = STAR_TWINKLE_MIN + Math.random() * (STAR_TWINKLE_MAX - STAR_TWINKLE_MIN);
  };

  const ensureStarField = (count, width, height, centerX, centerY, dirX, dirY) => {
    if (!stars.length || width !== starWidth || height !== starHeight) {
      stars.length = 0;
      starWidth = width;
      starHeight = height;
    }
    if (stars.length < count) {
      const deficit = count - stars.length;
      for (let i = 0; i < deficit; i++) {
        const star = createStar();
        respawnStar(star, width, height, centerX, centerY, dirX, dirY, Math.random());
        stars.push(star);
      }
    } else if (stars.length > count) {
      stars.length = count;
    }
  };

  let smoothingInitialized = false;
  let prevTime = performance.now() / 1000;

  const render = () => {
    const now = performance.now() / 1000;
    const delta = Math.min(0.05, now - prevTime);
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
      emissionResidue.fill(0);
      particles.length = 0;
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

    resampleLog(normData, resampled);

    let maxAmplitude = 0;
    if (!smoothingInitialized) {
      smoothed.set(resampled);
      for (let i = 0; i < BINS_OUT; i++) {
        if (smoothed[i] > maxAmplitude) {
          maxAmplitude = smoothed[i];
        }
      }
      smoothingInitialized = true;
    } else {
      for (let i = 0; i < BINS_OUT; i++) {
        smoothed[i] = resampled[i];
        if (smoothed[i] > maxAmplitude) {
          maxAmplitude = smoothed[i];
        }
      }
    }

    const zoom = clamp(view?.zoomX ?? 1, 0.4, 4);
    const radialScale = clamp(view?.zoomY ?? 1, 0.4, 3);
    const offsetY = clamp(view?.offsetY ?? 0, -1, 1);
    const binRotationBase = Number.isFinite(view?.binRotation) ? view.binRotation : 0;
    const binSpin = Number.isFinite(view?.binSpin) ? view.binSpin : 0;
    const binRotation = binRotationBase + binSpin * now;
    const earthRotationBase = Number.isFinite(view?.earthRotation) ? view.earthRotation : 0;
    const earthSpin = Number.isFinite(view?.earthSpin) ? view.earthSpin : 0;
    const earthRotation = earthRotationBase + earthSpin * now;

    const minDim = Math.min(width, height);
    const diag = Math.hypot(width, height);
    const baseRadius = Math.max(18, minDim * BASE_R * zoom);
    const centerX = width / 2;
    const centerY = height / 2 + offsetY * height * 0.2;
    const maxRadius = baseRadius * 1.02 + (T0 + TT * LIFETIME) * radialScale;
    const maxParticleDistance = diag * 0.85 + baseRadius;
    const arcStart = ARC_START + binRotation;
    const arcMidAngle = arcStart - ARC_SPAN / 2;
    const windAngle = arcMidAngle + Math.PI;
    const windDirX = Math.cos(windAngle);
    const windDirY = Math.sin(windAngle);
    const starCount = Math.max(32, Math.floor(STAR_COUNT * clamp(radialScale, 0.6, 1.4)));
    const minSpeed = minDim * SPEED_MIN_RATIO;
    const maxSpeed = minDim * SPEED_MAX_RATIO;
    const tailMin = minDim * TAIL_MIN_RATIO;
    const tailMax = minDim * TAIL_MAX_RATIO;
    for (let i = 0; i < BINS_OUT; i++) {
      const angle = arcStart + BIN_BASE_ANGLES[i];
      BIN_COS_CACHE[i] = Math.cos(angle);
      BIN_SIN_CACHE[i] = Math.sin(angle);
    }

    const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
    backgroundGradient.addColorStop(0, "rgba(2, 8, 18, 0.95)");
    backgroundGradient.addColorStop(0.7, "rgba(0, 3, 8, 0.98)");
    backgroundGradient.addColorStop(1, "rgba(0, 0, 0, 1)");
    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(0, 0, width, height);

    ensureStarField(starCount, width, height, centerX, centerY, windDirX, windDirY);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = "rgb(150, 190, 255)";
    const starBoundary = Math.max(width, height) * 0.85;
    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];
      star.x += windDirX * star.speed * delta;
      star.y += windDirY * star.speed * delta;
      star.twinkle += star.twinkleSpeed * delta;
      const twinkle = 0.55 + 0.45 * Math.sin(star.twinkle);
      ctx.globalAlpha = star.alpha * twinkle;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, TAU);
      ctx.fill();
      const relX = star.x - centerX;
      const relY = star.y - centerY;
      const along = relX * windDirX + relY * windDirY;
      const perp = relX * -windDirY + relY * windDirX;
      if (along > starBoundary || along < -starBoundary || Math.abs(perp) > starBoundary) {
        respawnStar(star, width, height, centerX, centerY, windDirX, windDirY);
      }
    }
    ctx.restore();

    let particleBudget = Math.max(0, MAX_PARTICLES - particles.length);
    if (hasEnergy && particleBudget > 0) {
      for (let i = 0; i < BINS_OUT; i++) {
        const amplitude = clamp(smoothed[i], 0, 1);
        if (amplitude < PARTICLE_THRESHOLD) {
          emissionResidue[i] = 0;
          continue;
        }
        const dirX = BIN_COS_CACHE[i];
        const dirY = BIN_SIN_CACHE[i];
        const emitAmount = amplitude * PARTICLE_EMIT_RATE * delta;
        emissionResidue[i] += emitAmount;
        const speedFactor = sampleLut(AMP_POW_090, amplitude);
        const thicknessFactor = sampleLut(AMP_POW_085, amplitude);
        const tailFactor = clamp(amplitude * 1.1, 0, 1);
        while (emissionResidue[i] >= 1 && particleBudget > 0) {
          emissionResidue[i] -= 1;
          const particle = acquireParticle();
          particle.dirX = dirX;
          particle.dirY = dirY;
          particle.amplitude = amplitude;
          particle.distance = baseRadius * 1.25;
          particle.speed = lerp(minSpeed, maxSpeed, speedFactor);
          particle.tail = lerp(tailMin, tailMax, tailFactor);
          particle.thickness = lerp(THICKNESS_MIN, THICKNESS_MAX, thicknessFactor);
          particle.hue = 212 - amplitude * 170;
          particle.saturation = 58 + amplitude * 38;
          particle.lightness = 38 + amplitude * 36;
          particles.push(particle);
          particleBudget--;
        }
        if (particleBudget <= 0) break;
      }
    } else if (!hasEnergy) {
      emissionResidue.fill(0);
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    let writeIndex = 0;
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      particle.distance += particle.speed * delta;
      if (particle.distance - particle.tail > maxParticleDistance) {
        recycleParticle(particle);
        continue;
      }

      const startDist = Math.max(0, particle.distance - particle.tail);
      const endDist = particle.distance;
      const startX = centerX + particle.dirX * startDist;
      const startY = centerY + particle.dirY * startDist;
      const endX = centerX + particle.dirX * endDist;
      const endY = centerY + particle.dirY * endDist;

      const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
      const headAlpha = clamp(0.12 + particle.amplitude * 0.65, 0, 1);
      gradient.addColorStop(
        0,
        `hsla(${particle.hue}, ${particle.saturation}%, ${particle.lightness}%, ${headAlpha})`
      );
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.lineWidth = particle.thickness;
      ctx.strokeStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      particles[writeIndex++] = particle;
    }
    particles.length = writeIndex;
    ctx.restore();

    drawBase(ctx, centerX, centerY, baseRadius, maxRadius, maxAmplitude);

    if (!hasEnergy && particles.length === 0) {
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
      ctx.globalCompositeOperation = "source-over";
      const earthRadius = baseRadius * 1.25;
      const size = earthRadius * 2;
      ctx.translate(centerX, centerY);
      ctx.rotate(earthRotation);
      ctx.drawImage(earthImg, -earthRadius, -earthRadius, size, size);
      ctx.restore();
    }
  };

  render();
  return createAnimationLoop(render);
}
