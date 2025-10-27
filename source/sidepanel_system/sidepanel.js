import { initFromStreamId, stopVisualizer } from "../visualizer_system/audio/capture.js";

let inflight = null;

async function startTabAudio() {
  if (document.visibilityState !== "visible") return;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id) {
        console.warn("Sidebar: no active tab to capture");
        return;
      }

      const res = await chrome.runtime.sendMessage({
        type: "REQUEST_STREAM_ID",
        tabId: tab.id,
      });
      if (!res?.ok) {
        console.error("Failed to get stream ID:", res?.error);
        return;
      }

      await initFromStreamId(res.streamId);
    } catch (err) {
      console.error("Sidebar capture error:", err);
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
  }
});
