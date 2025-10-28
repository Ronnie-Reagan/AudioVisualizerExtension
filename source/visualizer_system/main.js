import { initFromStreamId, stopVisualizer, hasActiveStream } from "./audio/capture.js";
import { registerPane, unregisterPane, cycleMode, getModeName } from "./audio/modes.js";
import { registerCanvas, unregisterCanvas } from "./shared/canvas.js";

const paneRoot = document.getElementById("paneRoot");
const statusBadge = document.getElementById("statusBadge");
const hookActiveBtn = document.getElementById("hookActive");
const stopStreamBtn = document.getElementById("stopStream");
const toastEl = document.getElementById("toast");

let paneCounter = 0;
let layoutRoot = createPaneNode();
const paneRegistry = new Map();
let hoveredPaneId = null;
let toastTimer = null;

bootstrap();

function bootstrap() {
  if (!paneRoot) {
    console.error("Visualizer UI missing paneRoot container.");
    return;
  }
  renderLayout();
  updatePaneIdleState(!hasActiveStream());
  setStatus("Idle", "idle");

  if (chrome?.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: "VISUALIZER_READY" }).catch(() => {});
  }

  registerRuntimeListeners();
  bindControls();
  bindKeyboardShortcuts();
}

function registerRuntimeListeners() {
  if (!chrome?.runtime?.onMessage) return;
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg?.type) return undefined;

    if (msg.type === "START_STREAM") {
      startStream(msg.streamId)
        .then(() => sendResponse?.({ ok: true }))
        .catch((err) => {
          sendResponse?.({ ok: false, error: err?.message || "Failed to start" });
        });
      return true;
    }

    if (msg.type === "STOP_STREAM") {
      stopStream(msg.full);
      sendResponse?.({ ok: true });
      return undefined;
    }

    if (msg.type === "PING") {
      sendResponse?.({ ok: true });
      return undefined;
    }

    return undefined;
  });
}

function bindControls() {
  hookActiveBtn?.addEventListener("click", async () => {
    if (!chrome?.runtime?.sendMessage) return;
    hookActiveBtn.disabled = true;
    setStatus("Requesting…", "active");
    try {
      const res = await chrome.runtime.sendMessage({ type: "SWITCH_TO_ACTIVE_TAB" });
      if (!res?.ok) {
        throw new Error(res?.error || "Failed to hook active tab");
      }
      showToast("Capturing current tab…");
    } catch (err) {
      console.error("Hook active tab failed:", err);
      setStatus("Hook failed", "error");
      showToast(err?.message || "Unable to hook active tab", "error");
    } finally {
      hookActiveBtn.disabled = false;
    }
  });

  stopStreamBtn?.addEventListener("click", async () => {
    if (!chrome?.runtime?.sendMessage) return;
    stopStreamBtn.disabled = true;
    try {
      const res = await chrome.runtime.sendMessage({ type: "STOP_STREAM_ONLY" });
      if (!res?.ok) {
        throw new Error(res?.error || "Failed to stop audio");
      }
    } catch (err) {
      console.error("Stop stream failed:", err);
      showToast(err?.message || "Unable to stop stream", "error");
    } finally {
      setTimeout(() => {
        stopStreamBtn.disabled = false;
      }, 600);
    }
  });
}

function bindKeyboardShortcuts() {
  document.addEventListener("keydown", (event) => {
    if (event.key?.toLowerCase() === "m") {
      const targetPane = hoveredPaneId || Array.from(paneRegistry.keys())[0];
      if (!targetPane) return;
      const modeName = cycleMode(targetPane);
      updatePaneModeLabel(targetPane, modeName);
      showToast(`Mode → ${formatModeName(modeName)}`);
    }
  });
}

async function startStream(streamId) {
  try {
    await initFromStreamId(streamId);
    setStatus("Streaming", "active");
    updatePaneIdleState(false);
    showToast("Audio connected");
  } catch (err) {
    console.error("Visualizer failed to start stream:", err);
    setStatus("Error", "error");
    updatePaneIdleState(true);
    showToast(err?.message || "Failed to initialise audio", "error");
    throw err;
  }
}

function stopStream(full = true) {
  stopVisualizer(Boolean(full));
  setStatus("Idle", "idle");
  updatePaneIdleState(true);
  if (full) {
    showToast("Stream stopped");
  }
}

