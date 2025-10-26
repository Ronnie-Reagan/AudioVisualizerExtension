const start = document.getElementById('start');
const stop = document.getElementById('stop');
const status = document.getElementById('status');

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

stop.onclick = () => {
  chrome.runtime.sendMessage({ type: "STOP_CAPTURE" });
  status.textContent = 'Stopped';
};
