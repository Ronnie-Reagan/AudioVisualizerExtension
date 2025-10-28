import { createAnimationLoop } from "../shared/animationLoop.js";

export function drawPCM(analyser, ctx) {
  if (!analyser || !ctx) return () => {};
  const data = new Float32Array(analyser.fftSize);

  const render = () => {
    const { canvas } = ctx;
    const w = canvas.width;
    const h = canvas.height;
    const midY = h / 2;

    analyser.getFloatTimeDomainData(data);

    ctx.fillStyle = "#03030a";
    ctx.fillRect(0, 0, w, h);

    ctx.beginPath();
    const step = w / data.length;
    ctx.moveTo(0, midY - data[0] * midY);
    for (let i = 1; i < data.length; i++) {
      const x = i * step;
      const y = midY - data[i] * midY;
      ctx.lineTo(x, y);
    }

    ctx.strokeStyle = "#0dffb6";
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 4;
    ctx.shadowColor = "rgba(13, 255, 182, 0.35)";
    ctx.stroke();
    ctx.shadowBlur = 0;
  };

  render();
  return createAnimationLoop(render);
}
