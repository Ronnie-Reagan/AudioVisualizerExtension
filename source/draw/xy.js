export function drawXY(analyserL, analyserR) {
	const ctx = window.ctx;
	const canvas = ctx.canvas;
	canvas.onwheel = canvas.onmousedown = canvas.onmouseup = canvas.onmousemove = null;
	const dataL = new Float32Array(analyserL.fftSize);
	const dataR = new Float32Array(analyserR.fftSize);
	let frame = 0;

	const phosphor = document.createElement("canvas");
	const phosphorCtx = phosphor.getContext("2d", { alpha: true });
	const beam = document.createElement("canvas");
	const beamCtx = beam.getContext("2d", { alpha: true });
	const beamSize = 8;
	const beamRadius = beamSize / 2;
	beam.width = beamSize;
	beam.height = beamSize;
	const glow = beamCtx.createRadialGradient(
		beamRadius,
		beamRadius,
		0,
		beamRadius,
		beamRadius,
		beamRadius
	);
	glow.addColorStop(0.0, "rgba(220, 255, 220, 0.9)");
	glow.addColorStop(0.2, "rgba(120, 255, 190, 0.78)");
	glow.addColorStop(0.5, "rgba(50, 200, 140, 0.28)");
	glow.addColorStop(1.0, "rgba(0, 40, 0, 0)");
	beamCtx.fillStyle = glow;
	beamCtx.fillRect(0, 0, beamSize, beamSize);

	function ensurePhosphorSize(width, height) {
		if (phosphor.width === width && phosphor.height === height) return;
		phosphor.width = width;
		phosphor.height = height;
		phosphorCtx.fillStyle = "rgba(0,0,0,1)";
		phosphorCtx.fillRect(0, 0, width, height);
	}

	function drawGraticule(width, height) {
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.strokeStyle = "rgba(0, 60, 35, 0.35)";
		ctx.lineWidth = 1;

		ctx.beginPath();
		const border = 1;
		ctx.strokeRect(border, border, width - border * 2, height - border * 2);

		ctx.globalAlpha = 0.55;
		const step = 60;
		for (let x = border + step; x < width - border; x += step) {
			ctx.moveTo(x, border);
			ctx.lineTo(x, height - border);
		}
		for (let y = border + step; y < height - border; y += step) {
			ctx.moveTo(border, y);
			ctx.lineTo(width - border, y);
		}
		ctx.stroke();

		ctx.globalAlpha = 0.9;
		ctx.strokeStyle = "rgba(0, 140, 70, 0.45)";
		ctx.beginPath();
		ctx.moveTo(width / 2, border);
		ctx.lineTo(width / 2, height - border);
		ctx.moveTo(border, height / 2);
		ctx.lineTo(width - border, height / 2);
		ctx.stroke();
		ctx.restore();
	}

	const loop = () => {
		if (!analyserL || !analyserR) return;
		const w = canvas.width;
		const h = canvas.height;
		ensurePhosphorSize(w, h);

		analyserL.getFloatTimeDomainData(dataL);
		analyserR.getFloatTimeDomainData(dataR);

		phosphorCtx.globalCompositeOperation = "source-over";
		phosphorCtx.fillStyle = "rgba(0, 10, 0, 0.75)";
		phosphorCtx.fillRect(0, 0, w, h);

		phosphorCtx.globalCompositeOperation = "lighter";
		const scale = Math.min(w, h) * 0.45;
		const blankThreshold = scale * 0.12;
		const blankThresholdSq = blankThreshold * blankThreshold;
		const stride = 2;
		const smoothing = 0.75;

		let spotX = w / 2;
		let spotY = h / 2;
		let prevX;
		let prevY;

		for (let i = 0; i < dataL.length; i += stride) {
			const targetX = w / 2 + dataL[i] * scale;
			const targetY = h / 2 - dataR[i] * scale;

			spotX += (targetX - spotX) * smoothing;
			spotY += (targetY - spotY) * smoothing;

			if (prevX !== undefined) {
				const dx = spotX - prevX;
				const dy = spotY - prevY;
				const distSq = dx * dx + dy * dy;
				if (distSq > blankThresholdSq) {
					prevX = spotX;
					prevY = spotY;
					continue;
				}
			}

			const jitter = (Math.random() - 0.5) * 0.6;
			const jitterX = spotX + jitter;
			const jitterY = spotY + jitter;

			phosphorCtx.globalAlpha = 0.7 + Math.random() * 0.3;
			phosphorCtx.drawImage(beam, jitterX - beamRadius, jitterY - beamRadius);

			prevX = spotX;
			prevY = spotY;
		}

		phosphorCtx.globalAlpha = 1;
		phosphorCtx.globalCompositeOperation = "source-over";

		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = "#040b04";
		ctx.fillRect(0, 0, w, h);

		if ((frame & 7) === 0) {
			ctx.globalAlpha = 0.045;
			ctx.fillStyle = "#0f6";
			for (let i = 0; i < 20; i++) {
				const nx = Math.random() * w;
				const ny = Math.random() * h;
				ctx.fillRect(nx, ny, 1, 1);
			}
			ctx.globalAlpha = 1;
		}

		ctx.globalCompositeOperation = "screen";
		ctx.drawImage(phosphor, 0, 0);
		ctx.globalCompositeOperation = "source-over";

		drawGraticule(w, h);
		ctx.restore();

		frame = (frame + 1) >>> 0;
		window.rafId = requestAnimationFrame(loop);
	};

	ensurePhosphorSize(canvas.width, canvas.height);
	loop();
}
