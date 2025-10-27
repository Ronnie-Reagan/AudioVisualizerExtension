import { setupAudioContext, closeAudioContext } from "./context.js";
import { startMode } from "./modes.js";

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
  if (typeof window !== "undefined" && window.rafId) {
    cancelAnimationFrame(window.rafId);
    window.rafId = null;
  }
  if (full && stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  closeAudioContext();
  const canvas = typeof document !== "undefined" ? document.getElementById("vis") : null;
  if (canvas && window.ctx) {
    window.ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}
