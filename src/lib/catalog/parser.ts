export interface ProductNutritionMeta {
  nutriScore: "a" | "b" | "c" | "d" | "e" | null;
  novaGroup: 1 | 2 | 3 | 4 | null;
  proteinPer100g: number | null;
  kcalPer100g: number | null;
  ean: string | null;
}

export interface CatalogLookupResult {
  productName: string;
  brand: string;
  rawQuantityText: string;
  baseUnit: "KG" | "L" | "UNIT";
  unitMeasurePerPack: number;
  hasParsedQuantity?: boolean;
  ean?: string | null;
  nutrition?: ProductNutritionMeta | null;
}

export const STORE_BRAND_MAP: Record<string, string> = {
  mercadona: "Hacendado",
  lidl: "Milbona",
  carrefour: "Carrefour",
  consum: "Consum",
  dia: "Dia",
  aldi: "Milsani",
  alcampo: "Auchan",
  mas: "MAS",
  "cash-fresh": "Cash Fresh",
};

/**
 * Normalizes and validates an EAN-8 / UPC / EAN-13 / GTIN-14 barcode string.
 */
export function normalizeBarcode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[\s-]+/g, "").trim();
  if (!/^\d{8,14}$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

/**
 * Extracts lightweight nutritional metadata and EAN from an OpenFoodFacts product payload.
 */
export function extractOpenFoodFactsNutrition(
  raw: Record<string, unknown>
): ProductNutritionMeta | null {
  if (!raw || typeof raw !== "object") return null;

  const rawGrade = String(
    raw.nutriscore_grade ?? raw.nutrition_grades ?? ""
  )
    .trim()
    .toLowerCase();
  const nutriScore: ProductNutritionMeta["nutriScore"] =
    rawGrade === "a" ||
    rawGrade === "b" ||
    rawGrade === "c" ||
    rawGrade === "d" ||
    rawGrade === "e"
      ? rawGrade
      : null;

  let novaGroup: ProductNutritionMeta["novaGroup"] = null;
  const rawNova = raw.nova_group ?? raw.nova_groups;
  if (rawNova !== null && rawNova !== undefined) {
    const parsedNova = parseInt(String(rawNova).trim().charAt(0), 10);
    if (parsedNova === 1 || parsedNova === 2 || parsedNova === 3 || parsedNova === 4) {
      novaGroup = parsedNova;
    }
  }

  const nutriments =
    raw.nutriments && typeof raw.nutriments === "object"
      ? (raw.nutriments as Record<string, unknown>)
      : null;

  let proteinPer100g: number | null = null;
  if (nutriments && nutriments.proteins_100g !== undefined && nutriments.proteins_100g !== null) {
    const prot = Number(nutriments.proteins_100g);
    if (Number.isFinite(prot) && prot >= 0 && prot <= 100) {
      proteinPer100g = Number(prot.toFixed(2));
    }
  }

  let kcalPer100g: number | null = null;
  if (nutriments) {
    const directKcal = nutriments["energy-kcal_100g"];
    const directKj = nutriments["energy-kj_100g"];
    const fallbackEnergy = nutriments.energy_100g;

    if (directKcal !== undefined && directKcal !== null) {
      const kcal = Number(directKcal);
      if (Number.isFinite(kcal) && kcal >= 0 && kcal <= 1000) {
        kcalPer100g = Number(kcal.toFixed(1));
      }
    } else if (directKj !== undefined && directKj !== null) {
      const kj = Number(directKj);
      if (Number.isFinite(kj) && kj >= 0) {
        const kcal = kj / 4.184;
        if (kcal <= 1000) {
          kcalPer100g = Number(kcal.toFixed(1));
        }
      }
    } else if (fallbackEnergy !== undefined && fallbackEnergy !== null) {
      const e = Number(fallbackEnergy);
      const unit = String(nutriments.energy_unit ?? "").toLowerCase();
      if (Number.isFinite(e) && e >= 0) {
        const kcal = unit === "kcal" ? e : e / 4.184;
        if (kcal <= 1000) {
          kcalPer100g = Number(kcal.toFixed(1));
        }
      }
    }
  }

  const ean = normalizeBarcode(typeof raw.code === "string" || typeof raw.code === "number" ? String(raw.code) : null);

  if (
    nutriScore === null &&
    novaGroup === null &&
    proteinPer100g === null &&
    kcalPer100g === null &&
    ean === null
  ) {
    return null;
  }

  return {
    nutriScore,
    novaGroup,
    proteinPer100g,
    kcalPer100g,
    ean,
  };
}

/**
 * Parses Spanish product package strings into canonical baseUnit and single-pack measure.
 * Handles formats like:
 * - "4 x 125 g (500 g)"
 * - "6 x 125g"
 * - "1,5 L"
 * - "6 x 33 cl"
 * - "500 g"
 * - "12 unidades"
 */
export function parseSpanishCatalogQuantity(
  quantityStr: string
): { baseUnit: "KG" | "L" | "UNIT"; unitMeasurePerPack: number } | null {
  if (!quantityStr) return null;
  const str = quantityStr.trim().toLowerCase();

  // 1. Check for explicit total in parentheses, e.g. "4 x 125 g (500 g)" or "(1,5 L)"
  const parenMatch = str.match(/\(\s*(\d+(?:[.,]\d+)?)\s*(g|gr|gramos?|kg|kilos?|l|litros?|cl|ml)\s*\)/i);
  if (parenMatch) {
    const val = parseFloat(parenMatch[1].replace(",", "."));
    const unit = parenMatch[2].toLowerCase();
    if (!isNaN(val) && val > 0) {
      if (unit.startsWith("k")) return { baseUnit: "KG", unitMeasurePerPack: Number(val.toFixed(3)) };
      if (unit.startsWith("g")) return { baseUnit: "KG", unitMeasurePerPack: Number((val / 1000).toFixed(3)) };
      if (unit === "l" || unit.startsWith("lit")) return { baseUnit: "L", unitMeasurePerPack: Number(val.toFixed(3)) };
      if (unit === "cl") return { baseUnit: "L", unitMeasurePerPack: Number((val / 100).toFixed(3)) };
      if (unit === "ml") return { baseUnit: "L", unitMeasurePerPack: Number((val / 1000).toFixed(3)) };
    }
  }

  // 2. Check for multi-pack formula: e.g. "4 x 125 g", "6 x 33 cl", "6 x 1L"
  const multiMatch = str.match(/(\d+)\s*[xX*]\s*(\d+(?:[.,]\d+)?)\s*(g|gr|gramos?|kg|kilos?|l|litros?|cl|ml)\b/i);
  if (multiMatch) {
    const count = parseInt(multiMatch[1], 10);
    const val = parseFloat(multiMatch[2].replace(",", "."));
    const unit = multiMatch[3].toLowerCase();
    if (count > 0 && !isNaN(val) && val > 0) {
      const total = count * val;
      if (unit.startsWith("k")) return { baseUnit: "KG", unitMeasurePerPack: Number(total.toFixed(3)) };
      if (unit.startsWith("g")) return { baseUnit: "KG", unitMeasurePerPack: Number((total / 1000).toFixed(3)) };
      if (unit === "l" || unit.startsWith("lit")) return { baseUnit: "L", unitMeasurePerPack: Number(total.toFixed(3)) };
      if (unit === "cl") return { baseUnit: "L", unitMeasurePerPack: Number((total / 100).toFixed(3)) };
      if (unit === "ml") return { baseUnit: "L", unitMeasurePerPack: Number((total / 1000).toFixed(3)) };
    }
  }

  // 3. Single volume/weight measure: e.g. "1,5 L", "500 g", "33 cl", "1 kg"
  const singleMatch = str.match(/(\d+(?:[.,]\d+)?)\s*(g|gr|gramos?|kg|kilos?|l|litros?|cl|ml|uds?|unidades?|piezas?)\b/i);
  if (singleMatch) {
    const val = parseFloat(singleMatch[1].replace(",", "."));
    const unit = singleMatch[2].toLowerCase();
    if (!isNaN(val) && val > 0) {
      if (unit.startsWith("k")) return { baseUnit: "KG", unitMeasurePerPack: Number(val.toFixed(3)) };
      if (unit.startsWith("g")) return { baseUnit: "KG", unitMeasurePerPack: Number((val / 1000).toFixed(3)) };
      if (unit === "l" || unit.startsWith("lit")) return { baseUnit: "L", unitMeasurePerPack: Number(val.toFixed(3)) };
      if (unit === "cl") return { baseUnit: "L", unitMeasurePerPack: Number((val / 100).toFixed(3)) };
      if (unit === "ml") return { baseUnit: "L", unitMeasurePerPack: Number((val / 1000).toFixed(3)) };
      if (unit.startsWith("ud") || unit.startsWith("piez")) {
        return { baseUnit: "UNIT", unitMeasurePerPack: Math.max(1, Math.round(val)) };
      }
    }
  }

  // 4. Units: e.g. "12 unidades", "6 huevos", "docena"
  if (str.includes("docena")) {
    return { baseUnit: "UNIT", unitMeasurePerPack: 12 };
  }
  const unitMatch = str.match(/(?:pack\s+de\s+|pack\s+)?(\d+)\s*(?:uds?|unidades?|piezas?|huevos?|botellas?|latas?|sobres?)/i);
  if (unitMatch) {
    const count = parseInt(unitMatch[1], 10);
    if (!isNaN(count) && count > 0) {
      return { baseUnit: "UNIT", unitMeasurePerPack: count };
    }
  }

  return null;
}
