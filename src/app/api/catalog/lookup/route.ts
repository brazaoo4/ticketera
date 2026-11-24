import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeBarcode } from "@/lib/catalog/parser";
import {
  lookupOpenFoodFactsByBarcode,
  searchOpenFoodFacts,
} from "@/lib/catalog/openfoodfacts";

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
    const barcodeParam = searchParams.get("barcode")?.trim() || "";

    // Secondary Barcode / EAN Lookup path
    if (barcodeParam) {
      const ean = normalizeBarcode(barcodeParam);
      if (!ean) {
        return NextResponse.json(
          { error: "Invalid barcode format. Expected 8-14 numeric digits." },
          { status: 400 }
        );
      }

      const [localProd, offMatch] = await Promise.all([
        prisma.product.findFirst({
          where: {
            OR: [{ ean }, { aliases: { some: { barcode: ean } } }],
          },
          select: {
            id: true,
            slug: true,
            displayName: true,
            category: true,
            baseUnit: true,
            isStaple: true,
            nutriScore: true,
            novaGroup: true,
            proteinPer100g: true,
            kcalPer100g: true,
            ean: true,
          },
        }),
        lookupOpenFoodFactsByBarcode(ean),
      ]);

      let matchedLocalProducts: Array<{
        id: string;
        slug: string;
        displayName: string;
        category: string;
        baseUnit: string;
        isStaple: boolean;
      }> = [];

      if (offMatch?.productName) {
        const cleanTerm = offMatch.productName
          .replace(/[^\w\s\u00C0-\u017F]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .split(" ")
          .slice(0, 4)
          .join(" ");

        if (cleanTerm.length >= 2) {
          try {
            matchedLocalProducts = await prisma.$queryRaw<
              Array<{
                id: string;
                slug: string;
                displayName: string;
                category: string;
                baseUnit: string;
                isStaple: boolean;
              }>
            >`
              SELECT p.id, p.slug, p."displayName", p.category, p."baseUnit", p."isStaple"
              FROM "Product" p
              WHERE similarity(p."displayName", ${cleanTerm}) > 0.15
                 OR p."displayName" ILIKE ${"%" + cleanTerm + "%"}
              ORDER BY similarity(p."displayName", ${cleanTerm}) DESC, p."displayName" ASC
              LIMIT 6;
            `;
          } catch {
            matchedLocalProducts = await prisma.product.findMany({
              where: {
                displayName: { contains: cleanTerm, mode: "insensitive" },
              },
              take: 6,
              select: {
                id: true,
                slug: true,
                displayName: true,
                category: true,
                baseUnit: true,
                isStaple: true,
              },
            });
          }
        }
      }

      return NextResponse.json({
        barcode: ean,
        localProduct: localProd
          ? {
              ...localProd,
              proteinPer100g:
                localProd.proteinPer100g !== null
                  ? Number(localProd.proteinPer100g)
                  : null,
              kcalPer100g:
                localProd.kcalPer100g !== null
                  ? Number(localProd.kcalPer100g)
                  : null,
            }
          : null,
        matchedLocalProducts,
        offMatch,
        matches: offMatch ? [offMatch] : [],
      });
    }

    const rawQuery = searchParams.get("q")?.trim() || "";
    const storeParam = searchParams.get("store")?.trim() || "";

    if (!rawQuery || rawQuery.length < 2) {
      return NextResponse.json({ matches: [] });
    }

    const matches = await searchOpenFoodFacts({
      query: rawQuery,
      store: storeParam,
      requireQuantity: true,
    });

    return NextResponse.json({ matches });
  } catch (err: unknown) {
    console.error("[CatalogLookup] Error querying catalog:", err);
    return NextResponse.json({ matches: [] });
  }
}
