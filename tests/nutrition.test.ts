import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNutritionSearchQueries,
  extractOpenFoodFactsNutrition,
  normalizeBarcode,
  pickBestNutritionMatch,
  type CatalogLookupResult,
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

function makeOffCandidate(
  productName: string,
  opts: {
    nutriScore?: "a" | "b" | "c" | "d" | "e" | null;
    novaGroup?: 1 | 2 | 3 | 4 | null;
    proteinPer100g?: number | null;
    kcalPer100g?: number | null;
  } = {}
): CatalogLookupResult {
  return {
    productName,
    brand: "",
    rawQuantityText: "500 g",
    baseUnit: "KG",
    unitMeasurePerPack: 0.5,
    nutrition: {
      nutriScore: opts.nutriScore ?? "a",
      novaGroup: opts.novaGroup ?? 1,
      proteinPer100g: opts.proteinPer100g ?? 1,
      kcalPer100g: opts.kcalPer100g ?? 40,
      ean: "8480000105302",
    },
  };
}

test("buildNutritionSearchQueries prioritizes clean grocery names and limits store-brand hints to packaged categories", () => {
  const freshQueries = buildNutritionSearchQueries(
    "Tomate Cherry Pera 500g",
    "Fruits & Vegetables",
    "mercadona"
  );
  assert.equal(freshQueries[0], "Tomate Cherry Pera");
  assert.ok(!freshQueries.some((q) => /hacendado/i.test(q)));
  assert.ok(freshQueries.length <= 3);

  const packagedQueries = buildNutritionSearchQueries(
    "Galletas Tostadas 4x200g",
    "Bakery",
    "mercadona"
  );
  assert.equal(packagedQueries[0], "Galletas Tostadas");
  assert.ok(packagedQueries.some((q) => /Hacendado/i.test(q)));
});

test("pickBestNutritionMatch blocks processed snack matches for fresh produce, meat, and fish while matching pantry staples", () => {
  // Fresh produce should reject fried/crispy/processed snacks & jams/drinks
  const onionMatch = pickBestNutritionMatch("Cebolla", "Fruits & Vegetables", [
    makeOffCandidate("Cebolla frita crujiente", { nutriScore: "d", novaGroup: 4, proteinPer100g: 6 }),
    makeOffCandidate("Cebolla en conserva", { nutriScore: "c", novaGroup: 3, proteinPer100g: 1 }),
    makeOffCandidate("Cebollas frescas", { nutriScore: "a", novaGroup: 1, proteinPer100g: 1.1 }),
  ]);
  assert.equal(onionMatch?.productName, "Cebollas frescas");

  // Mandarina should never accept Mandarina soft drinks or jams when no fresh match exists
  const tangerineOnlyProcessed = pickBestNutritionMatch("Mandarina", "Fruits & Vegetables", [
    makeOffCandidate("Refresco de mandarina", { nutriScore: "e", novaGroup: 4, proteinPer100g: 0 }),
    makeOffCandidate("Mermelada extra de mandarina", { nutriScore: "d", novaGroup: 4, proteinPer100g: 0.4 }),
  ]);
  assert.equal(tangerineOnlyProcessed, null);

  // Fresh meat rejects breaded nuggets
  const chickenMatch = pickBestNutritionMatch("Pechuga de Pollo Entera", "Meat & Poultry", [
    makeOffCandidate("Nuggets de pechuga de pollo", { nutriScore: "c", novaGroup: 4, proteinPer100g: 14 }),
    makeOffCandidate("Pechuga de pollo entera fresca", { nutriScore: "a", novaGroup: 1, proteinPer100g: 23 }),
  ]);
  assert.equal(chickenMatch?.productName, "Pechuga de pollo entera fresca");

  // Packaged categories (Pantry / Bakery) allow NOVA 3/4 and modifiers like caldo/galletas
  const brothMatch = pickBestNutritionMatch("Caldo de Carne con Sofrito", "Pantry", [
    makeOffCandidate("Caldo de carne con sofrito", { nutriScore: "c", novaGroup: 3, proteinPer100g: 1.2 }),
  ]);
  assert.equal(brothMatch?.productName, "Caldo de carne con sofrito");

  const cookieMatch = pickBestNutritionMatch("Galletas Tostadas", "Bakery", [
    makeOffCandidate("Galletas tostadas tradicionales", { nutriScore: "d", novaGroup: 4, proteinPer100g: 6.8 }),
  ]);
  assert.equal(cookieMatch?.productName, "Galletas tostadas tradicionales");
});
