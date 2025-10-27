let audioCtx = null;
let source = null;
let baseGain = null;
let splitter = null;
let analyserL = null;
let analyserR = null;
let analyser = null;
let rafId = null;
let stream = null;
let currentmodeint = 0
const modes = ["spectrum", "xy", "spectogram", "pcm"];
const logger = Logger.createLogger("visualizer");
const canvas = document.getElementById("vis");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const size = {
  dpr: window.devicePixelRatio || 1,
  cssWidth: 0,
  cssHeight: 0,
};

let dprWatcher = null;

function resizeCanvas() {
  size.dpr = window.devicePixelRatio || 1;
  size.cssWidth = window.innerWidth;
  size.cssHeight = window.innerHeight;

  canvas.style.width = `${size.cssWidth}px`;
  canvas.style.height = `${size.cssHeight}px`;
  canvas.width = Math.round(size.cssWidth * size.dpr);
  canvas.height = Math.round(size.cssHeight * size.dpr);

  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
}

function handleDevicePixelRatioChange() {
  resizeCanvas();
  watchDevicePixelRatio();
}

function watchDevicePixelRatio() {
  if (typeof window.matchMedia !== "function") return;
  if (dprWatcher) {
    if (typeof dprWatcher.removeEventListener === "function") {
      dprWatcher.removeEventListener("change", handleDevicePixelRatioChange);
    } else if (typeof dprWatcher.removeListener === "function") {
      dprWatcher.removeListener(handleDevicePixelRatioChange);
    }
  }

  dprWatcher = window.matchMedia(`(resolution: ${size.dpr}dppx)`);
  if (typeof dprWatcher.addEventListener === "function") {
    dprWatcher.addEventListener("change", handleDevicePixelRatioChange);
  } else if (typeof dprWatcher.addListener === "function") {
    dprWatcher.addListener(handleDevicePixelRatioChange);
  }
}

function clearCanvas() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
watchDevicePixelRatio();
const params = new URLSearchParams(location.search);
const streamId = params.get("streamId");
if (streamId) initFromStreamId(streamId);

const resumeEvents = ["click", "keydown", "pointerdown", "touchstart"];
resumeEvents.forEach((eventName) => {
  window.addEventListener(eventName, () => {
    attemptResumeAudioContext();
  });
});

chrome.runtime?.onMessage.addListener(async (msg) => {
  if (msg.type === "START_STREAM") initFromStreamId(msg.streamId);
  if (msg.type === "STOP_STREAM") stopVisualizer(true);
});

// === TOGGLE ===
document.addEventListener("keydown", (e) => {
  if (e.key === "m") {
    currentmodeint = (currentmodeint + 1) % modes.length;
    logger.info("Mode switched", modes[currentmodeint]);
    switchMode();
  }
});

// === CAPTURE ===
async function initFromStreamId(id) {
  stopVisualizer(true);
  try {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: id,
        },
      },
    });
    stream = mediaStream;
    await startMode();
  } catch (err) {
    logger.error("Audio capture failed", err);
  }
}

// === CONTEXT LIFECYCLE ===
async function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  await attemptResumeAudioContext();
  return audioCtx;
}

function attemptResumeAudioContext() {
  if (!audioCtx || audioCtx.state !== "suspended") return Promise.resolve();
  return audioCtx.resume().catch((err) => {
    console.warn("Failed to resume audio context:", err);
  });
}

async function setupStreamChain() {
  if (!stream) return null;
  const context = await ensureAudioContext();
  if (!context) return null;

  if (source && source.mediaStream !== stream) {
    try {
      source.disconnect();
    } catch (err) {
      console.warn("Failed to disconnect previous source:", err);
    }
    source = null;
    baseGain = null;
  }

  if (!source) {
    source = context.createMediaStreamSource(stream);
  }

  if (!baseGain) {
    baseGain = context.createGain();
    baseGain.gain.value = 1.0;
    source.connect(baseGain);
    baseGain.connect(context.destination);
  }

  return context;
}

function clearModeNodes() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  if (source && analyser) {
    try {
      source.disconnect(analyser);
    } catch (err) {}
  }

  if (source && splitter) {
    try {
      source.disconnect(splitter);
    } catch (err) {}
  }

  if (splitter && analyserL) {
    try {
      splitter.disconnect(analyserL);
    } catch (err) {}
  }

  if (splitter && analyserR) {
    try {
      splitter.disconnect(analyserR);
    } catch (err) {}
  }

  if (analyser) {
    try {
      analyser.disconnect();
    } catch (err) {}
    analyser = null;
  }

  if (analyserL) {
    try {
      analyserL.disconnect();
    } catch (err) {}
    analyserL = null;
  }

  if (analyserR) {
    try {
      analyserR.disconnect();
    } catch (err) {}
    analyserR = null;
  }

  if (splitter) {
    try {
      splitter.disconnect();
    } catch (err) {}
    splitter = null;
  }

  canvas.onwheel = null;
  canvas.onmousedown = null;
  canvas.onmouseup = null;
  canvas.onmousemove = null;

  if (typeof ctx.resetTransform === "function") ctx.resetTransform();
  else ctx.setTransform(1, 0, 0, 1, 0, 0);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function teardownAudioContext() {
  if (source) {
    try {
      source.disconnect();
    } catch (err) {}
    source = null;
  }

  if (baseGain) {
    try {
      baseGain.disconnect();
    } catch (err) {}
    baseGain = null;
  }

  if (audioCtx) {
    const ctxToClose = audioCtx;
    audioCtx = null;
    ctxToClose.close().catch(() => {});
  }
}

// === MODE CONTROL ===
async function switchMode() {
  clearModeNodes();
  if (!stream) return;
  await startMode();
}