function renderLayout() {
  if (!paneRoot) return;
  const seen = new Set();
  const tree = renderNode(layoutRoot, seen);
  if (tree) {
    paneRoot.replaceChildren(tree);
  }
  cleanupPanes(seen);
  updateCloseButtons();
}

function renderNode(node, seen) {
  if (node.type === "pane") {
    seen.add(node.id);
    return ensurePane(node.id);
  }

  if (node.type === "split") {
    const container = document.createElement("div");
    container.className = node.orientation === "row" ? "pane-split-row" : "pane-split-column";
    for (const child of node.children) {
      container.appendChild(renderNode(child, seen));
    }
    return container;
  }

  return null;
}

function ensurePane(paneId) {
  let pane = paneRegistry.get(paneId);
  if (pane) return pane.element;

  const element = document.createElement("div");
  element.className = "visualizer-pane canvas-idle";
  element.dataset.paneId = paneId;

  const canvas = document.createElement("canvas");
  element.appendChild(canvas);

  const controls = document.createElement("div");
  controls.className = "pane-controls";

  const expandTop = createExpandButton("↑", paneId, "top");
  const expandBottom = createExpandButton("↓", paneId, "bottom");
  const expandLeft = createExpandButton("←", paneId, "left");
  const expandRight = createExpandButton("→", paneId, "right");

  controls.append(expandTop, expandBottom, expandLeft, expandRight);

  const toolbar = document.createElement("div");
  toolbar.className = "pane-toolbar";

  const modeButton = document.createElement("button");
  modeButton.dataset.action = "mode";
  toolbar.appendChild(modeButton);

  const closeButton = document.createElement("button");
  closeButton.dataset.action = "close";
  closeButton.textContent = "×";
  toolbar.appendChild(closeButton);

  controls.appendChild(toolbar);
  element.appendChild(controls);

  element.addEventListener("mouseenter", () => {
    setActivePane(paneId);
  });

  expandTop.addEventListener("click", () => expandPane(paneId, "top"));
  expandBottom.addEventListener("click", () => expandPane(paneId, "bottom"));
  expandLeft.addEventListener("click", () => expandPane(paneId, "left"));
  expandRight.addEventListener("click", () => expandPane(paneId, "right"));

  modeButton.addEventListener("click", () => {
    const modeName = cycleMode(paneId);
    updatePaneModeLabel(paneId, modeName);
    showToast(`Mode → ${formatModeName(modeName)}`);
  });

  closeButton.addEventListener("click", () => {
    removePane(paneId);
  });

  const ctx = registerCanvas(paneId, canvas);
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  });
  resizeObserver.observe(element);

  pane = {
    id: paneId,
    element,
    canvas,
    ctx,
    controls: { modeButton, closeButton },
    resizeObserver,
  };
  paneRegistry.set(paneId, pane);

  updatePaneModeLabel(paneId, getModeName(paneId));
  registerPane(paneId);
  return element;
}

function createExpandButton(label, paneId, direction) {
  const button = document.createElement("button");
  button.className = `pane-expand pane-expand-${direction}`;
  button.type = "button";
  button.textContent = label;
  button.title = `Add view to the ${direction}`;
  return button;
}

function setActivePane(paneId) {
  hoveredPaneId = paneId;
  for (const pane of paneRegistry.values()) {
    pane.element.classList.toggle("is-active", pane.id === paneId);
  }
}

function expandPane(paneId, direction) {
  const newPane = expandPaneInLayout(layoutRoot, paneId, direction);
  if (!newPane) return;
  renderLayout();
  requestAnimationFrame(() => {
    setActivePane(newPane.id);
    updatePaneIdleState(!hasActiveStream());
    showToast(`Added view ${arrowLabel(direction)}`);
  });
}

function removePane(paneId) {
  if (paneRegistry.size <= 1) {
    showToast("At least one view must remain", "error");
    return;
  }
  const removed = removePaneFromLayout(layoutRoot, paneId);
  if (!removed) return;
  renderLayout();
  const fallbackPane = Array.from(paneRegistry.keys())[0];
  setActivePane(fallbackPane || null);
  updatePaneIdleState(!hasActiveStream());
}

