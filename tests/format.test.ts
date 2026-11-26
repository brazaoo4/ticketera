import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCurrency,
  formatWholeCurrency,
  formatPriceRange,
  formatUnitPrice,
  formatMeasureText,
  formatPerPackMeasure,
  formatLineMeasure,
  formatPercent,
  formatDate,
  formatDateInputDDMMYYYY,
  parseDDMMYYYYToISO,
  getStoreBrand,
} from "../src/lib/format";

test("formatCurrency uses Spanish Euro format with comma and trailing €", () => {
  assert.equal(formatCurrency(16.65), "16,65 €");
  assert.equal(formatCurrency(-4.8), "-4,80 €");
  assert.equal(formatCurrency(1250.5), "1.250,50 €");
  assert.equal(formatCurrency(-0.001), "0,00 €");
  assert.equal(formatWholeCurrency(0), "0 €");
  assert.equal(formatWholeCurrency(50), "50 €");
  assert.equal(formatWholeCurrency(1250.4), "1.250 €");
});

test("formatPriceRange formats ranges without manual euro stripping", () => {
  assert.equal(formatPriceRange(7.95, 9.15, "unit", "L"), "7,95 to 9,15 €/L");
  assert.equal(formatPriceRange(1.75, 1.8, "pack", "KG"), "1,75 to 1,80 €");
});

test("formatUnitPrice formats without double euro symbols or ud leaks", () => {
  assert.equal(formatUnitPrice(7.95, "L"), "7,95 €/L");
  assert.equal(formatUnitPrice(1.29, "KG"), "1,29 €/kg");
  assert.equal(formatUnitPrice(0.19, "UNIT"), "0,19 €/unit");
});

test("formatMeasureText, formatPerPackMeasure, and formatLineMeasure format cleanly", () => {
  assert.equal(formatMeasureText(0.42, "KG"), "420 g");
  assert.equal(formatMeasureText(1, "KG"), "1 kg");
  assert.equal(formatMeasureText(1.5, "KG"), "1,50 kg");
  assert.equal(formatMeasureText(0.33, "L"), "330 ml");
  assert.equal(formatMeasureText(5, "L"), "5 L");
  assert.equal(formatMeasureText(1, "UNIT"), "1 unit");
  assert.equal(formatMeasureText(12, "UNIT"), "12 units");
  assert.equal(formatPerPackMeasure(6, 6, "L"), "1 L");
  assert.equal(formatPerPackMeasure(6, 1, "L"), "6 L");
  assert.equal(formatLineMeasure(6, 6, "L"), "6 × 1 L");
  assert.equal(formatLineMeasure(0.5, 2, "KG"), "2 × 250 g");
  assert.equal(formatLineMeasure(1, 1, "L"), "1 L");
});

test("formatPercent formats comma percentages with sign and optional decimals", () => {
  assert.equal(formatPercent(-7.2), "-7,2%");
  assert.equal(formatPercent(15.8), "+15,8%");
  assert.equal(formatPercent(0.01), "0,0%");
  assert.equal(formatPercent(-16, { decimals: 0 }), "-16%");
  assert.equal(formatPercent(0.1, { decimals: 0 }), "0%");
});

test("date formatters and DD/MM/YYYY parser work deterministically", () => {
  assert.equal(formatDate("2026-10-21T12:00:00.000Z"), "21 Oct 2026");
  assert.equal(formatDateInputDDMMYYYY("2026-05-12T10:00:00.000Z"), "12/05/2026");
  assert.equal(parseDDMMYYYYToISO("12/05/2026"), "2026-05-12");
  assert.equal(parseDDMMYYYYToISO("2026-05-12"), "2026-05-12");
  assert.equal(parseDDMMYYYYToISO("31/02/2026"), null);
  assert.equal(parseDDMMYYYYToISO("not-a-date"), null);
});

test("getStoreBrand separates Carrefour and Lidl colors cleanly and uses accessible Consum orange", () => {
  const carrefour = getStoreBrand("Carrefour");
  const lidl = getStoreBrand("Lidl");
  const consum = getStoreBrand("Consum");
  assert.equal(carrefour.color, "#2563EB");
  assert.equal(carrefour.fg, "#FFFFFF");
  assert.equal(lidl.color, "#EAB308");
  assert.equal(lidl.fg, "#181A18");
  assert.equal(consum.color, "#C2410C");
  assert.equal(consum.fg, "#FFFFFF");
  assert.notEqual(carrefour.color, lidl.color);
});
