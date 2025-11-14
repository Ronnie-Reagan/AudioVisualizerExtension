import test from "node:test";
import assert from "node:assert/strict";
import { computeVisibleSpan, computeBaseline } from "../source/visualizer_system/shared/view.js";

test("computeVisibleSpan clamps within data length", () => {
  const span = computeVisibleSpan(100, 2, 0.5, 10);
  assert.equal(span.span <= 100, true);
  assert.equal(span.start + span.span <= 100, true);
});

test("computeBaseline respects offsets", () => {
  const baseline = computeBaseline(200, 0.5);
  assert(baseline <= 200);
  assert(baseline >= -200);
});
