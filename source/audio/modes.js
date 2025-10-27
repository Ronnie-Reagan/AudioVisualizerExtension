import { audioCtx, source } from "./context.js";
import { drawSpectrum } from "../draw/spectrum.js";
import { drawSpectrogram } from "../draw/spectrogram.js";
import { drawXY } from "../draw/xy.js";
import { drawPCM } from "../draw/pcm.js";

export const modes = ["spectrum", "xy", "spectrogram", "pcm"];
export let analyser, analyserL, analyserR, splitter;
export let currentMode = 0;

export function switchMode(index) {
  cancelAnimationFrame(window.rafId);
  window.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  if (!source) return;
  startMode(index);
}

export function startMode(index = currentMode) {
  currentMode = index;
  if (modes[index] === "spectrum") {
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    drawSpectrum(analyser);
  } else if (modes[index] === "xy") {
    splitter = audioCtx.createChannelSplitter(2);
    analyserL = audioCtx.createAnalyser();
    analyserR = audioCtx.createAnalyser();
    analyserL.fftSize = analyserR.fftSize = 2048;
    source.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);
    drawXY(analyserL, analyserR);
  } else if (modes[index] === "spectrogram") {
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    drawSpectrogram(analyser);
  } else {
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    drawPCM(analyser);
  }
}
