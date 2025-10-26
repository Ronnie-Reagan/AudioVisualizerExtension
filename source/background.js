// background.js — MV3-safe version

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "START_CAPTURE") {
        // Close any previous capture windows before starting again
        const allWindows = await chrome.windows.getAll();
        for (const w of allWindows) {
          if (w.title === "Visualizer") await chrome.windows.remove(w.id);
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          await openRetryWindow("No active tab found.");
          sendResponse({ ok: false, error: "No active tab." });
          return;
        }

        let streamId;
        try {
          streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
        } catch (err) {
          console.error("tabCapture failed:", err.message);
          await openRetryWindow("Tab capture failed: " + err.message);
          sendResponse({ ok: false, error: err.message });
          return;
        }

        // Launch visualizer window with stream ID query
        await chrome.windows.create({
          url: chrome.runtime.getURL("visualizer.html") + `?streamId=${streamId}`,
          type: "popup",
          width: 800,
          height: 400
        });

        sendResponse({ ok: true });
      }

      else if (msg.type === "STOP_CAPTURE") {
        const windows = await chrome.windows.getAll();
        for (const w of windows) {
          if (w.title === "Visualizer") await chrome.windows.remove(w.id);
        }
        sendResponse({ ok: true });
      }

      else {
        sendResponse({ ok: false, error: "Unknown message" });
      }
    } catch (e) {
      console.error("START_CAPTURE error:", e);
      await openRetryWindow("Error: " + e.message);
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true;
});

// === helper ===
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

  await chrome.windows.create({
    url: retryUrl,
    type: "popup",
    width: 360,
    height: 200
  });
}