function cleanupPanes(seenIds) {
  for (const [paneId, pane] of paneRegistry.entries()) {
    if (seenIds.has(paneId)) continue;
    pane.resizeObserver.disconnect();
    unregisterCanvas(paneId);
    unregisterPane(paneId);
    paneRegistry.delete(paneId);
  }
}

function updatePaneModeLabel(paneId, modeName = getModeName(paneId)) {
  const pane = paneRegistry.get(paneId);
  if (!pane) return;
  pane.controls.modeButton.textContent = `Mode: ${formatModeName(modeName)}`;
}

function updatePaneIdleState(isIdle) {
  for (const pane of paneRegistry.values()) {
    pane.element.classList.toggle("canvas-idle", isIdle);
  }
}

function updateCloseButtons() {
  const disable = paneRegistry.size <= 1;
  for (const pane of paneRegistry.values()) {
    pane.controls.closeButton.disabled = disable;
  }
}

function setStatus(label, state) {
  if (!statusBadge) return;
  statusBadge.textContent = label;
  statusBadge.classList.remove("status-idle", "status-active", "status-error");
  statusBadge.classList.add(`status-${state}`);
}

function showToast(message, tone = "info") {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, tone === "error" ? 4200 : 2600);
}

function arrowLabel(direction) {
  switch (direction) {
    case "left":
      return "on the left";
    case "right":
      return "on the right";
    case "top":
      return "above";
    case "bottom":
      return "below";
    default:
      return "";
  }
}

function formatModeName(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function createPaneNode() {
  return { type: "pane", id: createPaneId() };
}

function createPaneId() {
  paneCounter += 1;
  return `pane-${paneCounter}`;
}

function expandPaneInLayout(node, paneId, direction) {
  const orientation = direction === "left" || direction === "right" ? "row" : "column";
  const insertBefore = direction === "left" || direction === "top";
  const path = findPanePath(node, paneId);
  if (!path) return null;

  const newPane = { type: "pane", id: createPaneId() };

  for (let i = path.length - 2; i >= 0; i--) {
    const ancestor = path[i].node;
    if (ancestor.type !== "split" || ancestor.orientation !== orientation) continue;
    const childIndex = path[i + 1].index;
    const insertIndex = insertBefore ? childIndex : childIndex + 1;
    ancestor.children.splice(insertIndex, 0, newPane);
    return newPane;
  }

  const targetEntry = path[path.length - 1];
  const targetNode = targetEntry.node;
  const replacement = {
    type: "split",
    orientation,
    children: insertBefore ? [newPane, targetNode] : [targetNode, newPane],
  };

  const parentEntry = path[path.length - 2];
  if (
    parentEntry?.node?.type === "split" &&
    typeof targetEntry.index === "number"
  ) {
    parentEntry.node.children[targetEntry.index] = replacement;
  } else {
    layoutRoot = replacement;
  }

  return newPane;
}

function removePaneFromLayout(node, paneId) {
  const path = findPanePath(node, paneId);
  if (!path || path.length === 0) return false;
  if (paneRegistry.size <= 1) return false;

  const targetEntry = path[path.length - 1];
  const parentEntry = path[path.length - 2];
  if (!parentEntry || parentEntry.node.type !== "split") return false;

  parentEntry.node.children.splice(targetEntry.index, 1);
  collapseSplits(path.slice(0, -1));
  return true;
}

function collapseSplits(path) {
  for (let i = path.length - 1; i >= 0; i--) {
    const entry = path[i];
    if (entry.node.type !== "split") continue;
    if (entry.node.children.length > 1) continue;
    const singleChild = entry.node.children[0];
    const parentEntry = path[i - 1];
    if (parentEntry && parentEntry.node.type === "split") {
      parentEntry.node.children[entry.index] = singleChild;
    } else {
      layoutRoot = singleChild;
    }
  }
}

function findPanePath(node, paneId, parent = null, index = null) {
  if (!node) return null;
  if (node.type === "pane") {
    if (node.id === paneId) {
      return [{ node, parent, index }];
    }
    return null;
  }
  if (node.type === "split") {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const result = findPanePath(child, paneId, node, i);
      if (result) {
        return [{ node, parent, index }, ...result];
      }
    }
  }
  return null;
}

window.visualizerUI = Object.freeze({
  setStatus,
  updatePaneIdleState,
  showToast,
});
