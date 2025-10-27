import { setupAudioContext, closeAudioContext } from "./context.js";
import { startMode } from "./modes.js";
import { cancelScheduledFrame } from "../shared/animationLoop.js";
import { clearCanvas } from "../shared/canvas.js";

export let stream = null;

export async function initFromStreamId(id) {
  stopVisualizer(true);
  try {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: id } },
    });
    stream = mediaStream;
    setupAudioContext(stream);
    startMode();
  } catch (err) {
    console.error("Audio capture failed:", err);
  }
}

export function stopVisualizer(full = false) {
  cancelScheduledFrame();
  if (full && stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  closeAudioContext();
  clearCanvas();
}
