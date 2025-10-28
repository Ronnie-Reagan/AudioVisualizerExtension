import { createAnimationLoop } from "../shared/animationLoop.js";

export function drawSpectrogram(analyser, ctx) {
  if (!analyser || !ctx) return () => {};
  const data = new Uint8Array(analyser.frequencyBinCount);

  const render = () => {
    const { canvas } = ctx;
    const w = canvas.width;
    const h = canvas.height;
    if (w < 2 || h < 2) return;

    analyser.getByteFrequencyData(data);

    const frame = ctx.getImageData(1, 0, w - 1, h);
    ctx.putImageData(frame, 0, 0);

    for (let i = 0; i < data.length; i++) {
      const value = data[i] / 255;
      const y = h - Math.floor((i / data.length) * h);
      const hue = Math.max(180 - value * 180, 0);
      const lightness = 25 + value * 45;
      ctx.fillStyle = `hsl(${hue}deg 80% ${lightness}%)`;
      ctx.fillRect(w - 1, y, 1, h / data.length + 1);
    }
  };

  ctx.fillStyle = "#010104";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  render();
  return createAnimationLoop(render);
}
