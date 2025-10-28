import { audioCtx, source } from "./context.js";
import { getCanvasContext, clearCanvas } from "../shared/canvas.js";
import { drawSpectrum } from "../draw/spectrum.js";
import { drawSpectrogram } from "../draw/spectrogram.js";
import { drawXY } from "../draw/xy.js";
import { drawPCM } from "../draw/pcm.js";
import { drawHalo } from "../draw/halo.js";

export const modes = ["spectrum", "pcm", "spectrogram", "halo", "xy"];

const paneState = new Map();

const defaultViewTemplate = Object.freeze({
  spectrum: Object.freeze({ zoomX: 1, zoomY: 1, offsetX: 0, offsetY: 0 }),
  pcm: Object.freeze({ zoomX: 1, zoomY: 1, offsetX: 0, offsetY: 0 }),
  spectrogram: Object.freeze({ zoomY: 1, intensity: 1, speed: 1, offsetY: 0 }),
  halo: Object.freeze({ zoomX: 1, zoomY: 1, offsetX: 0, offsetY: 0 }),
  xy: Object.freeze({
    scale: 1,
    persistence: 0.25,
    intensity: 1,
    blanking: 0.12,
    smoothing: 0.50,
  }),
});

function createDefaultViewState() {
  return {
    spectrum: { ...defaultViewTemplate.spectrum },
    pcm: { ...defaultViewTemplate.pcm },
    spectrogram: { ...defaultViewTemplate.spectrogram },
    halo: { ...defaultViewTemplate.halo },
    xy: { ...defaultViewTemplate.xy },
  };
}

export function registerPane(paneId) {
  if (!paneId) return;
  if (!paneState.has(paneId)) {
    paneState.set(paneId, {
      modeIndex: 0,
      teardown: null,
      needsStart: false,
      view: createDefaultViewState(),
    });
  } else {
    const state = paneState.get(paneId);
    if (!state.view) {
      state.view = createDefaultViewState();
    }
  }
  startPane(paneId);
}

export function unregisterPane(paneId) {
  const state = paneState.get(paneId);
  if (!state) return;
  teardownState(state);
  paneState.delete(paneId);
}

export function startAllPanes() {
  for (const paneId of paneState.keys()) {
    startPane(paneId);
  }
}

export function stopAllPanes() {
  for (const state of paneState.values()) {
    teardownState(state);
  }
}

export function cycleMode(paneId) {
  const state = paneState.get(paneId);
  if (!state) return;
  state.modeIndex = (state.modeIndex + 1) % modes.length;
  startPane(paneId);
  return modes[state.modeIndex];
}

export function setMode(paneId, index) {
  const state = paneState.get(paneId);
  if (!state) return;
  state.modeIndex = ((index % modes.length) + modes.length) % modes.length;
  startPane(paneId);
  return modes[state.modeIndex];
}

export function getModeIndex(paneId) {
  return paneState.get(paneId)?.modeIndex ?? 0;
}

export function getModeName(paneId) {
  const index = getModeIndex(paneId);
  return modes[index] ?? modes[0];
}

export function getViewState(paneId) {
  return paneState.get(paneId)?.view ?? null;
}

export function updateViewState(paneId, modeName, mutator) {
  const state = paneState.get(paneId);
  if (!state) return null;
  const view = state.view ?? (state.view = createDefaultViewState());
  const targetMode = modeName ?? getModeName(paneId);
  const target = view[targetMode];
  if (!target) return null;
  if (typeof mutator === "function") {
    const result = mutator(target);
    if (result && typeof result === "object") {
      Object.assign(target, result);
    }
  } else if (mutator && typeof mutator === "object") {
    Object.assign(target, mutator);
  }
  clampViewForMode(targetMode, target);
  return target;
}

export function resetViewState(paneId, modeName = null) {
  const state = paneState.get(paneId);
  if (!state) return;
  const view = state.view ?? (state.view = createDefaultViewState());
  const defaults = createDefaultViewState();
  if (modeName) {
    if (defaults[modeName]) {
      Object.assign(view[modeName], defaults[modeName]);
      clampViewForMode(modeName, view[modeName]);
    }
    return;
  }
  for (const key of Object.keys(defaults)) {
    Object.assign(view[key], defaults[key]);
    clampViewForMode(key, view[key]);
  }
}

