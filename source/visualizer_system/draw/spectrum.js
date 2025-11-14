import { createAnimationLoop } from "../shared/animationLoop.js";
import { clamp } from "../shared/math.js";
import { computeVisibleSpan, computeBaseline } from "../shared/view.js";

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

    const visible = computeVisibleSpan(data.length, zoomX, offsetX, 16);
    const visibleBins = visible.span;
    const startIndex = visible.start;
    const baseline = computeBaseline(h, offsetY);
    const barWidth = Math.max(1, w / visibleBins);
    for (let i = 0; i < visibleBins; i++) {
      const datum = data[startIndex + i] / 255;
      const barHeight = Math.min(h, h * datum * zoomY);
      const x = i * barWidth;
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
