import { createAnimationLoop } from "../shared/animationLoop.js";
import { clamp, lerp } from "../shared/math.js";
import { ensureFrequencyBuffers, resampleLogarithmic } from "../shared/sampling.js";

const LOG_MAX = Math.log1p(255);
const LIGHT_COUNT = 32;
const MAX_STEPS = 48;
const ROOM_MIN = [-7, -1.2, -14];
const ROOM_MAX = [7, 3.6, 4];

const quad = new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
   1,  1,
]);

const fragShader = `
precision highp float;
varying vec2 vUv;

uniform vec2 uResolution;
uniform float uTime;
uniform vec4 uLights[${LIGHT_COUNT}];
uniform vec4 uLightColors[${LIGHT_COUNT}];
uniform float uAmplitudes[${LIGHT_COUNT}];
uniform vec2 uCamera; // orbit, elevation
uniform float uExposure;

const vec3 ROOM_MIN = vec3(${ROOM_MIN[0]}, ${ROOM_MIN[1]}, ${ROOM_MIN[2]});
const vec3 ROOM_MAX = vec3(${ROOM_MAX[0]}, ${ROOM_MAX[1]}, ${ROOM_MAX[2]});

float roomSDF(vec3 p) {
  vec3 inside = max(max(ROOM_MIN - p, p - ROOM_MAX), vec3(0.0));
  return length(inside);
}

vec3 evalLights(vec3 p) {
  vec3 color = vec3(0.0);
  for (int i = 0; i < ${LIGHT_COUNT}; i++) {
    float amp = uAmplitudes[i];
    if (amp < 0.0005) {
      continue;
    }
    vec3 lightPos = uLights[i].xyz;
    float radius = uLights[i].w;
    vec3 diff = lightPos - p;
    float distSq = dot(diff, diff) + 0.001;
    float falloff = amp * radius / distSq;
    color += uLightColors[i].xyz * falloff;
  }
  return color;
}

vec3 march(vec3 ro, vec3 rd) {
  float t = 0.0;
  vec3 accum = vec3(0.0);
  for (int i = 0; i < ${MAX_STEPS}; i++) {
    vec3 pos = ro + rd * t;
    float dist = roomSDF(pos);
    accum += evalLights(pos) * exp(-0.07 * t) * 0.04;
    if (dist < 0.01) {
      t += 0.05;
    } else {
      t += dist;
    }
    if (t > 40.0) break;
  }
  return accum;
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float aspect = uResolution.x / uResolution.y;
  vec3 ro = vec3(0.0, mix(0.2, 2.4, uCamera.y), 8.0);
  float orbit = uCamera.x;
  mat2 rot = mat2(cos(orbit), -sin(orbit), sin(orbit), cos(orbit));
  ro.xz = rot * ro.xz;
  vec3 target = vec3(0.0, 1.0, -3.5);
  target.xz = rot * target.xz;
  vec3 forward = normalize(target - ro);
  vec3 right = normalize(vec3(forward.z, 0.0, -forward.x));
  vec3 up = normalize(cross(right, forward));
  vec3 rd = normalize(forward + uv.x * right * aspect + uv.y * up);
  vec3 color = march(ro, rd);
  color = vec3(1.0) - exp(-color * uExposure);
  color = pow(color, vec3(0.72));
  gl_FragColor = vec4(color, 1.0);
}
`;

const vertShader = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(info || "Shader compile failed");
  }
  return shader;
}

function createProgram(gl) {
  const program = gl.createProgram();
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertShader);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragShader);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    throw new Error(info || "Program link failed");
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

function createGlResources(gl) {
  const program = createProgram(gl);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  const positionLoc = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
  const uniforms = {
    resolution: gl.getUniformLocation(program, "uResolution"),
    time: gl.getUniformLocation(program, "uTime"),
    lights: gl.getUniformLocation(program, "uLights[0]"),
    colors: gl.getUniformLocation(program, "uLightColors[0]"),
    amplitudes: gl.getUniformLocation(program, "uAmplitudes[0]"),
    camera: gl.getUniformLocation(program, "uCamera"),
    exposure: gl.getUniformLocation(program, "uExposure"),
  };
  return { program, buffer, uniforms };
}

