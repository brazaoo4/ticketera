import test from "node:test";
import assert from "node:assert/strict";
import {
  computeNameSimilarity,
  findDuplicateProductGroups,
  getGroupPairKeys,
  isValidDuplicatePairKey,
  makeDuplicatePairKey,
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

test("makeDuplicatePairKey, isValidDuplicatePairKey, and getGroupPairKeys normalize order and reject invalid keys", () => {
  assert.equal(makeDuplicatePairKey("prod-b", "prod-a"), "prod-a::prod-b");
  assert.equal(makeDuplicatePairKey(" prod-a ", "prod-b"), "prod-a::prod-b");
  assert.equal(makeDuplicatePairKey("prod-a", "prod-a"), "");
  assert.equal(makeDuplicatePairKey("", "prod-b"), "");

  assert.equal(isValidDuplicatePairKey("prod-a::prod-b"), true);
  assert.equal(isValidDuplicatePairKey("prod-b::prod-a"), false);
  assert.equal(isValidDuplicatePairKey("prod-a::prod-a"), false);
  assert.equal(isValidDuplicatePairKey("prod-a::prod-b::prod-c"), false);
  assert.equal(isValidDuplicatePairKey("invalid"), false);

  assert.deepEqual(getGroupPairKeys(["p3", "p1", "p2", "p1"]), [
    "p1::p2",
    "p1::p3",
    "p2::p3",
  ]);
});

test("findDuplicateProductGroups skips dismissed pairs while still detecting new genuine duplicates", () => {
  const redPepper: DuplicateCandidateProduct = {
    id: "p-red",
    slug: "pimiento-rojo",
    displayName: "Pimiento Rojo",
    category: "Fruits & Vegetables",
    baseUnit: "KG",
    isStaple: false,
    sightingsCount: 5,
    aliasesCount: 1,
  };
  const greenPepper: DuplicateCandidateProduct = {
    id: "p-green",
    slug: "pimiento-verde",
    displayName: "Pimiento Verde",
    category: "Fruits & Vegetables",
    baseUnit: "KG",
    isStaple: false,
    sightingsCount: 1,
    aliasesCount: 1,
  };
  const cherryNeg: DuplicateCandidateProduct = {
    id: "p-cherry-negro",
    slug: "tomate-cherry-pera-negro",
    displayName: "Tomate Cherry Pera Negro",
    category: "Fruits & Vegetables",
    baseUnit: "KG",
    isStaple: false,
    sightingsCount: 2,
    aliasesCount: 1,
  };
  const cherryBase: DuplicateCandidateProduct = {
    id: "p-cherry",
    slug: "tomate-cherry",
    displayName: "Tomate Cherry",
    category: "Fruits & Vegetables",
    baseUnit: "KG",
    isStaple: false,
    sightingsCount: 1,
    aliasesCount: 1,
  };

  // Both pairs start out flagged as duplicate suggestions
  const initialGroups = findDuplicateProductGroups([
    redPepper,
    greenPepper,
    cherryNeg,
    cherryBase,
  ]);
  assert.equal(initialGroups.length, 2);

  // Dismissing one false-positive pair hides only that group without affecting others
  const afterOneDismiss = findDuplicateProductGroups(
    [redPepper, greenPepper, cherryNeg, cherryBase],
    [makeDuplicatePairKey(redPepper.id, greenPepper.id)]
  );
  assert.equal(afterOneDismiss.length, 1);
  assert.equal(afterOneDismiss[0].survivorId, "p-cherry-negro");

  // Introducing a genuine duplicate for a dismissed item still surfaces the new match
  const redPepperMercadona: DuplicateCandidateProduct = {
    id: "p-red-merc",
    slug: "pimiento-rojo-mercadona",
    displayName: "Pimiento Rojo Hacendado",
    category: "Fruits & Vegetables",
    baseUnit: "KG",
    isStaple: false,
    sightingsCount: 1,
    aliasesCount: 1,
  };
  const withNewMatch = findDuplicateProductGroups(
    [redPepper, greenPepper, redPepperMercadona],
    [makeDuplicatePairKey(redPepper.id, greenPepper.id)]
  );
  assert.equal(withNewMatch.length, 1);
  assert.deepEqual(
    withNewMatch[0].products.map((p) => p.id).sort(),
    ["p-red", "p-red-merc"]
  );
});

test("dismissing all pairs of a 3-product cluster suppresses the entire cluster", () => {
  const cluster: DuplicateCandidateProduct[] = [
    {
      id: "p1",
      slug: "aceitunas-negras",
      displayName: "Aceitunas Negras",
      category: "Pantry",
      baseUnit: "UNIT",
      isStaple: false,
      sightingsCount: 3,
      aliasesCount: 1,
    },
    {
      id: "p2",
      slug: "aceitunas-negras-sin-hueso",
      displayName: "Aceitunas Negras Sin Hueso",
      category: "Pantry",
      baseUnit: "UNIT",
      isStaple: false,
      sightingsCount: 1,
      aliasesCount: 1,
    },
    {
      id: "p3",
      slug: "aceitunas-negras-rellenas",
      displayName: "Aceitunas Negras Rellenas",
      category: "Pantry",
      baseUnit: "UNIT",
      isStaple: false,
      sightingsCount: 1,
      aliasesCount: 1,
    },
  ];

  assert.equal(findDuplicateProductGroups(cluster).length, 1);
  const allPairs = getGroupPairKeys(cluster.map((p) => p.id));
  assert.equal(allPairs.length, 3);
  assert.equal(findDuplicateProductGroups(cluster, allPairs).length, 0);
});
