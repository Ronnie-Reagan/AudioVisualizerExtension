export function drawSpectrum(analyser) {
  const ctx = window.ctx;
  const data = new Uint8Array(analyser.frequencyBinCount);

  const loop = () => {
    if (!analyser) return;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    analyser.getByteFrequencyData(data);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const barCount = data.length;
    const barW = w / barCount;
    for (let i = 0; i < barCount; i++) {
      const value = data[i] / 255;
      const barH = h * value;
      ctx.fillStyle = `rgb(${Math.floor(value * 255)}, 60, 220)`;
      ctx.fillRect(i * barW, h - barH, barW - 1, barH);
    }
    window.rafId = requestAnimationFrame(loop);
  };
  loop();
}
