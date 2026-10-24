import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function escapeCsv(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  let str = String(value);

  // CSV Formula Injection mitigation: prefix potentially dangerous leading characters
  // with a single quote (') unless it's a valid finite numeric value (e.g. -5.20)
  if (typeof value === "string" || isNaN(Number(str))) {
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
  }

  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return new NextResponse("Unauthorized. Please log in to export your data.", {
      status: 401,
    });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "items_csv";
  const range = (searchParams.get("range") || "all").toLowerCase();

  // Compute date range cutoff
  let dateCutoff: Date | undefined;
  const now = new Date();
  if (range === "3m") {
    dateCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  } else if (range === "6m") {
    dateCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  } else if (range === "1y") {
    dateCutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  } else if (range === "2y") {
    dateCutoff = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
  }

  const receipts = await prisma.receipt.findMany({
    where: {
      userId: user.id,
      status: "CONFIRMED",
      ...(dateCutoff ? { purchaseDate: { gte: dateCutoff } } : {}),
    },
    include: {
      store: true,
      items: {
        where: { excluded: false },
        include: { product: true },
        orderBy: { rawName: "asc" },
      },
    },
    orderBy: { purchaseDate: "desc" },
  });

  const todayStr = new Date().toISOString().slice(0, 10);

  // 1. ITEMS CSV EXPORT
  if (format === "items_csv") {
    const headers = [
      "Purchase Date",
      "Supermarket",
      "POS Receipt Text",
      "Canonical Product",
      "Category",
      "Quantity",
      "Unit Price (EUR)",
      "Line Total (EUR)",
      "Base Unit",
      "Net Measure",
      "Normalized Price (EUR/Unit)",
      "Is Discount",
    ];

    const rows: string[] = [headers.join(",")];

    for (const r of receipts) {
      const dateStr = r.purchaseDate.toISOString().slice(0, 10);
      for (const item of r.items) {
        const canonicalName = item.product?.displayName || item.suggestedName || item.rawName;
        const category = item.product?.category || item.suggestedCat || "Other";
        const quantity = Number(item.quantity) || 1;
        const unitPrice = Number(item.unitPrice) || 0;
        const totalPrice = Number(item.totalPrice) || 0;
        const baseUnit = item.baseUnit || "UNIT";
        const unitMeasure = Number(item.unitMeasure) || 1;
        const pricePerBaseUnit = Number(item.pricePerBaseUnit) || 0;
        const isDiscount = item.isDiscount ? "YES" : "NO";

        rows.push(
          [
            escapeCsv(dateStr),
            escapeCsv(r.store.name),
            escapeCsv(item.rawName),
            escapeCsv(canonicalName),
            escapeCsv(category),
            escapeCsv(quantity),
            escapeCsv(unitPrice.toFixed(2)),
            escapeCsv(totalPrice.toFixed(2)),
            escapeCsv(baseUnit),
            escapeCsv(unitMeasure),
            escapeCsv(pricePerBaseUnit.toFixed(2)),
            escapeCsv(isDiscount),
          ].join(",")
        );
      }
    }

    // Prepend UTF-8 BOM (\uFEFF) for Excel compatibility
    const csvContent = "\uFEFF" + rows.join("\r\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ticketera-items-${todayStr}.csv"`,
      },
    });
  }

  // 2. RECEIPTS CSV EXPORT
  if (format === "receipts_csv") {
    const headers = [
      "Purchase Date",
      "Supermarket",
      "Status",
      "Confirmed Line Items",
      "Total Amount (EUR)",
      "AI Provider",
    ];

    const rows: string[] = [headers.join(",")];

    for (const r of receipts) {
      const dateStr = r.purchaseDate.toISOString().slice(0, 10);
      const totalAmount = r.totalAmount ? Number(r.totalAmount).toFixed(2) : "0.00";

      rows.push(
        [
          escapeCsv(dateStr),
          escapeCsv(r.store.name),
          escapeCsv(r.status),
          escapeCsv(r.items.length),
          escapeCsv(totalAmount),
          escapeCsv(r.aiProvider || "AI Vision"),
        ].join(",")
      );
    }

    // Prepend UTF-8 BOM (\uFEFF) for Excel compatibility
    const csvContent = "\uFEFF" + rows.join("\r\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ticketera-receipts-${todayStr}.csv"`,
      },
    });
  }

  // 3. STRUCTURED JSON BACKUP EXPORT
  const totalItemsCount = receipts.reduce((sum, r) => sum + r.items.length, 0);

  const jsonPayload = {
    exportDate: new Date().toISOString(),
    version: "2.0",
    userId: user.id,
    range,
    totalReceipts: receipts.length,
    totalItems: totalItemsCount,
    receipts: receipts.map((r) => ({
      id: r.id,
      purchaseDate: r.purchaseDate.toISOString(),
      store: {
        id: r.store.id,
        name: r.store.name,
        slug: r.store.slug,
        brandHex: r.store.brandHex,
      },
      totalAmount: r.totalAmount ? Number(r.totalAmount) : 0,
      status: r.status,
      aiProvider: r.aiProvider,
      items: r.items.map((item) => ({
        id: item.id,
        rawName: item.rawName,
        suggestedName: item.suggestedName,
        category: item.product?.category || item.suggestedCat || "Other",
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
        baseUnit: item.baseUnit,
        unitMeasure: Number(item.unitMeasure),
        pricePerBaseUnit: Number(item.pricePerBaseUnit),
        isDiscount: item.isDiscount,
        product: item.product
          ? {
              id: item.product.id,
              slug: item.product.slug,
              displayName: item.product.displayName,
              category: item.product.category,
              baseUnit: item.product.baseUnit,
              isStaple: item.product.isStaple,
            }
          : null,
      })),
    })),
  };

  return new NextResponse(JSON.stringify(jsonPayload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ticketera-backup-${todayStr}.json"`,
    },
  });
}
