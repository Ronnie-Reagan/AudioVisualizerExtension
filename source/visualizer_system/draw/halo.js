import { createAnimationLoop } from "../shared/animationLoop.js";

const clamp = (value, min, max) => {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  const numeric = Number.isFinite(value) ? value : lower;
  return Math.min(Math.max(numeric, lower), upper);
};

export function drawHalo(analyser, ctx, view = {}) {
  if (!analyser || !ctx) return () => {};
  let freqData = new Uint8Array(analyser.frequencyBinCount || 2048);
  if (typeof analyser.smoothingTimeConstant === "number") {
    analyser.smoothingTimeConstant = 0.78;
  }

  const render = () => {
    const { canvas } = ctx;
    const width = canvas.width || 1;
    const height = canvas.height || 1;
    const cx = width / 2;
    const cy = height / 2;
    const minDimension = Math.min(width, height);

    if (analyser.frequencyBinCount !== freqData.length) {
      freqData = new Uint8Array(analyser.frequencyBinCount || 2048);
    }
    analyser.getByteFrequencyData(freqData);

    const zoomX = clamp(view?.zoomX ?? 1, 0.25, 6);
    const zoomY = clamp(view?.zoomY ?? 1, 0.25, 8);
    const offsetY = clamp(view?.offsetY ?? 0, -1, 1);
    const offsetX = clamp(view?.offsetX ?? 0, 0, 1);
    const rotation = offsetX * Math.PI * 2;

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(6, 10, 22, 0.26)";
    ctx.fillRect(0, 0, width, height);

    const baseRadius = minDimension * 0.22 * zoomX;
    const maxRadius = minDimension * 0.48 * zoomY;
    const centerY = cy + offsetY * height * 0.2;

    ctx.save();
    ctx.translate(cx, centerY);
    ctx.rotate(rotation);
    ctx.globalCompositeOperation = "darker";
    ctx.lineWidth = Math.max(1.2, 2.4 / zoomX);

    const bins = freqData.length;
    const angleStep = (Math.PI * 2) / bins;

    for (let i = 0; i < bins; i++) {
      const magnitude = freqData[i] / 255;
      if (magnitude <= 0.02) continue;
      const eased = Math.pow(magnitude, 1.6);
      const innerRadius = baseRadius * (0.55 + eased * 0.3);
      const outerRadius = baseRadius + eased * (maxRadius - baseRadius);
      const angle = i * angleStep + 2.5;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const hue = 155 + Math.round(90 * magnitude);
      const lightness = 52 + Math.round(25 * magnitude);
      const alpha = 0.22 + eased * 0.55;

      ctx.strokeStyle = `hsla(${hue}, 80%, ${lightness}%, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(innerRadius * cos, innerRadius * sin);
      ctx.lineTo(outerRadius * cos, outerRadius * sin);
      ctx.stroke();
    }

    ctx.restore();

    ctx.globalCompositeOperation = "screen";
    const aura = ctx.createRadialGradient(cx, centerY, baseRadius * 0.35, cx, centerY, maxRadius * 1.25);
    aura.addColorStop(0, "rgba(18, 255, 190, 0.18)");
    aura.addColorStop(0.6, "rgba(0, 140, 255, 0.12)");
    aura.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(cx, centerY, maxRadius * 1.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "source-over";
  };

  render();
  return createAnimationLoop(render);
}
