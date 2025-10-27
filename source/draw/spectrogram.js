export function drawSpectrogram(analyser) {
  const ctx = window.ctx;
  const data = new Uint8Array(analyser.frequencyBinCount);

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const loop = () => {
    if (!analyser) return;
    const w = ctx.canvas.width, h = ctx.canvas.height;
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
    window.rafId = requestAnimationFrame(loop);
  };
  loop();
}
