import { initFromStreamId, stopVisualizer, hasActiveStream } from "./audio/capture.js";
import {
  registerPane,
  unregisterPane,
  cycleMode,
  getModeName,
  getViewState,
  updateViewState,
  resetViewState,
} from "./audio/modes.js";
import { registerCanvas, unregisterCanvas } from "./shared/canvas.js";

const paneRoot = document.getElementById("paneRoot");
const statusBadge = document.getElementById("statusBadge");
const hookActiveBtn = document.getElementById("hookActive");
const stopStreamBtn = document.getElementById("stopStream");
const addPaneBtn = document.getElementById("addPane");
const resetLayoutBtn = document.getElementById("resetLayout");
const resetViewsBtn = document.getElementById("resetViews");
const toastEl = document.getElementById("toast");

let paneCounter = 0;
let splitCounter = 0;
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

  addPaneBtn?.addEventListener("click", () => {
    const targetPane = hoveredPaneId || Array.from(paneRegistry.keys())[0];
    if (!targetPane) {
      showToast("No active view to expand", "error");
      return;
    }
    expandPane(targetPane, "right");
  });

  resetLayoutBtn?.addEventListener("click", () => {
    resetLayout();
  });

  resetViewsBtn?.addEventListener("click", () => {
    resetAllViewStates();
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
  refreshAllPaneViewLabels();
  if (hoveredPaneId && paneRegistry.has(hoveredPaneId)) {
    requestAnimationFrame(() => {
      setActivePane(hoveredPaneId);
    });
  }
}

function renderNode(node, seen) {
  if (node.type === "pane") {
    seen.add(node.id);
    return ensurePane(node.id);
  }

  if (node.type === "split") {
    return renderSplit(node, seen);
  }

  return null;
}

function renderSplit(node, seen) {
  normaliseSplitSizes(node);
  const isRow = node.orientation === "row";
  const container = document.createElement("div");
  container.className = isRow ? "pane-split-row" : "pane-split-column";
  container.dataset.splitId = node.id;

  const childWrappers = [];
  node.children.forEach((child, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "pane-split-slot";
    const size = node.sizes?.[index] ?? (1 / node.children.length);
    wrapper.style.flexBasis = `${Math.max(size, 0) * 100}%`;
    wrapper.style.flexGrow = `${Math.max(size, 0)}`;
    const renderedChild = renderNode(child, seen);
    if (renderedChild) {
      wrapper.appendChild(renderedChild);
    }
    childWrappers.push(wrapper);
  });

  childWrappers.forEach((wrapper, index) => {
    container.appendChild(wrapper);
    if (index < childWrappers.length - 1) {
      const handle = createResizeHandle(node, index, isRow, wrapper, childWrappers[index + 1]);
      container.appendChild(handle);
    }
  });

  return container;
}

function createResizeHandle(split, index, isRow, beforeWrapper, afterWrapper) {
  const handle = document.createElement("div");
  handle.className = `pane-resizer ${isRow ? "pane-resizer-vertical" : "pane-resizer-horizontal"}`;
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", isRow ? "vertical" : "horizontal");
  handle.tabIndex = 0;

  const onPointerDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!split?.sizes?.length) return;

    const container = handle.parentElement;
    const rect = container?.getBoundingClientRect();
    const totalSize = rect ? (isRow ? rect.width : rect.height) : 0;
    const beforeSize = split.sizes[index];
    const afterSize = split.sizes[index + 1];
    const pairTotal = beforeSize + afterSize;
    const minSize = Math.max(0.02, Math.min(pairTotal * 0.2, 0.1));
    let currentBefore = beforeSize;
    let currentAfter = afterSize;
    const startCoord = isRow ? event.clientX : event.clientY;

    const applyStyles = () => {
      const beforeValue = Math.max(currentBefore, 0);
      const afterValue = Math.max(currentAfter, 0);
      beforeWrapper.style.flexBasis = `${beforeValue * 100}%`;
      beforeWrapper.style.flexGrow = `${beforeValue}`;
      afterWrapper.style.flexBasis = `${afterValue * 100}%`;
      afterWrapper.style.flexGrow = `${afterValue}`;
    };

    applyStyles();
    handle.classList.add("is-active");
    document.body.dataset.resizeOrientation = isRow ? "col" : "row";
    handle.setPointerCapture(event.pointerId);

    const onPointerMove = (moveEvent) => {
      const currentCoord = isRow ? moveEvent.clientX : moveEvent.clientY;
      const deltaPx = currentCoord - startCoord;
      const deltaRatio = totalSize === 0 ? 0 : deltaPx / totalSize;
      let newBefore = beforeSize + deltaRatio;
      newBefore = Math.max(minSize, Math.min(pairTotal - minSize, newBefore));
      const newAfter = pairTotal - newBefore;
      currentBefore = newBefore;
      currentAfter = newAfter;
      applyStyles();
    };

    const onPointerUp = () => {
      handle.releasePointerCapture(event.pointerId);
      handle.classList.remove("is-active");
      delete document.body.dataset.resizeOrientation;
      split.sizes[index] = currentBefore;
      split.sizes[index + 1] = currentAfter;
      normaliseSplitSizes(split);
      renderLayout();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerUp, { once: true });
  };

  handle.addEventListener("pointerdown", onPointerDown);
  return handle;
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

  const controlDock = document.createElement("div");
  controlDock.className = "pane-control-dock";

  const createControlButton = (label, title, command, extraClass = "") => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `pane-control-button${extraClass ? " " + extraClass : ""}`;
    button.textContent = label;
    if (title) button.title = title;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setActivePane(paneId);
      handlePaneCommand(paneId, command);
    });
    return button;
  };

  const zoomGroup = document.createElement("div");
  zoomGroup.className = "pane-control-group zoom-controls";
  const zoomInBtn = createControlButton("＋", "Zoom in", { type: "zoom", delta: 1 });
  const zoomOutBtn = createControlButton("－", "Zoom out", { type: "zoom", delta: -1 });
  const resetViewBtn = createControlButton("⟲", "Reset view", { type: "reset-view" });
  zoomGroup.append(zoomInBtn, resetViewBtn, zoomOutBtn);

  const panGroup = document.createElement("div");
  panGroup.className = "pane-control-group pan-controls";
  const panUpBtn = createControlButton("↑", "Pan up", { type: "pan", axis: "y", delta: -1 });
  const panLeftBtn = createControlButton("←", "Pan left", { type: "pan", axis: "x", delta: -1 });
  const panCenterBtn = createControlButton("•", "Center view", { type: "pan", axis: "center" });
  const panRightBtn = createControlButton("→", "Pan right", { type: "pan", axis: "x", delta: 1 });
  const panDownBtn = createControlButton("↓", "Pan down", { type: "pan", axis: "y", delta: 1 });
  panGroup.append(panUpBtn, panLeftBtn, panCenterBtn, panRightBtn, panDownBtn);

  const xyGroup = document.createElement("div");
  xyGroup.className = "pane-control-group xy-controls";
  xyGroup.setAttribute("aria-hidden", "true");

  const createXyRow = (label, key, step) => {
    const row = document.createElement("div");
    row.className = "pane-control-row";
    row.dataset.xyControl = key;
    const decBtn = createControlButton("−", `Decrease ${label}`, { type: "xy", control: key, delta: -step });
    const chip = document.createElement("span");
    chip.className = "pane-control-chip";
    chip.textContent = label;
    const incBtn = createControlButton("＋", `Increase ${label}`, { type: "xy", control: key, delta: step });
    row.append(decBtn, chip, incBtn);
    return { row, chip, incBtn, decBtn };
  };

  const xyRows = {
    scale: createXyRow("Scale", "scale", 1),
    persistence: createXyRow("Trail", "persistence", 0.1),
    intensity: createXyRow("Glow", "intensity", 0.1),
    blanking: createXyRow("Blank", "blanking", 0.05),
    smoothing: createXyRow("Smooth", "smoothing", 0.05),
  };

  xyGroup.append(
    xyRows.scale.row,
    xyRows.persistence.row,
    xyRows.intensity.row,
    xyRows.blanking.row,
    xyRows.smoothing.row
  );

  const xyResetBtn = createControlButton("Reset XY", "Reset XY tuning", { type: "xy", control: "reset" }, "pane-control-button--wide");
  xyGroup.append(xyResetBtn);

  controlDock.append(zoomGroup, panGroup, xyGroup);
  controls.appendChild(controlDock);

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
    controls: {
      modeButton,
      closeButton,
      dock: controlDock,
      viewButtons: {
        zoomIn: zoomInBtn,
        zoomOut: zoomOutBtn,
        resetView: resetViewBtn,
        panUp: panUpBtn,
        panDown: panDownBtn,
        panLeft: panLeftBtn,
        panRight: panRightBtn,
        panCenter: panCenterBtn,
      },
      xyGroup,
      xyReset: xyResetBtn,
      xyRows,
    },
    resizeObserver,
  };
  paneRegistry.set(paneId, pane);

  updatePaneModeLabel(paneId, getModeName(paneId));
  registerPane(paneId);
  refreshPaneViewLabels(paneId);
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

