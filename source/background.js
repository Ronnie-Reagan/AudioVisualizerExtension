const VISUALIZER_TITLE = "Visualizer";
const VISUALIZER_PATH = "/visualizer_system/visualizer.html";
const VISUALIZER_URL = chrome.runtime.getURL(VISUALIZER_PATH);
const VISUALIZER_DIMENSIONS = { width: 800, height: 400 };

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      const result = await dispatchMessage(msg);
      sendResponse({ ok: true, ...result });
    } catch (err) {
      console.error("Background message error:", err);
      if (msg?.type === "START_CAPTURE") {
        try {
          await openRetryWindow(err.message);
        } catch (retryErr) {
          console.error("Failed to open retry window:", retryErr);
        }
      }
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true;
});

async function dispatchMessage(msg = {}) {
  switch (msg.type) {
    case "REQUEST_STREAM_ID": {
      const streamId = await handleStreamIdRequest(msg.tabId);
      return { streamId };
    }
    case "START_CAPTURE": {
      await handleStartCapture(msg.tabId);
      return {};
    }
    case "STOP_CAPTURE": {
      await closeVisualizerWindows();
      return {};
    }
    default:
      throw new Error("Unknown message");
  }
}

async function handleStreamIdRequest(tabId) {
  const targetTabId = await resolveTargetTab(tabId);
  if (!targetTabId) throw new Error("No active tab");
  try {
    return await chrome.tabCapture.getMediaStreamId({ targetTabId });
  } catch (err) {
    console.error("Stream ID request failed:", err);
    throw err;
  }
}

async function handleStartCapture(tabId) {
  await closeVisualizerWindows();
  const targetTabId = await resolveTargetTab(tabId, { useCurrentWindow: true });
  if (!targetTabId) {
    await openRetryWindow("No active tab found.");
    throw new Error("No active tab.");
  }

  let streamId;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId });
  } catch (err) {
    console.error("tabCapture failed:", err.message);
    await openRetryWindow("Tab capture failed: " + err.message);
    throw err;
  }

  await openVisualizerWindow(streamId);
}

async function resolveTargetTab(tabId, options = {}) {
  if (tabId) return tabId;
  const query = {
    active: true,
    lastFocusedWindow: !options.useCurrentWindow,
    currentWindow: Boolean(options.useCurrentWindow),
  };
  const [tab] = await chrome.tabs.query(query);
  return tab?.id ?? null;
}

async function closeVisualizerWindows() {
  const allWindows = await chrome.windows.getAll({ populate: true });
  await Promise.all(
    allWindows
      .filter((w) => {
        if (w.type !== "popup") return false;
        if (w.title === VISUALIZER_TITLE) return true;
        return w.tabs?.some((tab) => tab.url?.startsWith(VISUALIZER_URL));
      })
      .map((w) => chrome.windows.remove(w.id).catch((err) => {
        console.warn("Failed to close visualizer window:", err);
      }))
  );
}

async function openVisualizerWindow(streamId) {
  const url = `${VISUALIZER_URL}?streamId=${encodeURIComponent(streamId)}`;
  await chrome.windows.create({
    url,
    type: "popup",
    ...VISUALIZER_DIMENSIONS,
  });
}

async function openRetryWindow(errMsg = "Audio capture failed.") {
  const safeMessage = escapeHtml(errMsg);
  const html = `
    <html>
      <body style="background:#111;color:#fff;
                   font-family:sans-serif;
                   display:flex;flex-direction:column;
                   align-items:center;justify-content:center;
                   height:100%;margin:0">
        <h2>${safeMessage}</h2>
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

  await chrome.windows.create({
    url: retryUrl,
    type: "popup",
    width: 360,
    height: 200
  });
}

function escapeHtml(text = "") {
  return String(text).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}