async function startMode() {
  const context = await setupStreamChain();
  if (!context || !source) return;

  if (modes[currentmodeint] === "spectrum") {
    analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    drawSpectrum();
  } else if (modes[currentmodeint] === "xy") {
    splitter = context.createChannelSplitter(2);
    analyserL = context.createAnalyser();
    analyserR = context.createAnalyser();
    analyserL.fftSize = analyserR.fftSize = 2048;
    source.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);
    drawXY();
  } else if (modes[currentmodeint] === "spectogram") {
    analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    drawspectograph();
  }
  else {
    analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    drawpcm();
  }
}

// === STOP ===
function stopVisualizer(full = false) {
  clearModeNodes();
  if (full && stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (full) {
    teardownAudioContext();
  }
  clearCanvas();
}
// === DRAW ===
function drawSpectrum() {
  const data = new Uint8Array(analyser.frequencyBinCount);

  const loop = () => {
    if (!analyser) return;

    const { cssWidth: w, cssHeight: h, dpr } = size;

    analyser.getByteFrequencyData(data);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const barCount = Math.max(1, Math.floor(data.length / 2));
    const barW = w / barCount;
    const gap = 1 / dpr;

    for (let i = 0; i < barCount; i++) {
      const value = data[i] / 255;
      const barH = value * h;
      ctx.fillStyle = `rgb(${Math.floor(value * 255)}, 60, 220)`;
      const x = i * barW;
      const width = Math.max(barW - gap, 0);
      ctx.fillRect(x, h - barH, width, barH);
    }

    rafId = requestAnimationFrame(loop);
  };
  loop();
}


function drawspectograph() {
  const data = new Uint8Array(analyser.frequencyBinCount);

  // clear once at start
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size.cssWidth, size.cssHeight);

  const loop = () => {
    if (!analyser) return;

    analyser.getByteFrequencyData(data);

    const { dpr } = size;
    const bufferWidth = canvas.width;
    const bufferHeight = canvas.height;
    const columnWidth = Math.max(1, Math.round(dpr));
    const rowHeight = Math.max(1, Math.ceil(bufferHeight / data.length));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (bufferWidth > columnWidth) {
      const frame = ctx.getImageData(columnWidth, 0, bufferWidth - columnWidth, bufferHeight);
      ctx.putImageData(frame, 0, 0);
    }

    // draw new column at right edge
    for (let i = 0; i < data.length; i++) {
      const value = data[i] / 255;
      const y = bufferHeight - Math.floor((i / data.length) * bufferHeight);
      const color = `hsl(${(1 - value) * 240}, 100%, ${value * 60 + 20}%)`;
      ctx.fillStyle = color;
      ctx.fillRect(bufferWidth - columnWidth, y, columnWidth, rowHeight);
    }

    ctx.restore();

    rafId = requestAnimationFrame(loop);
  };
  loop();
}


function drawXY() {
  const dataL = new Float32Array(analyserL.fftSize);
  const dataR = new Float32Array(analyserR.fftSize);

  let scale = 1;
  let offsetX = 0,
    offsetY = 0;
  let isDragging = false,
    lastX = 0,
    lastY = 0;

  function applyPanZoom() {
    const { dpr } = size;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offsetX * dpr, offsetY * dpr);
  }

  canvas.onwheel = (e) => {
    e.preventDefault();
    scale *= e.deltaY < 0 ? 1.1 : 0.9;
  };
  canvas.onmousedown = (e) => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  };
  canvas.onmouseup = () => (isDragging = false);
  canvas.onmousemove = (e) => {
    if (!isDragging) return;
    offsetX += e.clientX - lastX;
    offsetY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
  };

  const loop = () => {
    if (!analyserL || !analyserR) return;

    const { cssWidth: w, cssHeight: h, dpr } = size;

    analyserL.getFloatTimeDomainData(dataL);
    analyserR.getFloatTimeDomainData(dataR);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "rgba(0,0,0,0.99)";
    ctx.fillRect(0, 0, w, h);
    applyPanZoom();

    ctx.beginPath();
    const len = Math.min(dataL.length, dataR.length);
    let maxDist = 25;
    let prevdist = 25;
    let prevX = null;
    let prevY = null;

    for (let i = 0; i < len; i++) {
      const x = (dataL[i] * 0.5 + 0.5) * w;
      const y = h - (dataR[i] * 0.5 + 0.5) * h;

      if (prevX === null) {
        ctx.moveTo(x, y);
      } else {
        const dx = x - prevX;
        const dy = y - prevY;
        const dist = Math.hypot(dx, dy);
        maxDist = prevdist * 1.5;
        prevdist = dist;
        if (dist > maxDist) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      prevX = x;
      prevY = y;
    }

    ctx.strokeStyle = "#00ff66";
    ctx.lineWidth = 1.0 / scale;
    ctx.stroke();

    rafId = requestAnimationFrame(loop);
  };
  loop();
}

function drawpcm() {
  const data = new Float32Array(analyser.fftSize); // time-domain buffer

  const loop = () => {
    if (!analyser) return;

    const { cssWidth: w, cssHeight: h, dpr } = size;

    analyser.getFloatTimeDomainData(data);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    ctx.beginPath();

    const midY = h / 2;
    const step = w / data.length; // horizontal spacing per sample

    // first point
    ctx.moveTo(0, midY - data[0] * midY);

    // draw waveform
    for (let i = 1; i < data.length; i++) {
      const x = i * step;
      const y = midY - data[i] * midY; // +1 → top, -1 → bottom
      ctx.lineTo(x, y);
    }

    ctx.strokeStyle = "#00ffcc";
    ctx.lineWidth = 2;
    ctx.stroke();

    rafId = requestAnimationFrame(loop);
  };

  loop();
}
