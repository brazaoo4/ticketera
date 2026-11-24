import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { searchOpenFoodFacts } from "@/lib/catalog/openfoodfacts";

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
