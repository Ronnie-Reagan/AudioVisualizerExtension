let audioCtx = null;
let source = null;
let splitter = null;
let analyserL = null;
let analyserR = null;
let analyser = null;
let rafId = null;
let stream = null;
let currentmodeint = 0
const modes = ["spectrum", "xy", "spectogram", "pcm"];
const canvas = document.getElementById("vis");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const params = new URLSearchParams(location.search);
const streamId = params.get("streamId");
if (streamId) initFromStreamId(streamId);

chrome.runtime?.onMessage.addListener(async (msg) => {
  if (msg.type === "START_STREAM") initFromStreamId(msg.streamId);
  if (msg.type === "STOP_STREAM") stopVisualizer(true);
});

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

// === TOGGLE ===
document.addEventListener("keydown", (e) => {
  if (e.key === "m") {
    currentmodeint = (currentmodeint + 1) % modes.length;
    console.log("Mode switched to:", modes[currentmodeint]);
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
    setupAudioContext();
    startMode();
  } catch (err) {
    console.error("Audio capture failed:", err);
  }
}

// === SETUP CHAIN ===
function setupAudioContext() {
  if (audioCtx) audioCtx.close().catch(() => {});
  audioCtx = new AudioContext();
  source = audioCtx.createMediaStreamSource(stream);

  const gain = audioCtx.createGain();
  gain.gain.value = 1.0;
  source.connect(gain);
  gain.connect(audioCtx.destination);
}

// === MODE CONTROL ===
function switchMode() {
  cancelAnimationFrame(rafId);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!stream) return;
  setupAudioContext();
  startMode();
}

function startMode() {
  if (modes[currentmodeint] === "spectrum") {
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    drawSpectrum();
  } else if (modes[currentmodeint] === "xy") {
    splitter = audioCtx.createChannelSplitter(2);
    analyserL = audioCtx.createAnalyser();
    analyserR = audioCtx.createAnalyser();
    analyserL.fftSize = analyserR.fftSize = 2048;
    source.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);
    drawXY();
  } else if (modes[currentmodeint] === "spectogram") {
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    drawspectograph();
  }
  else {
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    drawpcm();
  }
}

// === STOP ===
function stopVisualizer(full = false) {
  cancelAnimationFrame(rafId);
  if (full && stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}
// === DRAW ===
function drawSpectrum() {
  const data = new Uint8Array(analyser.frequencyBinCount);

  const loop = () => {
    if (!analyser) return;

    const w = canvas.width;
    const h = canvas.height;

    analyser.getByteFrequencyData(data);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const barCount = Math.floor(data.length / 2);
    const barW = w / barCount;

    for (let i = 0; i < barCount; i++) {
      const value = data[i] / 255;
      const barH = value * h;
      ctx.fillStyle = `rgb(${Math.floor(value * 255)}, 60, 220)`;
      ctx.fillRect(i * barW, h - barH, barW - 1, barH);
    }

    rafId = requestAnimationFrame(loop);
  };
  loop();
}


function drawspectograph() {
  const data = new Uint8Array(analyser.frequencyBinCount);

  // clear once at start
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const loop = () => {
    if (!analyser) return;

    const w = canvas.width;
    const h = canvas.height;

    analyser.getByteFrequencyData(data);

    // shift old image left by 1 pixel
    const frame = ctx.getImageData(1, 0, w - 1, h);
    ctx.putImageData(frame, 0, 0);

    // draw new column at right edge
    for (let i = 0; i < data.length; i++) {
      const value = data[i] / 255;
      const y = h - Math.floor((i / data.length) * h);
      const color = `hsl(${(1 - value) * 240}, 100%, ${value * 60 + 20}%)`;
      ctx.fillStyle = color;
      ctx.fillRect(w - 1, y, 1, h / data.length + 1);
    }

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
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
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

    const w = canvas.width;
    const h = canvas.height;

    analyserL.getFloatTimeDomainData(dataL);
    analyserR.getFloatTimeDomainData(dataR);

    ctx.resetTransform();
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

    const w = canvas.width;
    const h = canvas.height;

    analyser.getFloatTimeDomainData(data);

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
