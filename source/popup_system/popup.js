const start = document.getElementById('start');
const openPopup = document.getElementById('openPopup');
const switchBtn = document.getElementById('switch');
const stopBtn = document.getElementById('stop');
const status = document.getElementById('status');

function updateStatus(message, isError = false) {
  status.textContent = message;
  status.style.color = isError ? '#ff7a7a' : '#dbe9ff';
}

openPopup.onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      updateStatus("Side panel opened");
    } else {
      updateStatus("No active tab found", true);
    }
  } catch (e) {
    console.error("Failed to open side panel:", e);
    updateStatus(`Error: ${e.message}`, true);
  }
};

start.onclick = () => {
  updateStatus('Starting…');
  chrome.runtime.sendMessage({ type: "START_CAPTURE" }, (res) => {
    if (!res || !res.ok) {
      updateStatus(`Error: ${res?.error || 'unknown'}`, true);
    } else {
      updateStatus('Visualizer running');
    }
  });
};

switchBtn.onclick = () => {
  updateStatus('Switching to current tab…');
  chrome.runtime.sendMessage({ type: "SWITCH_TO_ACTIVE_TAB" }, (res) => {
    if (!res || !res.ok) {
      updateStatus(`Switch failed: ${res?.error || 'unknown'}`, true);
    } else {
      updateStatus('Hooked to current tab');
    }
  });
};

stopBtn.onclick = () => {
  updateStatus('Stopping audio…');
  chrome.runtime.sendMessage({ type: "STOP_STREAM_ONLY" }, (res) => {
    if (!res || !res.ok) {
      updateStatus(`Stop failed: ${res?.error || 'unknown'}`, true);
    } else {
      updateStatus('Stream stopped');
    }
  });
};
