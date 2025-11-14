import test from "node:test";
import assert from "node:assert/strict";
import { resampleLinear, resampleLogarithmic } from "../source/visualizer_system/shared/sampling.js";

test("resampleLinear interpolates end points", () => {
  const out = new Float32Array(5);
  resampleLinear(Float32Array.from([0, 10]), out);
  assert.deepEqual(Array.from(out), [0, 2.5, 5, 7.5, 10]);
});

test("resampleLogarithmic skews towards highs", () => {
  const input = Float32Array.from([0, 5, 10, 20]);
  const out = new Float32Array(4);
  resampleLogarithmic(input, out, 3);
  assert.equal(out[0], 0);
  assert(out[3] <= 20 && out[3] >= 10);
});
