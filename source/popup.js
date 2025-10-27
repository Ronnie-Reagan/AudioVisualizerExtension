const start = document.getElementById('start');
const stop = document.getElementById('stop');
const status = document.getElementById('status');

let isCapturing = false;

const applyState = () => {
  start.disabled = isCapturing;
  stop.disabled = !isCapturing;
};

const showTimeoutWarning = (action = 'Request') => {
  status.textContent = `Warning: ${action} timed out. Please try again.`;
};

const disableForPending = () => {
  start.disabled = true;
  stop.disabled = true;
};

applyState();

start.onclick = () => {
  status.textContent = 'Starting...';
  disableForPending();

  chrome.runtime.sendMessage({ type: "START_CAPTURE" }, res => {
    const runtimeError = chrome.runtime.lastError;
    if (runtimeError) {
      status.textContent = `Error: ${runtimeError.message}`;
      isCapturing = false;
      applyState();
      return;
    }

    if (!res) {
      showTimeoutWarning('Start request');
      isCapturing = false;
      applyState();
      return;
    }

    if (!res.ok) {
      status.textContent = 'Error: ' + (res.error || 'unknown');
      isCapturing = false;
      applyState();
      return;
    }

    status.textContent = 'Visualizer running';
    isCapturing = true;
    applyState();
  });
};

stop.onclick = () => {
  status.textContent = 'Stopping...';
  disableForPending();

  chrome.runtime.sendMessage({ type: "STOP_CAPTURE" }, res => {
    const runtimeError = chrome.runtime.lastError;
    if (runtimeError) {
      status.textContent = `Error: ${runtimeError.message}`;
      isCapturing = true;
      applyState();
      return;
    }

    if (!res) {
      showTimeoutWarning('Stop request');
      isCapturing = true;
      applyState();
      return;
    }

    if (!res.ok) {
      status.textContent = 'Error: ' + (res.error || 'unknown');
      isCapturing = true;
      applyState();
      return;
    }

    status.textContent = 'Stopped';
    isCapturing = false;
    applyState();
  });
};
