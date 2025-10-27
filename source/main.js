import { initFromStreamId, stopVisualizer } from "./audio/capture.js";
import { switchMode, startMode, modes } from "./audio/modes.js";

let currentModeIndex = 0;

const canvas = document.getElementById("vis");
window.ctx = canvas.getContext("2d", { willReadFrequently: true });

const params = new URLSearchParams(location.search);
const streamId = params.get("streamId");
if (streamId) initFromStreamId(streamId);

chrome.runtime?.onMessage.addListener(async (msg) => {
  if (msg.type === "START_STREAM") initFromStreamId(msg.streamId);
  if (msg.type === "STOP_STREAM") stopVisualizer(true);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "m") {
    currentModeIndex = (currentModeIndex + 1) % modes.length;
    console.log("Mode switched to:", modes[currentModeIndex]);
    switchMode(currentModeIndex);
  }
});
