import { createAnimationLoop } from "../shared/animationLoop.js";

const clamp = (value, min, max) => {
  const numeric = Number.isFinite(value) ? value : min;
  return Math.min(Math.max(numeric, min), max);
};

export function drawSpectrum(analyser, ctx, view) {
  if (!analyser || !ctx) return () => {};
  const data = new Uint8Array(analyser.frequencyBinCount);

  const render = () => {
    const { canvas } = ctx;
    const w = canvas.width || 1;
    const h = canvas.height || 1;

    analyser.getByteFrequencyData(data);
    ctx.fillStyle = "#040408";
    ctx.fillRect(0, 0, w, h);

    const zoomX = clamp(view?.zoomX ?? 1, 0.25, 32);
    const zoomY = clamp(view?.zoomY ?? 1, 0.2, 12);
    const offsetX = clamp(view?.offsetX ?? 0, 0, 1);
    const offsetY = clamp(view?.offsetY ?? 0, -1, 1);

    const visibleBins = Math.max(16, Math.floor(data.length / zoomX));
    const maxStart = Math.max(0, data.length - visibleBins);
    const startIndex = Math.max(0, Math.min(maxStart, Math.round(offsetX * maxStart)));
    const baselineOffset = offsetY * h * 0.45;
    const barWidth = Math.max(1, w / visibleBins);
    for (let i = 0; i < visibleBins; i++) {
      const datum = data[startIndex + i] / 255;
      const barHeight = Math.min(h, h * datum * zoomY);
      const x = i * barWidth;
      const baseline = clamp(h - baselineOffset, -h, h * 2);
      const top = clamp(baseline - barHeight, -h, h);
      const height = Math.max(1, baseline - top);
      const y = top;
      const hue = Math.floor(220 - datum * 200);
      const lightness = 45 + datum * 35;
      ctx.fillStyle = `hsl(${hue}deg 85% ${lightness}%)`;
      ctx.fillRect(x, y, barWidth, height);
    }
  };

  render();
  return createAnimationLoop(render);
}