function startPane(paneId) {
  const state = paneState.get(paneId);
  if (!state) return;

  const ctx = getCanvasContext(paneId);
  if (!ctx) {
    state.needsStart = true;
    return;
  }

  if (!source) {
    state.needsStart = true;
    clearCanvas(paneId);
    return;
  }

  teardownState(state);
  clearCanvas(paneId);

  const modeName = getModeName(paneId);
  const view = state.view ?? (state.view = createDefaultViewState());
  let cancelLoop = null;
  let disconnectFns = [];

  if (modeName === "spectrum") {
    const analyser = createAnalyser();
    cancelLoop = drawSpectrum(analyser, ctx, view.spectrum);
    disconnectFns = [() => disconnectSafe(source, analyser)];
  } else if (modeName === "halo") {
    const analyser = createAnalyser();
    cancelLoop = drawHalo(analyser, ctx, view.halo);
    disconnectFns = [() => disconnectSafe(source, analyser)];
  } else if (modeName === "xy") {
    const { splitter, analyserL, analyserR } = createStereoAnalysers();
    cancelLoop = drawXY(analyserL, analyserR, ctx, view.xy);
    disconnectFns = [
      () => disconnectSafe(splitter, analyserL),
      () => disconnectSafe(splitter, analyserR),
      () => disconnectSafe(source, splitter),
    ];
  } else if (modeName === "spectrogram") {
    const analyser = createAnalyser();
    cancelLoop = drawSpectrogram(analyser, ctx, view.spectrogram);
    disconnectFns = [() => disconnectSafe(source, analyser)];
  } else {
    const analyser = createAnalyser();
    cancelLoop = drawPCM(analyser, ctx, view.pcm);
    disconnectFns = [() => disconnectSafe(source, analyser)];
  }

  state.teardown = () => {
    cancelLoop?.();
    for (const fn of disconnectFns) {
      try {
        fn();
      } catch (err) {
        console.warn("Failed to disconnect audio node:", err);
      }
    }
    clearCanvas(paneId);
  };
  state.needsStart = false;
}

function teardownState(state) {
  if (state.teardown) {
    try {
      state.teardown();
    } catch (err) {
      console.warn("Pane teardown failed:", err);
    }
    state.teardown = null;
  }
  state.needsStart = true;
}

function createAnalyser(fftSize = 4096) {
  const analyser = audioCtx?.createAnalyser();
  if (!analyser || !source) return analyser;
  analyser.fftSize = fftSize;
  source.connect(analyser);
  return analyser;
}

function createStereoAnalysers(fftSize = 4096) {
  const splitter = audioCtx?.createChannelSplitter(2);
  const analyserL = audioCtx?.createAnalyser();
  const analyserR = audioCtx?.createAnalyser();
  if (!splitter || !analyserL || !analyserR || !source) {
    return { splitter, analyserL, analyserR };
  }
  analyserL.fftSize = analyserR.fftSize = fftSize;
  source.connect(splitter);
  splitter.connect(analyserL, 0);
  splitter.connect(analyserR, 1);
  return { splitter, analyserL, analyserR };
}

function disconnectSafe(node, destination) {
  if (!node) return;
  try {
    if (destination) {
      node.disconnect(destination);
    } else {
      node.disconnect();
    }
  } catch (err) {
    console.warn("Failed to disconnect audio node:", err);
  }
}

function clampViewForMode(modeName, target) {
  if (!target) return;
  if (modeName === "spectrum" || modeName === "pcm" || modeName === "halo") {
    target.zoomX = clampNumber(target.zoomX, 0.25, 20);
    target.zoomY = clampNumber(target.zoomY, 0.2, 12);
    target.offsetX = clampNumber(target.offsetX, 0, 1);
    target.offsetY = clampNumber(target.offsetY, -1, 1);
  } else if (modeName === "spectrogram") {
    target.zoomY = clampNumber(target.zoomY, 0.5, 6);
    target.intensity = clampNumber(target.intensity, 0.2, 4.5);
    target.speed = clampNumber(target.speed, 0.25, 5);
    target.offsetY = clampNumber(target.offsetY, 0, 1);
  } else if (modeName === "xy") {
    target.scale = clampNumber(target.scale, 0.4, 8);
    target.persistence = clampNumber(target.persistence, 0.2, 0.98);
    target.intensity = clampNumber(target.intensity, 0.2, 3);
    target.blanking = clampNumber(target.blanking, 0.02, 0.6);
    target.smoothing = clampNumber(target.smoothing, 0.2, 0.95);
  }
}

function clampNumber(value, min, max) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  const numeric = Number.isFinite(value) ? value : low;
  return Math.min(Math.max(numeric, low), high);
}
