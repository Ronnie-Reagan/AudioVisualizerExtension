import { createAnimationLoop } from "../shared/animationLoop.js";

const clamp = (value, min, max) => {
  const numeric = Number.isFinite(value) ? value : min;
  return Math.min(Math.max(numeric, min), max);
};

export function drawPCM(analyser, ctx, view) {
  if (!analyser || !ctx) return () => {};
  const data = new Float32Array(analyser.fftSize);

  const render = () => {
    const { canvas } = ctx;
    const w = canvas.width || 1;
    const h = canvas.height || 1;
    const midY = h / 2;

    analyser.getFloatTimeDomainData(data);

    ctx.fillStyle = "#03030a";
    ctx.fillRect(0, 0, w, h);

    const zoomX = clamp(view?.zoomX ?? 1, 0.25, 16);
    const zoomY = clamp(view?.zoomY ?? 1, 0.25, 12);
    const offsetX = clamp(view?.offsetX ?? 0, 0, 1);
    const offsetY = clamp(view?.offsetY ?? 0, -1, 1);

    const visibleSamples = Math.min(w , Math.floor(data.length / zoomX));
    const maxStart = Math.max(0, data.length - visibleSamples);
    const startIndex = Math.max(0, Math.min(maxStart, Math.round(offsetX * maxStart)));
    const step = w / visibleSamples;
    const verticalShift = offsetY * midY;

    ctx.beginPath();
    for (let i = 0; i < visibleSamples; i++) {
      const sample = data[startIndex + i];
      const x = i * step;
      const y = clamp(midY - verticalShift - sample * midY * zoomY, -h, h * 2);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.strokeStyle = "#0dffb6";
    ctx.lineWidth = 1;
    ctx.shadowBlur = 4;
    ctx.shadowColor = "rgba(13, 255, 182, 0.35)";
    ctx.stroke();
    ctx.shadowBlur = 0;
  };

  render();
  return createAnimationLoop(render);
}
