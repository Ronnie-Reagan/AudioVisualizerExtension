import { createAnimationLoop } from "../shared/animationLoop.js";

export function drawSpectrum(analyser, ctx) {
  if (!analyser || !ctx) return () => {};
  const data = new Uint8Array(analyser.frequencyBinCount);

  const render = () => {
    const { canvas } = ctx;
    const w = canvas.width;
    const h = canvas.height;

    analyser.getByteFrequencyData(data);
    ctx.fillStyle = "#040408";
    ctx.fillRect(0, 0, w, h);

    const barCount = data.length;
    const barWidth = w / barCount;
    for (let i = 0; i < barCount; i++) {
      const value = data[i] / 255;
      const barHeight = h * value;
      const hue = Math.floor(220 - value * 200);
      ctx.fillStyle = `hsl(${hue}deg 85% ${45 + value * 35}%)`;
      ctx.fillRect(i * barWidth, h - barHeight, barWidth, barHeight + 1);
    }
  };

  render();
  return createAnimationLoop(render);
}
