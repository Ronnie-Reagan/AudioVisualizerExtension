const start = document.getElementById('start');
const stop = document.getElementById('stop');
const status = document.getElementById('status');
const debugToggle = document.getElementById('debug-toggle');
const logger = Logger.createLogger('popup');

const DEBUG_KEY = Logger.DEBUG_STORAGE_KEY;

if (debugToggle && chrome?.storage?.local) {
  chrome.storage.local.get({ [DEBUG_KEY]: Logger.isDebugEnabled() }, result => {
    debugToggle.checked = Boolean(result[DEBUG_KEY]);
  });

  debugToggle.addEventListener('change', () => {
    const enabled = debugToggle.checked;
    Logger.setDebug(enabled, { persist: true });
    logger.info('Verbose logging toggled', enabled);
  });

  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area === 'local' && Object.prototype.hasOwnProperty.call(changes, DEBUG_KEY)) {
      debugToggle.checked = Boolean(changes[DEBUG_KEY].newValue);
    }
  });
}

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
  logger.info('Start capture requested');
  chrome.runtime.sendMessage({ type: "START_CAPTURE" }, res => {
    if (!res || !res.ok) {
      status.textContent = 'Error: ' + (res?.error || 'unknown');
      logger.warn('Start capture failed', res?.error || 'unknown');
    } else {
      status.textContent = 'Visualizer running';
      logger.info('Visualizer running');

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
  logger.info('Stop capture requested');
  chrome.runtime.sendMessage({ type: "STOP_CAPTURE" });
  status.textContent = 'Stopped';
};
