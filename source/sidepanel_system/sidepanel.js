import { initFromStreamId, stopVisualizer } from "../visualizer_system/audio/capture.js";

let inflight = null;
let autoStartEnabled = true;
let closeRequested = false;
const panelPort = connectToBackground();

const ui = window.visualizerUI ?? {};

async function startTabAudio() {
  if (document.visibilityState !== "visible") return;
  if (!autoStartEnabled) return;
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
      notifyBackgroundState({ streaming: true });
    } catch (err) {
      console.error("Sidebar capture error:", err);
      ui.setStatus?.("Capture failed", "error");
      ui.showToast?.(err?.message || "Unable to capture tab", "error");
      notifyBackgroundState({ error: err?.message, streaming: false });
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
    notifyBackgroundState({ streaming: false });
  }
});

window.addEventListener("beforeunload", () => {
  notifyBackgroundState({ streaming: false });
});

function connectToBackground() {
  if (!chrome?.runtime?.connect) return null;
  try {
    const port = chrome.runtime.connect({ name: "visualizer-sidepanel" });
    port.onMessage.addListener(handlePortMessage);
    port.onDisconnect.addListener(() => {
      closeRequested = false;
      autoStartEnabled = true;
    });
    // announce initial state
    port.postMessage({ type: "panel:state", streaming: false });
    return port;
  } catch (err) {
    console.warn("Side panel: failed to open background port", err);
    return null;
  }
}

function handlePortMessage(msg = {}) {
  if (!msg?.type) return;
  if (msg.type === "panel:close") {
    closeRequested = true;
    autoStartEnabled = false;
    gracefullyShutdown(msg.reason);
    return;
  }
}

function gracefullyShutdown(reason = "standalone-window") {
  stopVisualizer(true);
  ui.updatePaneIdleState?.(true);
  ui.setStatus?.("Idle", "idle");
  ui.showToast?.("Side panel paused — opening standalone window.", "info");
  notifyBackgroundState({ streaming: false });
  if (!panelPort) return;

  let resolved = false;
  const finish = (type, payload) => {
    if (resolved) return;
    resolved = true;
    try {
      panelPort.postMessage({ type, ...payload });
    } catch (err) {
      console.warn("Side panel: failed to send close ack", err);
    }
  };

  const attemptWindowClose = () => {
    try {
      window.close();
    } catch (err) {
      finish("panel:close-failed", { error: err?.message || "Unable to close side panel automatically." });
      return;
    }
    setTimeout(() => {
      if (document.visibilityState === "hidden") {
        finish("panel:closed");
      } else {
        finish("panel:close-failed", {
          error: "Side panel could not close automatically. Please close it manually.",
        });
      }
    }, 240);
  };

  attemptWindowClose();
}

function notifyBackgroundState(details = {}) {
  if (!panelPort) return;
  try {
    panelPort.postMessage({ type: "panel:state", ...details });
  } catch (err) {
    console.warn("Side panel: failed to report state", err);
  }
}
