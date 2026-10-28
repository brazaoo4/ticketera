import test from "node:test";
import assert from "node:assert/strict";
import { formatMeasure } from "../src/lib/analytics/shrinkflation-types";

test("formatMeasure formats KG correctly", () => {
  assert.equal(formatMeasure(0.5, "KG"), "500g");
  assert.equal(formatMeasure(0.42, "KG"), "420g");
  assert.equal(formatMeasure(1, "KG"), "1 kg");
  assert.equal(formatMeasure(1.5, "KG"), "1.50 kg");
  assert.equal(formatMeasure(3, "KG"), "3 kg");
});

test("formatMeasure formats L correctly", () => {
  assert.equal(formatMeasure(0.33, "L"), "330 ml");
  assert.equal(formatMeasure(0.5, "L"), "500 ml");
  assert.equal(formatMeasure(1, "L"), "1 L");
  assert.equal(formatMeasure(1.5, "L"), "1.50 L");
  assert.equal(formatMeasure(5, "L"), "5 L");
});

test("formatMeasure formats UNIT correctly", () => {
  assert.equal(formatMeasure(1, "UNIT"), "1 ud");
  assert.equal(formatMeasure(6, "UNIT"), "6 ud");
  assert.equal(formatMeasure(12, "UNIT"), "12 ud");
});
