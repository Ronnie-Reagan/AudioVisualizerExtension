import { audioCtx, source } from "./context.js";
import { getCanvasContext, clearCanvas } from "../shared/canvas.js";
import { drawSpectrum } from "../draw/spectrum.js";
import { drawSpectrogram } from "../draw/spectrogram.js";
import { drawXY } from "../draw/xy.js";
import { drawPCM } from "../draw/pcm.js";

export const modes = ["spectrum", "pcm", "spectrogram", "xy"];

const paneState = new Map();

export function registerPane(paneId) {
  if (!paneId) return;
  if (!paneState.has(paneId)) {
    paneState.set(paneId, {
      modeIndex: 0,
      teardown: null,
      needsStart: false,
    });
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
  let cancelLoop = null;
  let disconnectFns = [];

  if (modeName === "spectrum") {
    const analyser = createAnalyser();
    cancelLoop = drawSpectrum(analyser, ctx);
    disconnectFns = [() => disconnectSafe(source, analyser)];
  } else if (modeName === "xy") {
    const { splitter, analyserL, analyserR } = createStereoAnalysers();
    cancelLoop = drawXY(analyserL, analyserR, ctx);
    disconnectFns = [
      () => disconnectSafe(splitter, analyserL),
      () => disconnectSafe(splitter, analyserR),
      () => disconnectSafe(source, splitter),
    ];
  } else if (modeName === "spectrogram") {
    const analyser = createAnalyser();
    cancelLoop = drawSpectrogram(analyser, ctx);
    disconnectFns = [() => disconnectSafe(source, analyser)];
  } else {
    const analyser = createAnalyser();
    cancelLoop = drawPCM(analyser, ctx);
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
