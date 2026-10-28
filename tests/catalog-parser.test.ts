import test from "node:test";
import assert from "node:assert/strict";
import { parseSpanishCatalogQuantity, STORE_BRAND_MAP } from "../src/lib/catalog/parser";

test("STORE_BRAND_MAP covers core Spanish supermarket chains", () => {
  assert.equal(STORE_BRAND_MAP.mercadona, "Hacendado");
  assert.equal(STORE_BRAND_MAP.lidl, "Milbona");
  assert.equal(STORE_BRAND_MAP.carrefour, "Carrefour");
  assert.equal(STORE_BRAND_MAP.consum, "Consum");
  assert.equal(STORE_BRAND_MAP.dia, "Dia");
  assert.equal(STORE_BRAND_MAP.aldi, "Milsani");
  assert.equal(STORE_BRAND_MAP.alcampo, "Auchan");
});

test("parseSpanishCatalogQuantity parses explicit parenthetical totals", () => {
  const yogur = parseSpanishCatalogQuantity("4 x 125 g (500 g)");
  assert.deepEqual(yogur, { baseUnit: "KG", unitMeasurePerPack: 0.5 });

  const leche = parseSpanishCatalogQuantity("Leche entera (1,5 L)");
  assert.deepEqual(leche, { baseUnit: "L", unitMeasurePerPack: 1.5 });

  const agua = parseSpanishCatalogQuantity("Agua mineral (50 cl)");
  assert.deepEqual(agua, { baseUnit: "L", unitMeasurePerPack: 0.5 });
});

test("parseSpanishCatalogQuantity parses multi-pack formulas", () => {
  const cervezas = parseSpanishCatalogQuantity("6 x 33 cl");
  assert.deepEqual(cervezas, { baseUnit: "L", unitMeasurePerPack: 1.98 });

  const brics = parseSpanishCatalogQuantity("6 x 1L");
  assert.deepEqual(brics, { baseUnit: "L", unitMeasurePerPack: 6 });

  const natillas = parseSpanishCatalogQuantity("4 x 120 g");
  assert.deepEqual(natillas, { baseUnit: "KG", unitMeasurePerPack: 0.48 });
});

test("parseSpanishCatalogQuantity parses single volume and weight measures", () => {
  const aceite = parseSpanishCatalogQuantity("Aceite oliva 1,5 L");
  assert.deepEqual(aceite, { baseUnit: "L", unitMeasurePerPack: 1.5 });

  const cafe = parseSpanishCatalogQuantity("Café molido 250 g");
  assert.deepEqual(cafe, { baseUnit: "KG", unitMeasurePerPack: 0.25 });

  const patatas = parseSpanishCatalogQuantity("Bolsa patatas 3 kg");
  assert.deepEqual(patatas, { baseUnit: "KG", unitMeasurePerPack: 3 });

  const refresco = parseSpanishCatalogQuantity("Refresco 330 ml");
  assert.deepEqual(refresco, { baseUnit: "L", unitMeasurePerPack: 0.33 });
});

test("parseSpanishCatalogQuantity parses unit counts and egg cartons", () => {
  const docena = parseSpanishCatalogQuantity("Huevos camperos docena");
  assert.deepEqual(docena, { baseUnit: "UNIT", unitMeasurePerPack: 12 });

  const huevos = parseSpanishCatalogQuantity("Pack de 6 huevos L");
  assert.deepEqual(huevos, { baseUnit: "UNIT", unitMeasurePerPack: 6 });

  const unidades = parseSpanishCatalogQuantity("10 unidades");
  assert.deepEqual(unidades, { baseUnit: "UNIT", unitMeasurePerPack: 10 });
});

test("parseSpanishCatalogQuantity returns null for empty or non-quantity text", () => {
  assert.equal(parseSpanishCatalogQuantity(""), null);
  assert.equal(parseSpanishCatalogQuantity("Chocolate negro sin azúcar"), null);
});
