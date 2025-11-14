import test from "node:test";
import assert from "node:assert/strict";
import { getHaloBinAngle } from "../source/visualizer_system/draw/halo.js";

test("halo bin angles increase monotonically", () => {
  const first = getHaloBinAngle(0);
  const mid = getHaloBinAngle(128);
  const last = getHaloBinAngle(511);
  assert(first <= mid);
  assert(mid <= last);
});

test("halo bin angles clamp indices", () => {
  assert.equal(getHaloBinAngle(-10), getHaloBinAngle(0));
  assert.equal(getHaloBinAngle(9999), getHaloBinAngle(511));
});
