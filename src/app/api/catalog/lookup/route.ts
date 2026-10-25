import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  type CatalogLookupResult,
  STORE_BRAND_MAP,
  parseSpanishCatalogQuantity,
} from "@/lib/catalog/parser";

export async function GET(request: NextRequest) {
  try {
    let user;
    try {
      user = await requireAuthUser();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate Limiting: max 60 requests per minute per user ID
    const rateResult = await checkRateLimit({
      key: `catalog:${user.id}`,
      limit: 60,
      windowSeconds: 60,
    });

    if (!rateResult.success) {
      return NextResponse.json(
        { error: "Too many catalog lookup requests. Please slow down." },
        {
          status: 429,
          headers: { "Retry-After": String(rateResult.resetSeconds) },
        }
      );
    }

    const { searchParams } = new URL(request.url);
    const rawQuery = searchParams.get("q")?.trim() || "";
    const storeParam = searchParams.get("store")?.trim() || "";

    if (!rawQuery || rawQuery.length < 2) {
      return NextResponse.json({ matches: [] });
    }

    // Clean query text: remove numbers at the end or punctuation
    const cleanQuery = rawQuery
      .replace(/[^\w\s\u00C0-\u017F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Map store to brand
    const storeKey = storeParam.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const privateBrand = STORE_BRAND_MAP[storeKey] || "";

    // Query OpenFoodFacts ES with search_terms
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
        )}&search_simple=1&action=process&json=1&page_size=6`;

        const response = await fetch(offUrl, {
          headers: {
            "User-Agent": `Ticketera/2.0.1 (+${process.env.NEXT_PUBLIC_APP_URL || "https://github.com/brazaoo4/ticketera"})`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(4000),
        });

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.products) && data.products.length > 0) {
            rawProducts = data.products;
            break;
          }
        }
      } catch (fetchErr) {
        console.warn(`[CatalogLookup] Fetch attempt failed for "${q}":`, fetchErr);
      }
    }

    const matches: CatalogLookupResult[] = [];
    const seenCombos = new Set<string>();

    for (const p of rawProducts) {
      const productName = (p.product_name_es as string) || (p.product_name as string) || "";
      const brand = (p.brands as string) || "";
      const rawQuantityText = (p.quantity as string) || "";

      if (!productName || !rawQuantityText) continue;

      const parsed = parseSpanishCatalogQuantity(rawQuantityText);
      if (!parsed) continue;

      const dedupeKey = `${parsed.baseUnit}__${parsed.unitMeasurePerPack}__${productName.toLowerCase().slice(0, 20)}`;
      if (seenCombos.has(dedupeKey)) continue;
      seenCombos.add(dedupeKey);

      matches.push({
        productName: productName.trim(),
        brand: brand.trim(),
        rawQuantityText: rawQuantityText.trim(),
        baseUnit: parsed.baseUnit,
        unitMeasurePerPack: parsed.unitMeasurePerPack,
      });

      if (matches.length >= 6) break;
    }

    return NextResponse.json({ matches });
  } catch (err: unknown) {
    console.error("[CatalogLookup] Error querying catalog:", err);
    return NextResponse.json({ matches: [] });
  }
}
