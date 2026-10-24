import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Public product search rate limiting: max 60 requests per minute per IP
  const clientIp = getClientIp(req);
  const rateResult = await checkRateLimit({
    key: `search:${clientIp}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!rateResult.success) {
    return NextResponse.json(
      { error: "Too many search requests. Please slow down." },
      {
        status: 429,
        headers: { "Retry-After": String(rateResult.resetSeconds) },
      }
    );
  }

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q")?.trim() || "";

  if (!q) {
    // Return top confirmed products from the database
    const products = await prisma.product.findMany({
      where: {
        receiptItems: {
          some: {
            confirmed: true,
            excluded: false,
            receipt: { status: "CONFIRMED" },
          },
        },
      },
      take: 8,
      orderBy: [{ isStaple: "desc" }, { displayName: "asc" }],
      select: {
        id: true,
        displayName: true,
        category: true,
        baseUnit: true,
        isStaple: true,
        slug: true,
      },
    });
    return NextResponse.json({ products });
  }

  // Try pg_trgm similarity search first, with graceful ILIKE fallback
  try {
    const rawMatches = await prisma.$queryRaw<
      Array<{
        id: string;
        displayName: string;
        category: string;
        baseUnit: string;
        isStaple: boolean;
        slug: string;
        similarity: number;
      }>
    >`
      SELECT p.id, p."displayName", p.category, p."baseUnit", p."isStaple", p.slug,
             similarity(p."displayName", ${q}) as similarity
      FROM "Product" p
      WHERE EXISTS (
        SELECT 1 FROM "ReceiptItem" ri
        JOIN "Receipt" r ON ri."receiptId" = r.id
        WHERE ri."productId" = p.id AND ri.confirmed = true AND ri.excluded = false AND r.status = 'CONFIRMED'
      ) AND (
        similarity(p."displayName", ${q}) > 0.15 OR p."displayName" ILIKE ${"%" + q + "%"} OR p.category ILIKE ${"%" + q + "%"}
      )
      ORDER BY similarity DESC, p."displayName" ASC
      LIMIT 10;
    `;

    return NextResponse.json({ products: rawMatches });
  } catch {
    // Fallback if raw pg_trgm query fails
    const matches = await prisma.product.findMany({
      where: {
        receiptItems: {
          some: {
            confirmed: true,
            excluded: false,
            receipt: { status: "CONFIRMED" },
          },
        },
        OR: [
          { displayName: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 10,
      select: {
        id: true,
        displayName: true,
        category: true,
        baseUnit: true,
        isStaple: true,
        slug: true,
      },
      orderBy: [{ isStaple: "desc" }, { displayName: "asc" }],
    });
    return NextResponse.json({ products: matches });
  }
}

