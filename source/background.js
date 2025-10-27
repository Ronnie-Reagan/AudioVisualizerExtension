// background.js — MV3-safe version
importScripts("logger.js");

const logger = Logger.createLogger("background");

const windowState = {
  visualizer: null,
  retry: null
};

chrome.windows.onRemoved.addListener((removedId) => {
  if (removedId === windowState.visualizer) {
    windowState.visualizer = null;
  }
  if (removedId === windowState.retry) {
    windowState.retry = null;
  }
});

async function closeTrackedWindow(key) {
  const id = windowState[key];
  if (!id) return;
  try {
    await chrome.windows.remove(id);
  } catch (error) {
    console.warn(`Failed to close ${key} window`, error);
  } finally {
    if (windowState[key] === id) {
      windowState[key] = null;
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "START_CAPTURE") {
        // Close any previous capture windows before starting again
        await closeVisualizerWindows();
        await closeTrackedWindow("visualizer");
        await closeTrackedWindow("retry");

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          logger.warn("No active tab found when starting capture");
          await openRetryWindow("No active tab found.");
          sendResponse({ ok: false, error: "No active tab." });
          return;
        }

        let streamId;
        try {
          streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
        } catch (err) {
          logger.error("tabCapture failed", err.message);
          await openRetryWindow("Tab capture failed: " + err.message);
          sendResponse({ ok: false, error: err.message });
          return;
        }

        // Launch visualizer window with stream ID query
        const visualizerWindow = await chrome.windows.create({
          url: chrome.runtime.getURL("visualizer.html") + `?streamId=${streamId}`,
          type: "popup",
          width: 800,
          height: 400
        });

        logger.info("Visualizer window created for stream", streamId);
        sendResponse({ ok: true });
      }

      else if (msg.type === "STOP_CAPTURE") {
        await closeVisualizerWindows();
        const windows = await chrome.windows.getAll();
        for (const w of windows) {
          if (w.title === "Visualizer") await chrome.windows.remove(w.id);
        }
        logger.info("Visualizer windows closed on STOP_CAPTURE");
        sendResponse({ ok: true });
      }

      else {
        logger.warn("Unknown message type", msg.type);
        sendResponse({ ok: false, error: "Unknown message" });
      }
    } catch (e) {
      logger.error("START_CAPTURE error", e);
      await openRetryWindow("Error: " + e.message);
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true;
});

// === helper ===
async function closeVisualizerWindows() {
  const windows = await chrome.windows.getAll({ populate: true });
  for (const w of windows) {
    if (w.title !== "Visualizer") continue;

    await messageWindowTabs(w, { type: "STOP_STREAM" });
    await delay(100);

    try {
      await chrome.windows.remove(w.id);
    } catch (err) {
      const message = chrome.runtime.lastError?.message || err?.message;
      console.warn("Failed to remove Visualizer window", message);
    }
  }
}

async function messageWindowTabs(window, message) {
  if (!window.tabs?.length) return;

  for (const tab of window.tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch (err) {
      const message = chrome.runtime.lastError?.message || err?.message;
      console.warn(`STOP_STREAM message failed for tab ${tab.id}:`, message);
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openRetryWindow(errMsg = "Audio capture failed.") {
  const html = `
    <html>
      <body style="background:#111;color:#fff;
                   font-family:sans-serif;
                   display:flex;flex-direction:column;
                   align-items:center;justify-content:center;
                   height:100%;margin:0">
        <h2>${errMsg}</h2>
        <button id="retry"
                style="padding:10px 20px;
                       font-size:16px;
                       background:#0f0;color:#111;
                       border:none;border-radius:6px;
                       cursor:pointer;">
          Retry Capture
        </button>
        <script>
          document.getElementById("retry").onclick = () => {
            chrome.runtime.sendMessage({ type: "START_CAPTURE" });
            window.close();
          };
        </script>
      </body>
    </html>`;

  // MV3 background scripts cannot use URL.createObjectURL
  const retryUrl =
    "data:text/html;base64," +
    btoa(unescape(encodeURIComponent(html)));

  await closeTrackedWindow("retry");

  const retryWindow = await chrome.windows.create({
    url: retryUrl,
    type: "popup",
    width: 360,
    height: 200
  });
  logger.info("Retry window opened", errMsg);
}
