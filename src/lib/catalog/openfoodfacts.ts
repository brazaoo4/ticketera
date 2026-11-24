import {
  type CatalogLookupResult,
  STORE_BRAND_MAP,
  extractOpenFoodFactsNutrition,
  normalizeBarcode,
  parseSpanishCatalogQuantity,
} from "./parser";

const OFF_FIELDS =
  "code,product_name,product_name_es,brands,quantity,nutriscore_grade,nutrition_grades,nova_group,nova_groups,nutriments";

function getUserAgent(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://github.com/brazaoo4/ticketera";
  return `Ticketera/2.5.0 (+${appUrl})`;
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
    try {
      const offUrl = `https://es.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
        q
      )}&search_simple=1&action=process&json=1&page_size=6&fields=${encodeURIComponent(
        OFF_FIELDS
      )}`;

      const response = await fetch(offUrl, {
        headers: {
          "User-Agent": getUserAgent(),
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(4500),
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.products) && data.products.length > 0) {
          rawProducts = data.products;
          break;
        }
      }
    } catch (fetchErr) {
      console.warn("[CatalogLookup] Fetch attempt failed for query:", q, fetchErr);
    }
  }

  const matches: CatalogLookupResult[] = [];
  const seenCombos = new Set<string>();
  const requireQuantity = params.requireQuantity ?? true;

  for (const p of rawProducts) {
    const productName =
      (p.product_name_es as string) || (p.product_name as string) || "";
    const brand = (p.brands as string) || "";
    const rawQuantityText = (p.quantity as string) || "";

    if (!productName) continue;

    const parsed = rawQuantityText ? parseSpanishCatalogQuantity(rawQuantityText) : null;
    if (requireQuantity && !parsed) continue;

    const nutrition = extractOpenFoodFactsNutrition(p);
    const ean =
      nutrition?.ean ||
      normalizeBarcode(
        typeof p.code === "string" || typeof p.code === "number"
          ? String(p.code)
          : null
      );

    const effectiveUnit = parsed?.baseUnit ?? "UNIT";
    const effectiveMeasure = parsed?.unitMeasurePerPack ?? 1;

    const dedupeKey = `${effectiveUnit}__${effectiveMeasure}__${productName
      .toLowerCase()
      .slice(0, 20)}`;
    if (seenCombos.has(dedupeKey)) continue;
    seenCombos.add(dedupeKey);

    matches.push({
      productName: productName.trim(),
      brand: brand.trim(),
      rawQuantityText: rawQuantityText.trim(),
      baseUnit: effectiveUnit,
      unitMeasurePerPack: effectiveMeasure,
      hasParsedQuantity: Boolean(parsed),
      ean,
      nutrition,
    });

    if (matches.length >= 6) break;
  }

  return matches;
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
        signal: AbortSignal.timeout(4500),
      });

      if (!response.ok) continue;
      const data = (await response.json()) as {
        status?: number;
        product?: Record<string, unknown>;
      };

      if (data.status !== 1 || !data.product) continue;

      const p = data.product;
      const productName =
        (p.product_name_es as string) || (p.product_name as string) || "";
      if (!productName) continue;

      const brand = (p.brands as string) || "";
      const rawQuantityText = (p.quantity as string) || "";
      const parsed = rawQuantityText
        ? parseSpanishCatalogQuantity(rawQuantityText)
        : null;
      const nutrition = extractOpenFoodFactsNutrition({ ...p, code: ean });

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
    } catch (err) {
      console.warn("[CatalogLookup] Barcode fetch failed:", host, ean, err);
    }
  }

  return null;
}