function resetLayout() {
  layoutRoot = createPaneNode();
  renderLayout();
  requestAnimationFrame(() => {
    const firstPane = Array.from(paneRegistry.keys())[0] ?? null;
    setActivePane(firstPane);
    updatePaneIdleState(!hasActiveStream());
  });
  showToast("Layout reset");
}

function resetAllViewStates() {
  for (const paneId of paneRegistry.keys()) {
    resetViewState(paneId);
    refreshPaneViewLabels(paneId);
  }
  showToast("View transforms reset");
}

function updatePaneModeLabel(paneId, modeName = getModeName(paneId)) {
  const pane = paneRegistry.get(paneId);
  if (!pane) return;
  pane.controls.modeButton.textContent = `Mode: ${formatModeName(modeName)}`;
  updatePaneControlVisibility(paneId, modeName);
  refreshPaneViewLabels(paneId);
}

function updatePaneControlVisibility(paneId, modeName = getModeName(paneId)) {
  const pane = paneRegistry.get(paneId);
  if (!pane) return;
  const isXY = modeName === "xy";
  if (pane.controls.xyGroup) {
    pane.controls.xyGroup.classList.toggle("is-visible", isXY);
    pane.controls.xyGroup.setAttribute("aria-hidden", String(!isXY));
  }
  if (pane.controls.viewButtons) {
    const {
      zoomIn,
      zoomOut,
      panUp,
      panDown,
      panLeft,
      panRight,
      panCenter,
      resetView,
    } = pane.controls.viewButtons;
    const disableDirectional = isXY;
    [zoomIn, zoomOut, panUp, panDown, panLeft, panRight, panCenter].forEach((btn) => {
      if (btn) btn.disabled = disableDirectional;
    });
    if (resetView) resetView.disabled = false;
  }
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

function handlePaneCommand(paneId, command) {
  if (!paneRegistry.has(paneId) || !command) return;
  const modeName = getModeName(paneId);

  if (command.type === "zoom") {
    adjustPaneZoom(paneId, modeName, command.delta ?? 0);
    return;
  }

  if (command.type === "pan") {
    adjustPanePan(paneId, modeName, command.axis, command.delta ?? 0);
    return;
  }

  if (command.type === "reset-view") {
    resetViewState(paneId, modeName);
    refreshPaneViewLabels(paneId);
    showToast("View reset");
    return;
  }

  if (command.type === "xy") {
    handleXyCommand(paneId, command);
  }
}

function adjustPaneZoom(paneId, modeName, delta) {
  if (!delta) return;
  const factor = delta > 0 ? 1.25 : 1 / 1.25;
  updateViewState(paneId, modeName, (view) => {
    if ("zoomX" in view) {
      view.zoomX *= factor;
    }
    if ("zoomY" in view) {
      const verticalFactor = Math.sqrt(factor);
      view.zoomY *= verticalFactor;
    }
  });
  refreshPaneViewLabels(paneId);
}

function adjustPanePan(paneId, modeName, axis, delta) {
  if (!axis) return;
  const step = 0.08 * delta;
  updateViewState(paneId, modeName, (view) => {
    if (axis === "center") {
      if ("offsetX" in view) view.offsetX = 0;
      if ("offsetY" in view) view.offsetY = 0;
      return;
    }
    if (axis === "x" && "offsetX" in view) {
      view.offsetX += step;
    }
    if (axis === "y" && "offsetY" in view) {
      view.offsetY += step;
    }
  });
  refreshPaneViewLabels(paneId);
}

function handleXyCommand(paneId, command) {
  if (!command.control) return;
  if (command.control === "reset") {
    resetViewState(paneId, "xy");
    refreshPaneViewLabels(paneId);
    showToast("XY tuning reset");
    return;
  }

  const delta = command.delta ?? 0;
  updateViewState(paneId, "xy", (view) => {
    switch (command.control) {
      case "scale": {
        const factor = delta >= 0 ? 1.18 : 1 / 1.18;
        view.scale *= factor;
        break;
      }
      case "persistence": {
        view.persistence += 0.05 * delta;
        break;
      }
      case "intensity": {
        view.intensity += 0.12 * delta;
        break;
      }
      case "blanking": {
        view.blanking += 0.05 * delta;
        break;
      }
      case "smoothing": {
        view.smoothing += 0.05 * delta;
        break;
      }
      default:
        break;
    }
  });
  refreshPaneViewLabels(paneId);
}

function refreshPaneViewLabels(paneId) {
  const pane = paneRegistry.get(paneId);
  const view = getViewState(paneId);
  if (!pane || !view) return;

  const xy = view.xy;
  if (xy && pane.controls?.xyRows) {
    const descriptors = {
      scale: `Scale ×${xy.scale.toFixed(2)}`,
      persistence: `Trail ${Math.round(xy.persistence * 100)}%`,
      intensity: `Glow ${xy.intensity.toFixed(2)}`,
      blanking: `Blank ${Math.round(xy.blanking * 100)}%`,
      smoothing: `Smooth ${Math.round(xy.smoothing * 100)}%`,
    };
    for (const [key, row] of Object.entries(pane.controls.xyRows)) {
      if (!row?.chip) continue;
      row.chip.textContent = descriptors[key] ?? row.chip.textContent;
    }
  }
}

function refreshAllPaneViewLabels() {
  for (const paneId of paneRegistry.keys()) {
    refreshPaneViewLabels(paneId);
  }
}

function createPaneNode() {
  return { type: "pane", id: createPaneId() };
}

function createPaneId() {
  paneCounter += 1;
  return `pane-${paneCounter}`;
}

function createSplitId() {
  splitCounter += 1;
  return `split-${splitCounter}`;
}

function createSplitNode(orientation, children, sizes) {
  const normalised = normaliseSizes(
    Array.isArray(sizes) && sizes.length === children.length
      ? sizes
      : new Array(children.length).fill(1 / children.length)
  );
  return {
    type: "split",
    id: createSplitId(),
    orientation,
    children,
    sizes: normalised,
  };
}

function normaliseSizes(values, fallbackCount = values?.length ?? 0) {
  const length = fallbackCount || 1;
  const source = Array.isArray(values) && values.length === length
    ? values.slice()
    : new Array(length).fill(1 / length);
  const total = source.reduce((sum, value) => {
    const numeric = Number.isFinite(value) ? value : 0;
    return sum + Math.max(0, numeric);
  }, 0);
  if (!total) {
    const even = 1 / source.length;
    return source.map(() => even);
  }
  return source.map((value) => Math.max(0, value) / total);
}

function normaliseSplitSizes(split) {
  if (!split) return;
  split.sizes = normaliseSizes(split.sizes, split.children.length);
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
    if (!Array.isArray(ancestor.sizes) || ancestor.sizes.length !== ancestor.children.length) {
      ancestor.sizes = normaliseSizes(new Array(ancestor.children.length).fill(1 / ancestor.children.length));
    }
    const baseSize = ancestor.sizes?.[childIndex] ?? (1 / ancestor.children.length);
    const newSize = baseSize / 2;
    const remainingSize = Math.max(baseSize - newSize, 0);
    if (insertBefore) {
      ancestor.children.splice(childIndex, 0, newPane);
      ancestor.sizes.splice(childIndex, 0, newSize);
      ancestor.sizes[childIndex + 1] = remainingSize;
    } else {
      ancestor.children.splice(childIndex + 1, 0, newPane);
      ancestor.sizes.splice(childIndex + 1, 0, newSize);
      ancestor.sizes[childIndex] = remainingSize;
    }
    normaliseSplitSizes(ancestor);
    return newPane;
  }

  const targetEntry = path[path.length - 1];
  const targetNode = targetEntry.node;
  const replacement = createSplitNode(
    orientation,
    insertBefore ? [newPane, targetNode] : [targetNode, newPane]
  );

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
  parentEntry.node.sizes.splice(targetEntry.index, 1);
  normaliseSplitSizes(parentEntry.node);
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
