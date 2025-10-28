const start = document.getElementById('start');
const openPopup = document.getElementById('openPopup');
const switchBtn = document.getElementById('switch');
const stopBtn = document.getElementById('stop');
const status = document.getElementById('status');
const badge = document.getElementById('popupBadge');
const conflictPrompt = document.getElementById('conflictPrompt');
const promptMessage = document.getElementById('promptMessage');
const promptConfirm = document.getElementById('promptConfirm');
const promptCancel = document.getElementById('promptCancel');

function updateStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('status--error', Boolean(isError));
  if (isError) {
    setBadge('Attention', 'alert');
  }
}

openPopup.onclick = async () => {
  try {
    if (!chrome?.sidePanel?.open) {
      setBadge('Ready', 'idle');
      updateStatus("Side panel is not supported in this Chrome build.", true);
      return;
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      setBadge('Side Panel', 'busy');
      updateStatus("Side panel opened");
    } else {
      setBadge('Ready', 'idle');
      updateStatus("No active tab found", true);
    }
  } catch (e) {
    console.error("Failed to open side panel:", e);
    updateStatus(`Error: ${e.message}`, true);
  }
};

start.onclick = async () => {
  setBadge('Working', 'busy');
  updateStatus('Starting…');
  start.disabled = true;
  try {
    const readiness = await ensureStandaloneReady('open-window');
    if (!readiness.proceed) {
      if (readiness.reason === 'cancel') {
        setBadge('Ready', 'idle');
        updateStatus('Side panel left open.', false);
      }
      return;
    }
    const res = await chrome.runtime.sendMessage({ type: "START_CAPTURE" });
    if (!res || !res.ok) {
      updateStatus(`Error: ${res?.error || 'unknown'}`, true);
    } else {
      setBadge('Streaming', 'busy');
      updateStatus('Visualizer running');
    }
  } catch (err) {
    console.error('Failed to start visualizer window:', err);
    updateStatus(`Error: ${err?.message || 'unknown'}`, true);
  } finally {
    start.disabled = false;
  }
};

switchBtn.onclick = async () => {
  setBadge('Working', 'busy');
  updateStatus('Switching to current tab…');
  switchBtn.disabled = true;
  try {
    const readiness = await ensureStandaloneReady('switch-tab');
    if (!readiness.proceed) {
      if (readiness.reason === 'cancel') {
        setBadge('Ready', 'idle');
        updateStatus('Side panel left open.', false);
      }
      return;
    }
    const res = await chrome.runtime.sendMessage({ type: "SWITCH_TO_ACTIVE_TAB" });
    if (!res || !res.ok) {
      updateStatus(`Switch failed: ${res?.error || 'unknown'}`, true);
    } else {
      setBadge('Streaming', 'busy');
      updateStatus('Hooked to current tab');
    }
  } catch (err) {
    console.error('Failed to switch capture:', err);
    updateStatus(`Switch failed: ${err?.message || 'unknown'}`, true);
  } finally {
    switchBtn.disabled = false;
  }
};

stopBtn.onclick = () => {
  setBadge('Ready', 'idle');
  updateStatus('Stopping audio…');
  chrome.runtime.sendMessage({ type: "STOP_STREAM_ONLY" }, (res) => {
    if (!res || !res.ok) {
      updateStatus(`Stop failed: ${res?.error || 'unknown'}`, true);
    } else {
      updateStatus('Stream stopped');
    }
  });
};

async function getRuntimeState() {
  const response = await chrome.runtime.sendMessage({ type: "GET_RUNTIME_STATE" });
  if (!response || response.ok === false) {
    throw new Error(response?.error || "Unable to query extension state.");
  }
  return response;
}

async function ensureStandaloneReady(contextReason) {
  try {
    const state = await getRuntimeState();
    if (!state.sidePanelOpen) {
      return { proceed: true };
    }
    if (promptMessage) {
      promptMessage.textContent =
        contextReason === 'switch-tab'
          ? "The visualizer is already open in the side panel. Close it to hook the standalone window to this tab?"
          : "The visualizer is already open in the side panel. Close it before launching the standalone window?";
    }
    const shouldClose = await promptForSidePanelClose();
    if (!shouldClose) {
      return { proceed: false, reason: 'cancel' };
    }
    const disableRes = await chrome.runtime.sendMessage({
      type: "REQUEST_CLOSE_SIDE_PANEL",
      reason: contextReason,
    });
    if (!disableRes || disableRes.ok === false) {
      throw new Error(disableRes?.error || "Unable to close side panel.");
    }
    if (!disableRes.closed) {
      throw new Error("Side panel is still open. Close it manually and try again.");
    }
    return { proceed: true };
  } catch (err) {
    updateStatus(err?.message || "Unable to prepare standalone window.", true);
    return { proceed: false, reason: 'error' };
  }
}

function promptForSidePanelClose() {
  if (conflictPrompt && promptConfirm && promptCancel) {
    conflictPrompt.hidden = false;
    return new Promise((resolve) => {
      const closePrompt = (result) => {
        conflictPrompt.hidden = true;
        promptConfirm.removeEventListener('click', onConfirm);
        promptCancel.removeEventListener('click', onCancel);
        conflictPrompt.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKey);
        resolve(result);
      };
      const onConfirm = () => closePrompt(true);
      const onCancel = () => closePrompt(false);
      const onBackdrop = (event) => {
        if (event.target === conflictPrompt) {
          closePrompt(false);
        }
      };
      const onKey = (event) => {
        if (event.key === 'Escape') {
          closePrompt(false);
        }
      };
      promptConfirm.addEventListener('click', onConfirm, { once: true });
      promptCancel.addEventListener('click', onCancel, { once: true });
      conflictPrompt.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKey);
    });
  }
  if (typeof window.confirm === "function") {
    return Promise.resolve(
      window.confirm("The visualizer side panel is currently open. Close it before opening the standalone window?")
    );
  }
  return Promise.resolve(false);
}

function setBadge(label, tone = 'idle') {
  if (!badge) return;
  badge.textContent = label;
  badge.classList.remove('badge--idle', 'badge--busy', 'badge--alert');
  switch (tone) {
    case 'busy':
      badge.classList.add('badge--busy');
      break;
    case 'alert':
      badge.classList.add('badge--alert');
      break;
    default:
      badge.classList.add('badge--idle');
      break;
  }
}
