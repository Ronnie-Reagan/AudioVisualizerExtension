export let audioCtx = null;
export let source = null;

export function setupAudioContext(stream) {
  if (!stream) return;
  if (audioCtx) {
    try {
      closeAudioContext();
    } catch (err) {
      console.warn("Failed to close existing audio context:", err);
    }
  }

  audioCtx = new AudioContext();
  source = audioCtx.createMediaStreamSource(stream);

  const gain = audioCtx.createGain();
  gain.gain.value = 1.0;
  source.connect(gain);
  gain.connect(audioCtx.destination);

  audioCtx.resume().catch(() => {});
}

export function closeAudioContext() {
  if (source) {
    try {
      source.disconnect();
    } catch (err) {
      console.warn("Failed to disconnect source node:", err);
    }
    source = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
}
