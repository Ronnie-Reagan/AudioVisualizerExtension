const VISUALIZER_TITLE = "Visualizer";
const VISUALIZER_PATH = "/visualizer_system/visualizer.html";
const VISUALIZER_URL = chrome.runtime.getURL(VISUALIZER_PATH);
const RETRY_PATH = "/retry_system/retry.html";
const RETRY_URL = chrome.runtime.getURL(RETRY_PATH);
const VISUALIZER_DIMENSIONS = { width: 980, height: 580 };

let visualizerWindowId = null;
let visualizerTabId = null;
let lastTargetTabId = null;
let isStartingCapture = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      const result = await dispatchMessage(msg, sender);
      sendResponse({ ok: true, ...result });
    } catch (err) {
      console.error("Background message error:", err);
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === visualizerTabId) {
    visualizerTabId = null;
    visualizerWindowId = null;
  }
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === visualizerWindowId) {
    visualizerWindowId = null;
    visualizerTabId = null;
  }
});

async function dispatchMessage(msg = {}, sender = {}) {
  switch (msg.type) {
    case "REQUEST_STREAM_ID": {
      const streamId = await handleStreamIdRequest(msg.tabId);
      return { streamId };
    }
    case "START_CAPTURE": {
      await startCaptureFlow(msg.tabId, { lastFocusedWindow: true });
      return {};
    }
    case "STOP_CAPTURE": {
      await stopCapture({ closeWindow: true });
      return {};
    }
    case "STOP_STREAM_ONLY": {
      await stopCapture({ closeWindow: false });
      return {};
    }
    case "SWITCH_TO_ACTIVE_TAB": {
      await startCaptureFlow(null, { preferCurrentWindow: true });
      return {};
    }
    case "VISUALIZER_READY": {
      if (sender?.tab?.id) {
        visualizerTabId = sender.tab.id;
        visualizerWindowId = sender.tab.windowId;
      }
      return {};
    }
    case "RETRY_CAPTURE": {
      await retryCapture();
      return {};
    }
    default:
      throw new Error("Unknown message");
  }
}

async function handleStreamIdRequest(tabId) {
  const targetTabId = await resolveTargetTab(tabId, { lastFocusedWindow: true, allowLast: true });
  if (!targetTabId) throw new Error("No active tab");
  try {
    return await chrome.tabCapture.getMediaStreamId({ targetTabId });
  } catch (err) {
    console.error("Stream ID request failed:", err);
    throw err;
  }
}

async function startCaptureFlow(tabId, options = {}) {
  if (isStartingCapture) {
    console.warn("Capture already in progress; ignoring second request.");
    return;
  }

  isStartingCapture = true;
  try {
    const targetTabId = await resolveTargetTab(tabId, { ...options, allowLast: true });
    if (!targetTabId) throw new Error("No active tab available for capture.");

    lastTargetTabId = targetTabId;

    const visualizerTab = await ensureVisualizerTab();
    await waitForTabLoad(visualizerTab.id);
    await ensureVisualizerMessagingReady(visualizerTab.id);

    await sendStopStream(visualizerTab.id, { soft: true });
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId });
    await sendStartStream(visualizerTab.id, streamId, targetTabId);
  } catch (err) {
    await openRetryWindow(err?.message || "Audio capture failed.");
    throw err;
  } finally {
    isStartingCapture = false;
  }
}

async function retryCapture() {
  const attempts = [];
  if (lastTargetTabId) {
    attempts.push({ tabId: lastTargetTabId, options: { preferCurrentWindow: false, allowLast: false } });
  }
  attempts.push({ tabId: null, options: { preferCurrentWindow: true, allowLast: false } });

  for (const attempt of attempts) {
    try {
      await startCaptureFlow(attempt.tabId, attempt.options);
      return;
    } catch (err) {
      console.warn("Retry attempt failed:", err);
    }
  }

  throw new Error("Retry failed");
}

async function stopCapture({ closeWindow } = {}) {
  if (visualizerTabId) {
    await sendStopStream(visualizerTabId, { full: true });
  }
  if (closeWindow) {
    await closeVisualizerWindows();
  }
}

async function ensureVisualizerTab() {
  if (visualizerTabId) {
    const existing = await safeGetTab(visualizerTabId);
    if (existing) {
      await focusWindow(existing.windowId);
      return existing;
    }
    visualizerTabId = null;
    visualizerWindowId = null;
  }

  const visible = await findVisualizerTab();
  if (visible) {
    visualizerTabId = visible.id;
    visualizerWindowId = visible.windowId;
    await focusWindow(visible.windowId);
    return visible;
  }

  const created = await chrome.windows.create({
    url: VISUALIZER_URL,
    type: "popup",
    focused: true,
    ...VISUALIZER_DIMENSIONS,
  });

  visualizerWindowId = created.id ?? null;
  const tab = created.tabs?.[0];
  if (!tab) throw new Error("Failed to create visualizer window");
  visualizerTabId = tab.id;
  return tab;
}

