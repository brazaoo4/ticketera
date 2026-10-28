import test from "node:test";
import assert from "node:assert/strict";
import {
  ParsedReceiptSchema,
  ParsedReceiptItemSchema,
  CANONICAL_CATEGORIES,
} from "../src/lib/ai/schema";

test("CANONICAL_CATEGORIES contains staple grocery categories", () => {
  assert.ok(CANONICAL_CATEGORIES.includes("Dairy & Eggs"));
  assert.ok(CANONICAL_CATEGORIES.includes("Oils & Condiments"));
  assert.ok(CANONICAL_CATEGORIES.includes("Bakery"));
  assert.ok(CANONICAL_CATEGORIES.includes("Other"));
});

test("ParsedReceiptItemSchema applies sensible defaults", () => {
  const item = ParsedReceiptItemSchema.parse({
    raw_name: "LECHE DESNATADA 1L",
    suggested_name: "Leche Desnatada 1L",
    quantity: 6,
    unit_price: 0.95,
    total_price: 5.7,
  });

  assert.equal(item.category, "Other");
  assert.equal(item.base_unit, "UNIT");
  assert.equal(item.is_discount, false);
  assert.equal(item.is_bag_or_fee, false);
});

test("ParsedReceiptSchema parses a complete receipt with tax breakdown", () => {
  const receipt = ParsedReceiptSchema.parse({
    is_valid_receipt: true,
    store: "Mercadona",
    date: "2026-10-25",
    total: 12.45,
    tax_breakdown: [
      { rate: 4, base_amount: 10.0, tax_amount: 0.4 },
      { rate: 10, base_amount: 1.86, tax_amount: 0.19 },
    ],
    items: [
      {
        raw_name: "HUEVOS CAMPEROS M 12UD",
        suggested_name: "Huevos Camperos M 12ud",
        category: "Dairy & Eggs",
        quantity: 1,
        unit_price: 2.35,
        total_price: 2.35,
        base_unit: "UNIT",
        unit_measure: 12,
        price_per_base_unit: 0.196,
      },
    ],
  });

  assert.equal(receipt.is_valid_receipt, true);
  assert.equal(receipt.store, "Mercadona");
  assert.equal(receipt.total, 12.45);
  assert.equal(receipt.tax_breakdown?.length, 2);
  assert.equal(receipt.items.length, 1);
});