function createLightField() {
  const lights = new Float32Array(LIGHT_COUNT * 4);
  const colors = new Float32Array(LIGHT_COUNT * 4);
  for (let i = 0; i < LIGHT_COUNT; i++) {
    const angle = (i / LIGHT_COUNT) * Math.PI * 2 + Math.random() * 0.4;
    const radius = 3.5 + Math.random() * 3.5;
    const x = Math.cos(angle) * radius * 0.8;
    const z = -2.0 - Math.abs(Math.sin(angle) * radius);
    const y = 0.3 + Math.random() * 2.6;
    const baseColor = [
      0.35 + Math.random() * 0.4,
      0.4 + Math.random() * 0.5,
      0.6 + Math.random() * 0.35,
    ];
    const idx = i * 4;
    lights[idx] = x;
    lights[idx + 1] = y;
    lights[idx + 2] = z;
    lights[idx + 3] = 0.6 + Math.random() * 1.0;
    colors[idx] = baseColor[0];
    colors[idx + 1] = baseColor[1];
    colors[idx + 2] = baseColor[2];
    colors[idx + 3] = 1;
  }
  return { lights, colors };
}

export function drawLightRoom(analyser, canvas, view = {}, fallbackCtx = null) {
  if (!analyser || !canvas) return null;
  const gl = getGlContext(canvas);
  if (!gl) {
    if (fallbackCtx) {
      renderGlMissingMessage(fallbackCtx);
    }
    return null;
  }

  const resources = createGlResources(gl);
  gl.useProgram(resources.program);
  gl.disable(gl.DEPTH_TEST);

  const { lights, colors } = createLightField();
  const amplitudes = new Float32Array(LIGHT_COUNT);
  gl.uniform4fv(resources.uniforms.lights, lights);
  gl.uniform4fv(resources.uniforms.colors, colors);

  let freqData = null;
  let normData = null;
  ({ freqData, normData } = ensureFrequencyBuffers(analyser, freqData, normData));
  const resampled = new Float32Array(LIGHT_COUNT);
  const smoothed = new Float32Array(LIGHT_COUNT);

  let prevTime = performance.now();

  const render = () => {
    const now = performance.now();
    const delta = Math.max(0.016, (now - prevTime) / 1000);
    prevTime = now;

    const width = canvas.width || 1;
    const height = canvas.height || 1;
    gl.viewport(0, 0, width, height);

    const zoomOrbit = clamp(view?.orbit ?? 0.35, -Math.PI, Math.PI);
    const elevation = clamp(view?.elevation ?? 0.45, 0, 1);
    const exposure = clamp(view?.exposure ?? 1.25, 0.1, 4);

    analyser.getByteFrequencyData(freqData);
    let hasEnergy = false;
    for (let i = 0; i < freqData.length; i++) {
      const normalised = Math.log1p(freqData[i]) / LOG_MAX;
      normData[i] = normalised;
      if (!hasEnergy && normalised > 0.01) {
        hasEnergy = true;
      }
    }
    resampleLogarithmic(normData, resampled, 2.4);
    for (let i = 0; i < LIGHT_COUNT; i++) {
      const target = resampled[i];
      smoothed[i] = lerp(smoothed[i], target, hasEnergy ? 0.2 : 0.05);
      amplitudes[i] = Math.pow(clamp(smoothed[i], 0, 1), 1.25);
    }

    gl.uniform2f(resources.uniforms.resolution, width, height);
    gl.uniform1f(resources.uniforms.time, now * 0.001);
    gl.uniform2f(resources.uniforms.camera, zoomOrbit + now * (view?.spin ?? 0), elevation);
    gl.uniform1f(resources.uniforms.exposure, exposure);
    gl.uniform1fv(resources.uniforms.amplitudes, amplitudes);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  render();
  const stopLoop = createAnimationLoop(render);
  return () => {
    stopLoop();
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  };
}

function getGlContext(canvas) {
  const attributes = { antialias: true, alpha: false, depth: false, preserveDrawingBuffer: false };
  return (
    canvas.getContext("webgl2", attributes) ||
    canvas.getContext("webgl", attributes) ||
    canvas.getContext("experimental-webgl", attributes)
  );
}

function renderGlMissingMessage(ctx) {
  ctx.save();
  ctx.fillStyle = "#050509";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.textAlign = "center";
  ctx.font = "16px system-ui";
  ctx.fillText("WebGL unavailable", ctx.canvas.width / 2, ctx.canvas.height / 2 - 8);
  ctx.fillText("Enable hardware acceleration to use Light Room", ctx.canvas.width / 2, ctx.canvas.height / 2 + 16);
  ctx.restore();
}
