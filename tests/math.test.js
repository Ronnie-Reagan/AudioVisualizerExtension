import test from "node:test";
import assert from "node:assert/strict";
import { clamp, lerp, smoothstep, invLerp, damp } from "../source/visualizer_system/shared/math.js";

test("clamp keeps values in range", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-4, 0, 10), 0);
  assert.equal(clamp(100, 0, 10), 10);
});

test("lerp blends values linearly", () => {
  assert.equal(lerp(0, 10, 0.5), 5);
  assert.equal(lerp(-10, 10, 0.25), -5);
});

test("invLerp normalises within bounds", () => {
  assert.equal(invLerp(0, 10, 5), 0.5);
  assert.equal(invLerp(0, 10, -2), 0);
  assert.equal(invLerp(0, 10, 14), 1);
});

test("smoothstep eases between edges", () => {
  assert.equal(smoothstep(0, 1, -1), 0);
  assert.equal(smoothstep(0, 1, 1), 1);
  assert.equal(smoothstep(0, 1, 0.5), 0.5);
});

test("damp converges towards target", () => {
  const next = damp(0, 10, 0.5, 0.016);
  assert(next > 0);
  assert(next < 10);
});
