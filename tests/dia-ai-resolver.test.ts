import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPosItemResolvePrompt,
  normalizeCanonicalCategory,
  parseResolvedItemsJson,
} from "../src/lib/ai/resolve-items";

test("normalizeCanonicalCategory maps English, Spanish, and unknown categories safely", () => {
  assert.equal(normalizeCanonicalCategory("Beverages"), "Beverages");
  assert.equal(normalizeCanonicalCategory("beverages"), "Beverages");
  assert.equal(normalizeCanonicalCategory("Bebidas"), "Beverages");
  assert.equal(normalizeCanonicalCategory("Lácteos y Huevos"), "Dairy & Eggs");
  assert.equal(normalizeCanonicalCategory("Fruta y Verdura"), "Fruits & Vegetables");
  assert.equal(normalizeCanonicalCategory("Nonexistent Category"), "Other");
  assert.equal(normalizeCanonicalCategory(null), "Other");
});

test("buildPosItemResolvePrompt formats store, catalog products, and raw POS items", () => {
  const prompt = buildPosItemResolvePrompt(
    "DIA",
    [
      {
        index: 0,
        rawName: "RED BULL SIN AZÚCAR",
        quantity: 2,
        unitPrice: 1.69,
        totalPrice: 3.38,
        isVariableWeight: false,
        weight: 0,
        discountHints: ["RED BULL 250 ML"],
      },
    ],
    [
      {
        displayName: "Aceite de Oliva Virgen Extra",
        category: "Oils & Condiments",
        baseUnit: "L",
      },
    ]
  );

  assert.ok(prompt.includes("Supermarket: DIA"));
  assert.ok(prompt.includes("- Aceite de Oliva Virgen Extra [Oils & Condiments | L]"));
  assert.ok(prompt.includes("RED BULL SIN AZÚCAR"));
  assert.ok(prompt.includes("RED BULL 250 ML"));
});

test("parseResolvedItemsJson parses plain and fenced JSON with normalization fallbacks", () => {
  const plainJson = JSON.stringify({
    items: [
      {
        index: 0,
        suggested_name: "Aceite de Oliva Virgen Extra",
        category: "Aceites",
        base_unit: "l",
        unit_measure_per_pack: 1,
        is_bag_or_fee: false,
      },
      {
        index: 1,
        suggested_name: "Pasta de Dientes con Flúor y Calcio",
        suggested_category: "Cuidado Personal",
        base_unit: "UNIT",
        unit_measure_per_pack: -2,
        is_bag_or_fee: false,
      },
    ],
  });

  const parsedPlain = parseResolvedItemsJson(plainJson);
  assert.equal(parsedPlain.length, 2);
  assert.deepEqual(parsedPlain[0], {
    index: 0,
    suggested_name: "Aceite de Oliva Virgen Extra",
    category: "Oils & Condiments",
    base_unit: "L",
    unit_measure_per_pack: 1,
    is_bag_or_fee: false,
  });
  assert.deepEqual(parsedPlain[1], {
    index: 1,
    suggested_name: "Pasta de Dientes con Flúor y Calcio",
    category: "Personal Care",
    base_unit: "UNIT",
    unit_measure_per_pack: 1,
    is_bag_or_fee: false,
  });

  const fencedJson = `\`\`\`json
{
  "items": [
    {
      "index": 3,
      "suggested_name": "Red Bull Sin Azúcar",
      "category": "UnknownFoo",
      "base_unit": "L",
      "unit_measure_per_pack": 0.25,
      "is_bag_or_fee": false
    }
  ]
}
\`\`\``;

  const parsedFenced = parseResolvedItemsJson(fencedJson);
  assert.equal(parsedFenced.length, 1);
  assert.equal(parsedFenced[0].category, "Other");
  assert.equal(parsedFenced[0].unit_measure_per_pack, 0.25);
});
