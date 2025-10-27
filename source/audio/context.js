export let audioCtx = null;
export let source = null;

export function setupAudioContext(stream) {
  if (audioCtx) audioCtx.close().catch(() => {});
  audioCtx = new AudioContext();
  source = audioCtx.createMediaStreamSource(stream);

  const gain = audioCtx.createGain();
  gain.gain.value = 1.0;
  source.connect(gain);
  gain.connect(audioCtx.destination);
}

export function closeAudioContext() {
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
}