async function findVisualizerTab() {
  const tabs = await chrome.tabs.query({ url: `${VISUALIZER_URL}*` });
  return tabs[0] ?? null;
}

async function waitForTabLoad(tabId) {
  const tab = await safeGetTab(tabId);
  if (tab?.status === "complete") return;

  await new Promise((resolve, reject) => {
    const onUpdated = (updatedTabId, info, updatedTab) => {
      if (updatedTabId !== tabId) return;
      if (info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.onRemoved.removeListener(onRemoved);
        resolve();
      }
      if (updatedTab?.status === "complete") {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.onRemoved.removeListener(onRemoved);
        resolve();
      }
    };

    const onRemoved = (removedTabId) => {
      if (removedTabId === tabId) {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.onRemoved.removeListener(onRemoved);
        reject(new Error("Visualizer tab closed before it finished loading."));
      }
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}

async function ensureVisualizerMessagingReady(tabId, attempts = 10) {
  for (let i = 0; i < attempts; i++) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "PING" });
      return;
    } catch (err) {
      if (err?.message?.includes("No tab with id")) throw err;
      if (i === attempts - 1) throw err;
      await delay(120);
    }
  }
}

async function sendStartStream(tabId, streamId, targetTabId) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "START_STREAM",
      streamId,
      targetTabId,
    });
  } catch (err) {
    console.error("Failed to deliver START_STREAM:", err);
    throw err;
  }
}

async function sendStopStream(tabId, { soft = false, full = false } = {}) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "STOP_STREAM",
      full: full || !soft,
    });
  } catch (err) {
    if (!err?.message?.includes("Receiving end does not exist")) {
      console.warn("Failed to deliver STOP_STREAM:", err);
    }
  }
}

async function closeVisualizerWindows() {
  const windows = await chrome.windows.getAll({ populate: true });
  await Promise.all(
    windows
      .filter((w) => {
        if (w.type !== "popup") return false;
        if (w.id === visualizerWindowId) return true;
        return w.tabs?.some((tab) => tab.url?.startsWith(VISUALIZER_URL));
      })
      .map((w) => chrome.windows.remove(w.id).catch((err) => {
        console.warn("Failed to close visualizer window:", err);
      }))
  );
  visualizerTabId = null;
  visualizerWindowId = null;
}

async function focusWindow(windowId) {
  if (!windowId) return;
  try {
    await chrome.windows.update(windowId, { focused: true });
  } catch (err) {
    console.warn("Failed to focus window:", err);
  }
}

async function openRetryWindow(message) {
  const query = new URLSearchParams({ message });
  await chrome.windows.create({
    url: `${RETRY_URL}?${query.toString()}`,
    type: "popup",
    width: 420,
    height: 240,
    focused: true,
  });
}

async function resolveTargetTab(tabId, options = {}) {
  const preferOrder = [];
  if (tabId) {
    preferOrder.push({ directId: tabId });
  }
  if (options.preferCurrentWindow) {
    preferOrder.push({ query: { active: true, currentWindow: true } });
  }
  if (options.lastFocusedWindow) {
    preferOrder.push({ query: { active: true, lastFocusedWindow: true } });
  }
  preferOrder.push({ query: { active: true } });

  if (options.allowLast && lastTargetTabId) {
    preferOrder.push({ directId: lastTargetTabId });
  }

  for (const candidate of preferOrder) {
    if (candidate.directId) {
      const tab = await safeGetTab(candidate.directId);
      if (isCapturableTab(tab)) return tab.id;
      continue;
    }
    const tab = await findCapturableTab(candidate.query);
    if (tab) return tab.id;
  }

  return null;
}

async function findCapturableTab(overrides = {}) {
  const tabs = await chrome.tabs.query({
    active: true,
    ...overrides,
  });
  return tabs.find(isCapturableTab) ?? null;
}

function isCapturableTab(tab) {
  if (!tab) return false;
  const url = tab.url ?? "";
  if (!url) return false;
  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://")) {
    if (url.startsWith(VISUALIZER_URL) || url.startsWith(RETRY_URL)) return false;
    if (url.includes(chrome.runtime.id)) return false;
  }
  return true;
}

async function safeGetTab(tabId) {
  if (!tabId && tabId !== 0) return null;
  try {
    return await chrome.tabs.get(tabId);
  } catch (err) {
    return null;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
