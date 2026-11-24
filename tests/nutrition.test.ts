import test from "node:test";
import assert from "node:assert/strict";
import {
  extractOpenFoodFactsNutrition,
  normalizeBarcode,
} from "../src/lib/catalog/parser";
import {
  computeKcalPerEuro,
  computeNutritionBasketInsights,
  computeProteinPerEuro,
} from "../src/lib/analytics/nutrition";

test("normalizeBarcode validates EAN-8, UPC-A, EAN-13, GTIN-14 and rejects invalid strings", () => {
  assert.equal(normalizeBarcode(" 8480000-105302 "), "8480000105302");
  assert.equal(normalizeBarcode("12345678"), "12345678");
  assert.equal(normalizeBarcode("1234567"), null);
  assert.equal(normalizeBarcode("abc8480000105302"), null);
  assert.equal(normalizeBarcode(null), null);
});

test("extractOpenFoodFactsNutrition extracts Nutri-Score, NOVA, protein, kcal, and handles kJ conversion", () => {
  const milk = extractOpenFoodFactsNutrition({
    code: "8480000105302",
    nutriscore_grade: "B",
    nova_group: 1,
    nutriments: {
      proteins_100g: 3.2,
      "energy-kcal_100g": 64,
    },
  });
  assert.deepEqual(milk, {
    nutriScore: "b",
    novaGroup: 1,
    proteinPer100g: 3.2,
    kcalPer100g: 64,
    ean: "8480000105302",
  });

  // Fallback kJ conversion & unknown/not-applicable filtering
  const oats = extractOpenFoodFactsNutrition({
    code: "12345678",
    nutriscore_grade: "not-applicable",
    nova_group: 9,
    nutriments: {
      proteins_100g: 13.5,
      "energy-kj_100g": 1548.08, // ~370 kcal
    },
  });
  assert.deepEqual(oats, {
    nutriScore: null,
    novaGroup: null,
    proteinPer100g: 13.5,
    kcalPer100g: 370,
    ean: "12345678",
  });

  assert.equal(extractOpenFoodFactsNutrition({}), null);
});

test("computeProteinPerEuro and computeKcalPerEuro compute strictly on KG and L items", () => {
  // Chicken breast: 23.1g/100g at €7.15/kg => (23.1 * 10) / 7.15 = 32.3 g/€
  assert.equal(computeProteinPerEuro(23.1, 7.15, "KG"), 32.3);
  assert.equal(computeKcalPerEuro(110, 7.15, "KG"), 154);

  // Whole milk: 3.2g/100g at €0.94/L => 34.0 g/€
  assert.equal(computeProteinPerEuro(3.2, 0.94, "L"), 34.0);

  // UNIT items must return null (no fabricated weight assumptions)
  assert.equal(computeProteinPerEuro(12.6, 0.2, "UNIT"), null);
  assert.equal(computeProteinPerEuro(null, 5.0, "KG"), null);
});

test("computeNutritionBasketInsights calculates NOVA 4 share excluding non-food items and ranks protein/€", () => {
  const insights = computeNutritionBasketInsights([
    {
      productId: "p-milk",
      productSlug: "leche-entera",
      productName: "Leche Entera",
      category: "Dairy & Eggs",
      purchaseDate: "2026-11-01T10:00:00Z",
      storeName: "Lidl",
      storeBrandHex: "#0050AA",
      totalPrice: 6.0,
      baseUnit: "L",
      pricePerBaseUnit: 0.94,
      nutriScore: "b",
      novaGroup: 1,
      proteinPer100g: 3.2,
      kcalPer100g: 64,
    },
    {
      productId: "p-cookies",
      productSlug: "galletas-tostadas",
      productName: "Galletas Tostadas",
      category: "Bakery",
      purchaseDate: "2026-11-02T10:00:00Z",
      storeName: "Mercadona",
      storeBrandHex: "#00754A",
      totalPrice: 4.0,
      baseUnit: "KG",
      pricePerBaseUnit: 4.0,
      nutriScore: "d",
      novaGroup: 4,
      proteinPer100g: 6.8,
      kcalPer100g: 442,
    },
    {
      // Non-food must be excluded from food spend & NOVA denominators
      productId: "p-soap",
      productSlug: "detergente",
      productName: "Detergente",
      category: "Cleaning & Household",
      purchaseDate: "2026-11-02T10:00:00Z",
      storeName: "Mercadona",
      storeBrandHex: "#00754A",
      totalPrice: 10.0,
      baseUnit: "L",
      pricePerBaseUnit: 3.0,
      novaGroup: 4,
    },
  ]);

  assert.equal(insights.foodSpendTotal, 10);
  assert.equal(insights.taggedNovaSpend, 10);
  assert.equal(insights.nova4Spend, 4);
  assert.equal(insights.nova4SharePercent, 40);
  assert.equal(insights.nova4ItemSharePercent, 50);

  // Protein per € ranking: Milk (34.0 g/€) > Cookies (17.0 g/€)
  assert.equal(insights.proteinPerEuroRankings.length, 2);
  assert.equal(insights.proteinPerEuroRankings[0].productSlug, "leche-entera");
  assert.equal(insights.proteinPerEuroRankings[0].proteinPerEuro, 34.0);
  assert.equal(insights.proteinPerEuroRankings[1].productSlug, "galletas-tostadas");
  assert.equal(insights.proteinPerEuroRankings[1].proteinPerEuro, 17.0);
});
