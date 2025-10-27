(() => {
  const canvas = document.getElementById("vis");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
})();
