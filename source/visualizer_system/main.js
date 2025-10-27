import { initFromStreamId, stopVisualizer } from "./audio/capture.js";
import { switchMode, modes } from "./audio/modes.js";
import { initCanvas } from "./shared/canvas.js";

let currentModeIndex = 0;

bootstrap();

function bootstrap() {
  const canvas = document.getElementById("vis");
  initCanvas(canvas);
  hydrateFromQuery();
  registerRuntimeListeners();
  bindKeyboardShortcuts();
}

function hydrateFromQuery() {
  const params = new URLSearchParams(location.search);
  const streamId = params.get("streamId");
  if (streamId) initFromStreamId(streamId);
}

function registerRuntimeListeners() {
  if (!chrome?.runtime?.onMessage) return;
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "START_STREAM") initFromStreamId(msg.streamId);
    if (msg.type === "STOP_STREAM") stopVisualizer(true);
  });
}

function bindKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.key?.toLowerCase() !== "m") return;
    currentModeIndex = (currentModeIndex + 1) % modes.length;
    console.log("Mode switched to:", modes[currentModeIndex]);
    switchMode(currentModeIndex);
  });
}
