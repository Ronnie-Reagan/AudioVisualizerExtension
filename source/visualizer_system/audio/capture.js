import { setupAudioContext, closeAudioContext } from "./context.js";
import { startAllPanes, stopAllPanes } from "./modes.js";
import { clearAllCanvases } from "../shared/canvas.js";

export let stream = null;

export async function initFromStreamId(id) {
  await stopVisualizer(true);
  try {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: id } },
    });
    stream = mediaStream;
    setupAudioContext(stream);
    startAllPanes();
  } catch (err) {
    console.error("Audio capture failed:", err);
    throw err;
  }
}

export function stopVisualizer(full = false) {
  stopAllPanes();
  if (full && stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  closeAudioContext();
  if (full) {
    clearAllCanvases();
  }
}

export function hasActiveStream() {
  return Boolean(stream);
}
