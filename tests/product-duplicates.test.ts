import test from "node:test";
import assert from "node:assert/strict";
import {
  computeNameSimilarity,
  findDuplicateProductGroups,
  normalizeProductNameForMatching,
  type DuplicateCandidateProduct,
} from "../src/lib/catalog/duplicates";

test("normalizeProductNameForMatching strips accents, Spanish store brands, and pack suffixes", () => {
  assert.equal(
    normalizeProductNameForMatching("Leche Entera Hacendado Brick 1L"),
    "leche entera"
  );
  assert.equal(
    normalizeProductNameForMatching("Leche Entera Milbona 6x1L"),
    "leche entera"
  );
  assert.equal(
    normalizeProductNameForMatching("Plátano de Canarias IGP 1kg"),
    "platano canarias igp"
  );
});

test("findDuplicateProductGroups clusters store-specific variants and picks highest-sighting survivor", () => {
  const products: DuplicateCandidateProduct[] = [
    {
      id: "p1",
      slug: "leche-entera",
      displayName: "Leche Entera",
      category: "Dairy & Eggs",
      baseUnit: "L",
      isStaple: true,
      sightingsCount: 14,
      aliasesCount: 3,
    },
    {
      id: "p2",
      slug: "leche-entera-hacendado-1l",
      displayName: "Leche Entera Hacendado 1L",
      category: "Dairy & Eggs",
      baseUnit: "L",
      isStaple: false,
      sightingsCount: 2,
      aliasesCount: 1,
    },
    {
      id: "p3",
      slug: "leche-entera-milbona-pack-6",
      displayName: "Leche Entera Milbona Pack 6x1L",
      category: "Dairy & Eggs",
      baseUnit: "UNIT",
      isStaple: false,
      sightingsCount: 1,
      aliasesCount: 1,
    },
    {
      id: "p4",
      slug: "aceite-oliva-virgen-extra",
      displayName: "Aceite de Oliva Virgen Extra",
      category: "Oils & Condiments",
      baseUnit: "L",
      isStaple: true,
      sightingsCount: 9,
      aliasesCount: 2,
    },
    {
      id: "p5",
      slug: "pechuga-de-pollo",
      displayName: "Pechuga de Pollo",
      category: "Meat & Poultry",
      baseUnit: "KG",
      isStaple: true,
      sightingsCount: 7,
      aliasesCount: 2,
    },
  ];

  const groups = findDuplicateProductGroups(products);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].survivorId, "p1");
  assert.equal(groups[0].products.length, 3);
  assert.equal(groups[0].hasBaseUnitMismatch, true);
});

test("computeNameSimilarity prevents false positives on distinct grocery staples", () => {
  const sim = computeNameSimilarity("Leche Entera", "Aceite de Oliva Virgen Extra");
  assert.ok(sim < 0.35, `Expected low similarity, got ${sim}`);

  const variantSim = computeNameSimilarity(
    "Yogur Natural 4x125g",
    "Yogur Natural Hacendado"
  );
  assert.equal(variantSim, 1);
});
