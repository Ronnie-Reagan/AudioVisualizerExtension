import { audioCtx, source } from "./context.js";
import { clearCanvas } from "../shared/canvas.js";
import { cancelScheduledFrame } from "../shared/animationLoop.js";
import { drawSpectrum } from "../draw/spectrum.js";
import { drawSpectrogram } from "../draw/spectrogram.js";
import { drawXY } from "../draw/xy.js";
import { drawPCM } from "../draw/pcm.js";

export const modes = ["spectrum", "pcm", "spectrogram", "xy"];

let teardownCurrentMode = null;
export let currentMode = 0;

export function switchMode(index) {
  currentMode = index;
  startMode(index);
}

export function startMode(index = currentMode) {
  if (!source) return;
  resetModeState();
  currentMode = index;

  const selectedMode = modes[index];

  if (selectedMode === "spectrum") {
    const analyser = createAnalyser();
    registerTeardown(() => disconnectSafe(source, analyser));
    drawSpectrum(analyser);
    return;
  }

  if (selectedMode === "xy") {
    const { splitter, analyserL, analyserR } = createStereoAnalysers();
    registerTeardown(() => {
      disconnectSafe(splitter, analyserL);
      disconnectSafe(splitter, analyserR);
      disconnectSafe(source, splitter);
    });
    drawXY(analyserL, analyserR);
    return;
  }

  if (selectedMode === "spectrogram") {
    const analyser = createAnalyser();
    registerTeardown(() => disconnectSafe(source, analyser));
    drawSpectrogram(analyser);
    return;
  }

  const analyser = createAnalyser();
  registerTeardown(() => disconnectSafe(source, analyser));
  drawPCM(analyser);
}

function resetModeState() {
  cancelScheduledFrame();
  clearCanvas();
  if (typeof teardownCurrentMode === "function") {
    try {
      teardownCurrentMode();
    } catch (err) {
      console.warn("Mode teardown failed:", err);
    }
  }
  teardownCurrentMode = null;
}

function createAnalyser(fftSize = 4096) {
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = fftSize;
  source.connect(analyser);
  return analyser;
}

function createStereoAnalysers(fftSize = 4096) {
  const splitter = audioCtx.createChannelSplitter(2);
  const analyserL = audioCtx.createAnalyser();
  const analyserR = audioCtx.createAnalyser();
  analyserL.fftSize = analyserR.fftSize = fftSize;
  source.connect(splitter);
  splitter.connect(analyserL, 0);
  splitter.connect(analyserR, 1);
  return { splitter, analyserL, analyserR };
}

function registerTeardown(fn) {
  teardownCurrentMode = fn;
}

function disconnectSafe(node, destination) {
  try {
    if (!node) return;
    if (destination) {
      node.disconnect(destination);
    } else {
      node.disconnect();
    }
  } catch (err) {
    console.warn("Failed to disconnect audio node:", err);
  }
}
