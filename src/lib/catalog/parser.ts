export interface CatalogLookupResult {
  productName: string;
  brand: string;
  rawQuantityText: string;
  baseUnit: "KG" | "L" | "UNIT";
  unitMeasurePerPack: number;
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
