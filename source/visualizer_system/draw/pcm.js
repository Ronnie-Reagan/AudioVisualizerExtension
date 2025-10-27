import { tryGetCanvasContext } from "../shared/canvas.js";
import { scheduleNextFrame } from "../shared/animationLoop.js";

export function drawPCM(analyser) {
  const ctx = tryGetCanvasContext();
  if (!ctx) return;
  const data = new Float32Array(analyser.fftSize);

  const loop = () => {
    if (!analyser) return;
    const canvas = ctx.canvas;
    const w = canvas.width;
    const h = canvas.height;
    analyser.getFloatTimeDomainData(data);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.beginPath();
    const midY = h / 2;
    const step = w / data.length;
    ctx.moveTo(0, midY - data[0] * midY);
    for (let i = 1; i < data.length; i++) {
      const x = i * step;
      const y = midY - data[i] * midY;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#00ffcc";
    ctx.lineWidth = 1;
    ctx.stroke();
    scheduleNextFrame(loop);
  };
  loop();
}
