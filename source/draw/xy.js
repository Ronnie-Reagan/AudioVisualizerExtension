export function drawXY(analyserL, analyserR) {
  const ctx = window.ctx;
  const dataL = new Float32Array(analyserL.fftSize);
  const dataR = new Float32Array(analyserR.fftSize);
  let scale = 1, offsetX = 0, offsetY = 0, isDragging = false, lastX = 0, lastY = 0;

  function applyPanZoom() {
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  }

  ctx.canvas.onwheel = (e) => {
    e.preventDefault();
    scale *= e.deltaY < 0 ? 1.1 : 0.9;
  };
  ctx.canvas.onmousedown = (e) => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  };
  ctx.canvas.onmouseup = () => (isDragging = false);
  ctx.canvas.onmousemove = (e) => {
    if (!isDragging) return;
    offsetX += e.clientX - lastX;
    offsetY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
  };

  const loop = () => {
    if (!analyserL || !analyserR) return;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    analyserL.getFloatTimeDomainData(dataL);
    analyserR.getFloatTimeDomainData(dataR);
    ctx.resetTransform();
    ctx.fillStyle = "rgba(0,0,0,0.99)";
    ctx.fillRect(0, 0, w, h);
    applyPanZoom();
    ctx.beginPath();

    let prevX = null, prevY = null, prevdist = 25;
    for (let i = 0; i < dataL.length; i++) {
      const x = (dataL[i] * 0.5 + 0.5) * w;
      const y = h - (dataR[i] * 0.5 + 0.5) * h;
      if (prevX === null) ctx.moveTo(x, y);
      else {
        const dx = x - prevX, dy = y - prevY, dist = Math.hypot(dx, dy);
        if (dist > prevdist * 1.5) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        prevdist = dist;
      }
      prevX = x;
      prevY = y;
    }

    ctx.strokeStyle = "#00ff66";
    ctx.lineWidth = 1.0 / scale;
    ctx.stroke();
    window.rafId = requestAnimationFrame(loop);
  };
  loop();
}
