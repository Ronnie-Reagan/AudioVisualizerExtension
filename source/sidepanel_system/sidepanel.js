import { initFromStreamId, stopVisualizer } from "../visualizer_system/audio/capture.js";

let inflight = null;

const ui = window.visualizerUI ?? {};

async function startTabAudio() {
  if (document.visibilityState !== "visible") return;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      ui.setStatus?.("Requesting…", "active");
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        ui.setStatus?.("No capturable tab", "error");
        ui.showToast?.("Select a regular tab to capture", "error");
        return;
      }

      const res = await chrome.runtime.sendMessage({
        type: "REQUEST_STREAM_ID",
        tabId: tab.id,
      });
      if (!res?.ok) {
        const message = res?.error || "Failed to get stream";
        console.error("Failed to get stream ID:", message);
        ui.setStatus?.("Capture failed", "error");
        ui.showToast?.(message, "error");
        return;
      }

      await initFromStreamId(res.streamId);
      ui.updatePaneIdleState?.(false);
      ui.setStatus?.("Streaming", "active");
    } catch (err) {
      console.error("Sidebar capture error:", err);
      ui.setStatus?.("Capture failed", "error");
      ui.showToast?.(err?.message || "Unable to capture tab", "error");
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

startTabAudio();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    startTabAudio();
  } else {
    stopVisualizer(true);
    ui.updatePaneIdleState?.(true);
    ui.setStatus?.("Idle", "idle");
  }
});
