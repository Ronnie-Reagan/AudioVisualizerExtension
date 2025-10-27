let audioCtx = null;
let source = null;
let rafId = null;
let stream = null;
let currentmodeint = 0;
let activeModeKey = null;
let activeModeState = null;

/**
 * Registry describing how each visualization mode integrates with the core loop.
 *
 * Every entry should follow the interface:
 * {
 *   setup(env): state | void,
 *   draw(env, state): void,
 *   cleanup?(env, state): void,
 * }
 *
 * Where `env` provides commonly used handles `{ audioCtx, source, canvas, ctx }`.
 * Use `setup` to allocate audio nodes, data buffers, or DOM listeners and return
 * whatever state `draw` and `cleanup` will need. `draw` is responsible for
 * kicking off its own `requestAnimationFrame` loop and assigning `rafId`. The
 * optional `cleanup` should release nodes, listeners, and other side effects.
 */
const MODE_REGISTRY = {
  spectrum: {
    setup({ audioCtx, source }) {
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      return {
        analyser,
        data: new Uint8Array(analyser.frequencyBinCount),
      };
    },
    draw({ canvas, ctx }, state) {
      const loop = () => {
        const { analyser, data } = state;
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
    },
    cleanup(_env, state) {
      state.analyser?.disconnect();
    },
  },
  xy: {
    setup({ audioCtx, source, canvas }) {
      const splitter = audioCtx.createChannelSplitter(2);
      const analyserL = audioCtx.createAnalyser();
      const analyserR = audioCtx.createAnalyser();
      analyserL.fftSize = analyserR.fftSize = 2048;
      source.connect(splitter);
      splitter.connect(analyserL, 0);
      splitter.connect(analyserR, 1);

      const state = {
        splitter,
        analyserL,
        analyserR,
        dataL: new Float32Array(analyserL.fftSize),
        dataR: new Float32Array(analyserR.fftSize),
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        isDragging: false,
        lastX: 0,
        lastY: 0,
      };

      state.handleWheel = (e) => {
        e.preventDefault();
        state.scale *= e.deltaY < 0 ? 1.1 : 0.9;
      };
      state.handleMouseDown = (e) => {
        state.isDragging = true;
        state.lastX = e.clientX;
        state.lastY = e.clientY;
      };
      state.handleMouseUp = () => {
        state.isDragging = false;
      };
      state.handleMouseMove = (e) => {
        if (!state.isDragging) return;
        state.offsetX += e.clientX - state.lastX;
        state.offsetY += e.clientY - state.lastY;
        state.lastX = e.clientX;
        state.lastY = e.clientY;
      };

      canvas.addEventListener("wheel", state.handleWheel, { passive: false });
      canvas.addEventListener("mousedown", state.handleMouseDown);
      canvas.addEventListener("mouseup", state.handleMouseUp);
      canvas.addEventListener("mousemove", state.handleMouseMove);

      return state;
    },
    draw({ canvas, ctx }, state) {
      const loop = () => {
        const { analyserL, analyserR, dataL, dataR } = state;
        if (!analyserL || !analyserR) return;

        const w = canvas.width;
        const h = canvas.height;

        analyserL.getFloatTimeDomainData(dataL);
        analyserR.getFloatTimeDomainData(dataR);

        if (ctx.resetTransform) ctx.resetTransform();
        else ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "rgba(0,0,0,0.99)";
        ctx.fillRect(0, 0, w, h);
        ctx.setTransform(state.scale, 0, 0, state.scale, state.offsetX, state.offsetY);

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
        ctx.lineWidth = 1.0 / state.scale;
        ctx.stroke();

        rafId = requestAnimationFrame(loop);
      };
      loop();
    },
    cleanup({ canvas }, state) {
      state.splitter?.disconnect();
      state.analyserL?.disconnect();
      state.analyserR?.disconnect();
      canvas.removeEventListener("wheel", state.handleWheel);
      canvas.removeEventListener("mousedown", state.handleMouseDown);
      canvas.removeEventListener("mouseup", state.handleMouseUp);
      canvas.removeEventListener("mousemove", state.handleMouseMove);
    },
  },
  spectogram: {
    setup({ audioCtx, source }) {
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      return {
        analyser,
        data: new Uint8Array(analyser.frequencyBinCount),
      };
    },
    draw({ canvas, ctx }, state) {
      const loop = () => {
        const { analyser, data } = state;
        if (!analyser) return;

        const w = canvas.width;
        const h = canvas.height;

        analyser.getByteFrequencyData(data);

        const frame = ctx.getImageData(1, 0, w - 1, h);
        ctx.putImageData(frame, 0, 0);

        for (let i = 0; i < data.length; i++) {
          const value = data[i] / 255;
          const y = h - Math.floor((i / data.length) * h);
          const color = `hsl(${(1 - value) * 240}, 100%, ${value * 60 + 20}%)`;
          ctx.fillStyle = color;
          ctx.fillRect(w - 1, y, 1, h / data.length + 1);
        }

        rafId = requestAnimationFrame(loop);
      };

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      loop();
    },
    cleanup(_env, state) {
      state.analyser?.disconnect();
    },
  },
  pcm: {
    setup({ audioCtx, source }) {
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      return {
        analyser,
        data: new Float32Array(analyser.fftSize),
      };
    },
    draw({ canvas, ctx }, state) {
      const loop = () => {
        const { analyser, data } = state;
        if (!analyser) return;

        const w = canvas.width;
        const h = canvas.height;

        analyser.getFloatTimeDomainData(data);

        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);

        ctx.beginPath();

        const midY = h / 2;
        const step = w / data.length;

        ctx.moveTo(0, midY - data[0] * midY);

        for (let i = 1; i < data.length; i++) {
          const x = i * step;
          const y = midY - data[i] * midY;
          ctx.lineTo(x, y);
        }

        ctx.strokeStyle = "#00ffcc";
        ctx.lineWidth = 2;
        ctx.stroke();

        rafId = requestAnimationFrame(loop);
      };
      loop();
    },
    cleanup(_env, state) {
      state.analyser?.disconnect();
    },
  },
};

const modes = Object.keys(MODE_REGISTRY);
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
    startMode();
  } catch (err) {
    console.error("Audio capture failed:", err);
  }
}

// === SETUP CHAIN ===
function setupAudioContext() {
  if (!stream) return;
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
  startMode();
}

function startMode() {
  teardownMode();
  if (!stream) return;

  setupAudioContext();

  const modeKey = modes[currentmodeint];
  const mode = MODE_REGISTRY[modeKey];
  if (!mode) {
    console.warn(`No mode configuration found for "${modeKey}".`);
    return;
  }

  const env = { audioCtx, source, canvas, ctx };
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  activeModeKey = modeKey;
  activeModeState = mode.setup(env) || {};
  mode.draw(env, activeModeState);
}

// === STOP ===
function stopVisualizer(full = false) {
  teardownMode();
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

function teardownMode() {
  cancelAnimationFrame(rafId);
  rafId = null;

  if (!activeModeKey) return;

  const mode = MODE_REGISTRY[activeModeKey];
  if (mode && typeof mode.cleanup === "function") {
    try {
      mode.cleanup({ audioCtx, source, canvas, ctx }, activeModeState || {});
    } catch (err) {
      console.error(`Error cleaning up mode "${activeModeKey}":`, err);
    }
  }

  activeModeKey = null;
  activeModeState = null;
}
