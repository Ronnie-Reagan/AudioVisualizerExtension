const start = document.getElementById('start');
const openPopup = document.getElementById('openPopup');
const status = document.getElementById('status');

openPopup.onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      status.textContent = "Side panel opened";
    } else {
      status.textContent = "No active tab found";
    }
  } catch (e) {
    console.error("Failed to open side panel:", e);
    status.textContent = "Error: " + e.message;
  }
};

start.onclick = () => {
  status.textContent = 'Starting...';
  chrome.runtime.sendMessage({ type: "START_CAPTURE" }, res => {
    if (!res || !res.ok) {
      status.textContent = 'Error: ' + (res?.error || 'unknown');
    } else {
      status.textContent = 'Visualizer running';
    }
  });
};
