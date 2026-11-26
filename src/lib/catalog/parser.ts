import {
  computeNameSimilarity,
  normalizeProductNameForMatching,
} from "./duplicates";

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

const FRESH_PRODUCE_OR_MEAT_CATEGORIES = new Set([
  "Fruits & Vegetables",
  "Meat & Poultry",
  "Fish & Seafood",
]);

const PRODUCE_OR_FISH_CATEGORIES = new Set([
  "Fruits & Vegetables",
  "Fish & Seafood",
]);

const PROCESSED_MODIFIER_WORDS = new Set([
  "frito",
  "frita",
  "fritos",
  "fritas",
  "crujiente",
  "crujientes",
  "salsa",
  "salsas",
  "mermelada",
  "mermeladas",
  "zumo",
  "zumos",
  "nectar",
  "refresco",
  "refrescos",
  "licor",
  "licores",
  "helado",
  "helados",
  "caramelo",
  "caramelos",
  "galleta",
  "galletas",
  "bizcocho",
  "bizcochos",
  "chips",
  "empanado",
  "empanada",
  "empanados",
  "rebozado",
  "rebozada",
  "rebozados",
  "nugget",
  "nuggets",
  "salchicha",
  "salchichas",
  "caldo",
  "caldos",
  "crema",
  "cremas",
  "sopa",
  "sopas",
  "conserva",
  "conservas",
  "almibar",
  "batido",
  "batidos",
  "yogur",
  "yogures",
  "tarta",
  "tartas",
  "pastel",
  "pasteles",
  "chocolate",
  "chocolates",
  "snak",
  "snack",
  "snacks",
  "aperitivo",
  "aperitivos",
  "croqueta",
  "croquetas",
  "pizza",
  "pizzas",
  "lasana",
]);

const NUTRITION_STOP_WORDS = new Set([
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "con",
  "sin",
  "en",
  "al",
  "a",
  "y",
  "para",
  "por",
]);

function stripPackAndSizeTokens(input: string): string {
  return input
    .replace(
      /\b\d+\s*[xX*]\s*\d+(?:[.,]\d+)?\s*(?:kg|kilos?|g|gr|gramos?|l|litros?|cl|ml|ud|uds)?\b/gi,
      " "
    )
    .replace(
      /\b\d+(?:[.,]\d+)?\s*(?:kg|kilos?|g|gr|gramos?|l|litros?|cl|ml|ud|uds|unidades?|piezas?)\b/gi,
      " "
    )
    .replace(/[^\w\s\u00C0-\u017F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularizeSpanishToken(token: string): string {
  if (token.length >= 5 && /(?:iones|ones|anes|ales|eles)$/.test(token)) {
    return token.slice(0, -2);
  }
  if (token.length >= 4 && token.endsWith("s") && !token.endsWith("is")) {
    return token.slice(0, -1);
  }
  return token;
}

function tokenizeNutritionText(text: string): {
  rawWords: string[];
  stemmed: string[];
} {
  const ascii = stripPackAndSizeTokens(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const rawWords = ascii
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !NUTRITION_STOP_WORDS.has(w));

  const stemmed = Array.from(new Set(rawWords.map(singularizeSpanishToken)));
  return { rawWords, stemmed };
}

/**
 * Builds ordered OpenFoodFacts search queries for a grocery product.
 * Keeps the clean food name first, then adds store private-label / core token fallbacks.
 */
export function buildNutritionSearchQueries(
  displayName: string,
  category?: string,
  storeSlug?: string
): string[] {
  const cleanPrimary = stripPackAndSizeTokens(displayName.trim());
  const queries: string[] = [];
  const seenLower = new Set<string>();

  const pushUnique = (q: string) => {
    const trimmed = q.replace(/\s+/g, " ").trim();
    if (trimmed.length < 2) return;
    const key = trimmed.toLowerCase();
    if (seenLower.has(key)) return;
    seenLower.add(key);
    queries.push(trimmed);
  };

  pushUnique(cleanPrimary);

  const isFresh = FRESH_PRODUCE_OR_MEAT_CATEGORIES.has(category || "");
  if (!isFresh && storeSlug) {
    const storeKey = storeSlug.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const privateBrand = STORE_BRAND_MAP[storeKey] || "";
    if (
      privateBrand &&
      cleanPrimary &&
      !cleanPrimary.toLowerCase().includes(privateBrand.toLowerCase())
    ) {
      pushUnique(`${cleanPrimary} ${privateBrand}`);
    }
  }

  const normalizedFallback = normalizeProductNameForMatching(displayName);
  pushUnique(normalizedFallback);

  const normTokens = normalizedFallback.split(/\s+/).filter(Boolean);
  if (normTokens.length >= 3) {
    pushUnique(normTokens.slice(0, 2).join(" "));
  }

  return queries.slice(0, 3);
}

/**
 * Selects the best-matching OpenFoodFacts candidate with nutrition metadata,
 * guarding fresh produce, meat, and fish from processed-snack false positives.
 */
export function pickBestNutritionMatch(
  productName: string,
  category: string,
  candidates: CatalogLookupResult[]
): CatalogLookupResult | null {
  const queryInfo = tokenizeNutritionText(productName);
  if (queryInfo.stemmed.length === 0) return null;

  const queryStemSet = new Set(queryInfo.stemmed);
  const queryHasProcessedModifier = queryInfo.rawWords.some((w) =>
    PROCESSED_MODIFIER_WORDS.has(w)
  );
  const isFreshCategory = FRESH_PRODUCE_OR_MEAT_CATEGORIES.has(category);
  const isProduceOrFish = PRODUCE_OR_FISH_CATEGORIES.has(category);

  let bestCandidate: CatalogLookupResult | null = null;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const nut = candidate.nutrition;
    if (!nut) continue;
    const hasAnyNutrition =
      nut.nutriScore !== null ||
      nut.novaGroup !== null ||
      nut.proteinPer100g !== null ||
      nut.kcalPer100g !== null;
    if (!hasAnyNutrition) continue;

    const candInfo = tokenizeNutritionText(candidate.productName);
    if (candInfo.stemmed.length === 0) continue;

    if (isFreshCategory && !queryHasProcessedModifier) {
      if (candInfo.rawWords.some((w) => PROCESSED_MODIFIER_WORDS.has(w))) {
        continue;
      }
      if (nut.novaGroup === 4) {
        continue;
      }
      if (isProduceOrFish && queryInfo.stemmed.length <= 2 && nut.novaGroup === 3) {
        continue;
      }
    }

    const candStemSet = new Set(candInfo.stemmed);
    let shared = 0;
    for (const token of queryStemSet) {
      if (candStemSet.has(token)) shared++;
    }
    if (shared === 0) continue;

    const unionSize = queryStemSet.size + candStemSet.size - shared;
    const tokenJaccard = unionSize > 0 ? shared / unionSize : 0;
    const coverage = shared / queryStemSet.size;
    const nameSim = computeNameSimilarity(productName, candidate.productName);
    const combinedSim = Math.max(nameSim, 0.6 * tokenJaccard + 0.4 * coverage);

    if (combinedSim < 0.35) continue;

    const extraWordPenalty = Math.min(
      0.25,
      Math.max(0, candStemSet.size - queryStemSet.size) * 0.03
    );
    const populatedFields = [
      nut.nutriScore !== null,
      nut.novaGroup !== null,
      nut.proteinPer100g !== null,
      nut.kcalPer100g !== null,
    ].filter(Boolean).length;

    const score =
      combinedSim + 0.25 * coverage - extraWordPenalty + populatedFields * 0.04;

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}
