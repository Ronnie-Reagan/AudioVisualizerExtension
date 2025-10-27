import { setupAudioContext, closeAudioContext } from "./context.js";
import { startMode } from "./modes.js";

export let stream = null;
let rafId = null;

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
  cancelAnimationFrame(rafId);
  if (full && stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  closeAudioContext();
  const { width, height } = document.getElementById("vis");
  window.ctx.clearRect(0, 0, width, height);
}
