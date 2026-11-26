import {
  type CatalogLookupResult,
  STORE_BRAND_MAP,
  buildNutritionSearchQueries,
  extractOpenFoodFactsNutrition,
  normalizeBarcode,
  parseSpanishCatalogQuantity,
  pickBestNutritionMatch,
} from "./parser";

const OFF_FIELDS =
  "code,product_name,product_name_es,brands,quantity,nutriscore_grade,nutrition_grades,nova_group,nova_groups,nutriments";
const OFF_TIMEOUT_MS = 8000;

function getUserAgent(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://github.com/brazaoo4/ticketera";
  return `Ticketera/3.0.0 (+${appUrl})`;
}

function mapOffProductToLookupResult(
  p: Record<string, unknown>,
  options: { requireQuantity: boolean; fallbackEan?: string }
): CatalogLookupResult | null {
  const productName =
    (p.product_name_es as string) || (p.product_name as string) || "";
  if (!productName) return null;

  const brand = (p.brands as string) || "";
  const rawQuantityText = (p.quantity as string) || "";
  const parsed = rawQuantityText
    ? parseSpanishCatalogQuantity(rawQuantityText)
    : null;
  if (options.requireQuantity && !parsed) return null;

  const nutrition = extractOpenFoodFactsNutrition(
    options.fallbackEan ? { ...p, code: options.fallbackEan } : p
  );
  const ean =
    options.fallbackEan ||
    nutrition?.ean ||
    normalizeBarcode(
      typeof p.code === "string" || typeof p.code === "number"
        ? String(p.code)
        : null
    );

  return {
    productName: productName.trim(),
    brand: brand.trim(),
    rawQuantityText: rawQuantityText.trim(),
    baseUnit: parsed?.baseUnit ?? "UNIT",
    unitMeasurePerPack: parsed?.unitMeasurePerPack ?? 1,
    hasParsedQuantity: Boolean(parsed),
    ean,
    nutrition,
  };
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function fetchOffSearchJson(
  query: string,
  pageSize: number
): Promise<{ ok: boolean; products: Array<Record<string, unknown>>; hadError: boolean }> {
  const offUrl = `https://es.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
    query
  )}&search_simple=1&action=process&json=1&page_size=${pageSize}&fields=${encodeURIComponent(
    OFF_FIELDS
  )}`;

  let hadError = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    try {
      const response = await fetch(offUrl, {
        headers: {
          "User-Agent": getUserAgent(),
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          products?: Array<Record<string, unknown>>;
        };
        return {
          ok: true,
          products: Array.isArray(data.products) ? data.products : [],
          hadError: false,
        };
      }

      hadError = isRetryableStatus(response.status);
      if (!hadError) {
        return { ok: false, products: [], hadError: true };
      }
    } catch (fetchErr) {
      hadError = true;
      console.warn(
        `[CatalogLookup] Fetch attempt ${attempt + 1} failed for query:`,
        query,
        fetchErr
      );
    }
  }

  return { ok: false, products: [], hadError };
}

/**
 * Searches OpenFoodFacts Spain by product name (optionally biased by store private label),
 * returning parsed Spanish package quantities alongside cached nutrition metadata and EANs.
 */
export async function searchOpenFoodFacts(params: {
  query: string;
  store?: string;
  requireQuantity?: boolean;
}): Promise<CatalogLookupResult[]> {
  const rawQuery = params.query.trim();
  if (!rawQuery || rawQuery.length < 2) return [];

  const cleanQuery = rawQuery
    .replace(/[^\w\s\u00C0-\u017F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleanQuery.length < 2) return [];

  const storeKey = (params.store || "").toLowerCase().replace(/[^a-z0-9]/g, "-");
  const privateBrand = STORE_BRAND_MAP[storeKey] || "";

  const queriesToTry: string[] = [];
  if (privateBrand && !cleanQuery.toLowerCase().includes(privateBrand.toLowerCase())) {
    queriesToTry.push(`${cleanQuery} ${privateBrand}`);
  }
  queriesToTry.push(cleanQuery);

  let rawProducts: Array<Record<string, unknown>> = [];

  for (const q of queriesToTry) {
    const res = await fetchOffSearchJson(q, 6);
    if (res.ok && res.products.length > 0) {
      rawProducts = res.products;
      break;
    }
  }

  const matches: CatalogLookupResult[] = [];
  const seenCombos = new Set<string>();
  const requireQuantity = params.requireQuantity ?? true;

  for (const p of rawProducts) {
    const mapped = mapOffProductToLookupResult(p, { requireQuantity });
    if (!mapped) continue;

    const dedupeKey = `${mapped.baseUnit}__${mapped.unitMeasurePerPack}__${mapped.productName
      .toLowerCase()
      .slice(0, 20)}`;
    if (seenCombos.has(dedupeKey)) continue;
    seenCombos.add(dedupeKey);

    matches.push(mapped);
    if (matches.length >= 6) break;
  }

  return matches;
}

/**
 * Queries OpenFoodFacts specifically for nutritional metadata using barcode fast-path
 * followed by category-aware query generation, retry-once resilience, and fresh-food filtering.
 */
export async function searchOpenFoodFactsForNutrition(params: {
  query: string;
  category?: string;
  store?: string;
  ean?: string | null;
}): Promise<{ match: CatalogLookupResult | null; hadNetworkError: boolean }> {
  const parsedEan = normalizeBarcode(params.ean);
  if (parsedEan) {
    const byBarcode = await lookupOpenFoodFactsByBarcode(parsedEan);
    if (
      byBarcode?.nutrition &&
      (byBarcode.nutrition.nutriScore !== null ||
        byBarcode.nutrition.novaGroup !== null ||
        byBarcode.nutrition.proteinPer100g !== null ||
        byBarcode.nutrition.kcalPer100g !== null)
    ) {
      return { match: byBarcode, hadNetworkError: false };
    }
  }

  const queries = buildNutritionSearchQueries(
    params.query,
    params.category,
    params.store
  );
  if (queries.length === 0) {
    return { match: null, hadNetworkError: false };
  }

  let anyRequestSucceeded = false;
  let anyNetworkError = false;

  for (const q of queries) {
    const res = await fetchOffSearchJson(q, 12);
    if (res.ok) {
      anyRequestSucceeded = true;
      const mapped = res.products
        .map((p) => mapOffProductToLookupResult(p, { requireQuantity: false }))
        .filter((item): item is CatalogLookupResult => item !== null);
      const best = pickBestNutritionMatch(
        params.query,
        params.category || "Other",
        mapped
      );
      if (best) {
        return { match: best, hadNetworkError: false };
      }
    } else if (res.hadError) {
      anyNetworkError = true;
    }
  }

  return {
    match: null,
    hadNetworkError: !anyRequestSucceeded && anyNetworkError,
  };
}

/**
 * Queries OpenFoodFacts by EAN/UPC barcode (checking es.openfoodfacts.org then world.openfoodfacts.org).
 */
export async function lookupOpenFoodFactsByBarcode(
  rawBarcode: string
): Promise<CatalogLookupResult | null> {
  const ean = normalizeBarcode(rawBarcode);
  if (!ean) return null;

  const hosts = ["es.openfoodfacts.org", "world.openfoodfacts.org"];

  for (const host of hosts) {
    try {
      const url = `https://${host}/api/v2/product/${encodeURIComponent(
        ean
      )}.json?fields=${encodeURIComponent(OFF_FIELDS)}`;

      const response = await fetch(url, {
        headers: {
          "User-Agent": getUserAgent(),
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
      });

      if (!response.ok) continue;
      const data = (await response.json()) as {
        status?: number;
        product?: Record<string, unknown>;
      };

      if (data.status !== 1 || !data.product) continue;

      const mapped = mapOffProductToLookupResult(data.product, {
        requireQuantity: false,
        fallbackEan: ean,
      });
      if (mapped) return mapped;
    } catch (err) {
      console.warn("[CatalogLookup] Barcode fetch failed:", host, ean, err);
    }
  }

  return null;
}
