import { createAnimationLoop } from "../shared/animationLoop.js";

const clamp = (value, min, max) => {
  const numeric = Number.isFinite(value) ? value : min;
  return Math.min(Math.max(numeric, min), max);
};

export function drawSpectrogram(analyser, ctx, view) {
  if (!analyser || !ctx) return () => {};
  const data = new Uint8Array(analyser.frequencyBinCount);
  let scrollAccumulator = 0;

  const render = () => {
    const { canvas } = ctx;
    const w = canvas.width || 1;
    const h = canvas.height || 1;
    if (w < 2 || h < 2) return;

    analyser.getByteFrequencyData(data);

    const zoomY = clamp(view?.zoomY ?? 1, 0.5, 6);
    const intensity = clamp(view?.intensity ?? 1, 0.2, 4.5);
    const offsetY = clamp(view?.offsetY ?? 0, 0, 1);
    const speed = clamp(view?.speed ?? 1, 0.25, 5);

    scrollAccumulator += speed;
    let shift = Math.floor(scrollAccumulator);
    scrollAccumulator -= shift;
    if (shift < 1) {
      shift = 1;
      scrollAccumulator = Math.max(0, scrollAccumulator - 1);
    }
    if (shift >= w) {
      ctx.fillStyle = "#010104";
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.drawImage(canvas, shift, 0, w - shift, h, 0, 0, w - shift, h);
      ctx.fillStyle = "#010104";
      ctx.fillRect(w - shift, 0, shift, h);
    }

    const visibleBins = Math.max(8, Math.floor(data.length / zoomY));
    const maxStart = Math.max(0, data.length - visibleBins);
    const startIndex = Math.max(0, Math.min(maxStart, Math.round(offsetY * maxStart)));
    const columnWidth = Math.min(shift, w);
    const baseX = w - columnWidth;

    for (let i = 0; i < visibleBins; i++) {
      const datum = data[startIndex + i] / 255;
      const level = clamp(datum * intensity, 0, 1);
      const hue = Math.max(210 - level * 220, 0);
      const saturation = clamp(55 + level * 40, 50, 95);
      const lightness = clamp(18 + level * 60, 12, 92);

      const topFraction = i / visibleBins;
      const bottomFraction = (i + 1) / visibleBins;
      const yTop = Math.floor((1 - topFraction) * h);
      const yBottom = Math.floor((1 - bottomFraction) * h);
      const height = Math.max(1, yTop - yBottom);
      const y = yBottom;

      ctx.fillStyle = `hsl(${hue}deg ${saturation}% ${lightness}%)`;
      ctx.fillRect(baseX, y, columnWidth, height);
    }
  };

  ctx.fillStyle = "#010104";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  render();
  return createAnimationLoop(render);
}
