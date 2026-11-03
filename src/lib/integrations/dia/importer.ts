import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  SPANISH_TO_ENGLISH_CATEGORIES,
  inferUnitAndMeasureHeuristics,
} from "@/lib/queue/receipt-worker";
import { renderDiaTicketToWebp } from "./render-ticket";
import { DiaTicketDetailResponse, DiaTicketSummary } from "./types";

export interface ImportDiaTicketResult {
  receiptId: string;
  externalTicketId: string;
  totalAmount: number;
  itemCount: number;
  isDuplicate: boolean;
  status: "IMPORTED" | "SKIPPED_DUPLICATE";
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => (word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : ""))
    .join(" ");
}

/**
 * Deterministically imports a Dia POS ticket into Ticketera without using AI tokens.
 * Maps line items, weighed items, discounts, and taxes with high fidelity.
 */
export async function importDiaTicket({
  userId,
  summary,
  detail,
}: {
  userId: string;
  summary: DiaTicketSummary;
  detail: DiaTicketDetailResponse;
}): Promise<ImportDiaTicketResult> {
  const externalTicketId = summary.ticket_unique_code;
  const fileHash = crypto
    .createHash("sha256")
    .update(`dia-ticket:${externalTicketId}`)
    .digest("hex");

  // 1. Deduplication Check
  const existingReceipt = await prisma.receipt.findFirst({
    where: {
      OR: [
        { externalTicketId },
        { fileHash },
      ],
    },
    select: { id: true, totalAmount: true },
  });

  if (existingReceipt) {
    return {
      receiptId: existingReceipt.id,
      externalTicketId,
      totalAmount: Number(existingReceipt.totalAmount),
      itemCount: 0,
      isDuplicate: true,
      status: "SKIPPED_DUPLICATE",
    };
  }

  // 2. Resolve or create DIA Store
  let store = await prisma.store.findFirst({
    where: { name: { equals: "DIA", mode: "insensitive" } },
  });

  if (!store) {
    store = await prisma.store.create({
      data: { name: "DIA", slug: "dia" },
    });
  }

  const effectiveStoreId = store.id;
  const purchaseDate = new Date(
    summary.submitted_date || summary.detail_params?.begin || Date.now()
  );
  const totalAmountNum =
    detail.amount?.total_amount != null
      ? Number(detail.amount.total_amount)
      : Number(summary.total_amount) || 0;

  // 3. Create preliminary Receipt record
  const receipt = await prisma.receipt.create({
    data: {
      userId,
      storeId: effectiveStoreId,
      purchaseDate,
      totalAmount: new Prisma.Decimal(totalAmountNum),
      sourceFile: "temp",
      fileHash,
      externalTicketId,
      status: "PROCESSING",
      aiProvider: "dia-pos",
      processingMs: 0,
    },
  });

  try {
    // 4. Generate SVG & WebP thermal receipt companion for review viewer
    await renderDiaTicketToWebp(receipt.id, summary, detail);

    // 5. Match items and format items for insertion
    const itemsToCreate: Prisma.ReceiptItemCreateManyInput[] = [];
    const corporateItems = detail.corporate?.items || [];

    for (const item of corporateItems) {
      if (item.cancel) continue;

      const rawName = item.name.trim().toUpperCase();
      let productId: string | null = null;
      let matchConfidence = 0;
      let matchedAlias: {
        id: string;
        productId: string;
        unitMeasurePerPack: Prisma.Decimal | number | null;
        isVariableWeight: boolean;
        product: { id: string; baseUnit: string; category: string; displayName?: string };
      } | null = null;
      let matchedProduct: {
        id: string;
        baseUnit: "KG" | "L" | "UNIT";
        category: string;
        displayName: string;
      } | null = null;

      // Check 1: Deterministic exact alias match for DIA store
      try {
        const alias = await prisma.productAlias.findUnique({
          where: {
            storeId_rawAlias: {
              storeId: effectiveStoreId,
              rawAlias: rawName,
            },
          },
          include: {
            product: {
              select: { id: true, baseUnit: true, category: true, displayName: true },
            },
          },
        });

        if (alias) {
          matchedAlias = alias;
          productId = alias.productId;
          matchConfidence = 1.0;
          matchedProduct = alias.product as {
            id: string;
            baseUnit: "KG" | "L" | "UNIT";
            category: string;
            displayName: string;
          };
        }
      } catch (aliasErr) {
        console.warn(`[DiaImporter] Exact alias lookup error for "${rawName}":`, aliasErr);
      }

      // Check 2: Exact displayName match
      if (!productId) {
        try {
          const exactProd = await prisma.product.findFirst({
            where: {
              displayName: { equals: item.name.trim(), mode: "insensitive" },
            },
            select: { id: true, baseUnit: true, category: true, displayName: true },
          });
          if (exactProd) {
            productId = exactProd.id;
            matchConfidence = 1.0;
            matchedProduct = exactProd as {
              id: string;
              baseUnit: "KG" | "L" | "UNIT";
              category: string;
              displayName: string;
            };
          }
        } catch (exactErr) {
          console.warn(`[DiaImporter] Exact product lookup error for "${item.name}":`, exactErr);
        }
      }

      // Check 3: pg_trgm similarity search
      if (!productId) {
        try {
          const cleanName = item.name.trim();
          const fuzzyMatches = await prisma.$queryRaw<Array<{ id: string; sim: number }>>`
            SELECT id, similarity("displayName", ${cleanName})::float AS sim
            FROM "Product"
            WHERE similarity("displayName", ${cleanName}) >= 0.35
            ORDER BY sim DESC
            LIMIT 1
          `;

          if (fuzzyMatches.length > 0 && fuzzyMatches[0].sim >= 0.35) {
            productId = fuzzyMatches[0].id;
            matchConfidence = Number(fuzzyMatches[0].sim.toFixed(2));
            matchedProduct = (await prisma.product.findUnique({
              where: { id: productId },
              select: { id: true, baseUnit: true, category: true, displayName: true },
            })) as {
              id: string;
              baseUnit: "KG" | "L" | "UNIT";
              category: string;
              displayName: string;
            } | null;
          }
        } catch (fuzzyErr) {
          console.warn(`[DiaImporter] pg_trgm similarity search error for "${item.name}":`, fuzzyErr);
        }
      }

      const rawCategory = matchedProduct?.category || "Other";
      const normalizedCategory =
        SPANISH_TO_ENGLISH_CATEGORIES[rawCategory] || rawCategory;

      const isVariableWeight = Boolean(item.variable_weight && item.weight && item.weight > 0);
      let baseUnit: "KG" | "L" | "UNIT" = isVariableWeight
        ? "KG"
        : (matchedProduct?.baseUnit as "KG" | "L" | "UNIT") || "UNIT";
      let unitMeasure = isVariableWeight ? Number(item.weight) : 1;
      let pricePerBase = isVariableWeight
        ? Number(item.price_per_unit)
        : Number(item.amount);
      const quantity = isVariableWeight ? 1 : Number(item.quantity || 1);
      const unitPrice = isVariableWeight
        ? Number(item.price_per_unit)
        : Number(item.price_per_unit || item.amount);
      const totalPrice = Number(item.amount);

      if (!isVariableWeight) {
        const inferred = inferUnitAndMeasureHeuristics({
          rawName,
          suggestedName: matchedProduct?.displayName || rawName,
          category: normalizedCategory,
          aiBaseUnit: matchedProduct?.baseUnit as "KG" | "L" | "UNIT",
          aiUnitMeasure: undefined,
          aiUnitPrice: unitPrice,
          totalPrice,
          quantity,
        });

        baseUnit = (matchedProduct?.baseUnit as "KG" | "L" | "UNIT") || inferred.baseUnit;
        unitMeasure = inferred.unitMeasure;
        pricePerBase = inferred.pricePerBaseUnit;

        // Auto pack-size from product alias if available
        if (
          matchedAlias &&
          matchedAlias.unitMeasurePerPack !== null &&
          !matchedAlias.isVariableWeight
        ) {
          const packMeasure = Number(matchedAlias.unitMeasurePerPack);
          const qty = Number(quantity) || 1;
          unitMeasure = Number((qty * packMeasure).toFixed(3));
          pricePerBase =
            unitMeasure > 0 && totalPrice > 0
              ? Number((totalPrice / unitMeasure).toFixed(2))
              : 0;
          if (isNaN(pricePerBase) || !isFinite(pricePerBase) || pricePerBase < 0) {
            pricePerBase = 0;
          }
        }
      }

      const suggestedName = matchedProduct?.displayName || toTitleCase(item.name);

      itemsToCreate.push({
        receiptId: receipt.id,
        productId,
        rawName,
        suggestedName,
        suggestedCat: normalizedCategory,
        matchConfidence,
        quantity: new Prisma.Decimal(quantity),
        unitPrice: new Prisma.Decimal(unitPrice),
        totalPrice: new Prisma.Decimal(totalPrice),
        baseUnit,
        unitMeasure: new Prisma.Decimal(unitMeasure),
        pricePerBaseUnit: new Prisma.Decimal(pricePerBase),
        isDiscount: false,
        excluded: false,
        confirmed: false,
      });

      // Item discounts (e.g. Club Dia coupon / 15% Fruta y verdura)
      if (Array.isArray(item.discounts) && item.discounts.length > 0) {
        for (const discount of item.discounts) {
          const discountDesc = discount.description?.trim() || "DESCUENTO";
          const discountAmount = Number(discount.amount) || 0;
          itemsToCreate.push({
            receiptId: receipt.id,
            productId: null,
            rawName: `${rawName} - ${discountDesc}`.toUpperCase(),
            suggestedName: discountDesc,
            suggestedCat: "Other",
            matchConfidence: 1.0,
            quantity: new Prisma.Decimal(1),
            unitPrice: new Prisma.Decimal(discountAmount),
            totalPrice: new Prisma.Decimal(discountAmount),
            baseUnit: "UNIT",
            unitMeasure: new Prisma.Decimal(1),
            pricePerBaseUnit: new Prisma.Decimal(0),
            isDiscount: true,
            excluded: true,
            confirmed: false,
          });
        }
      }
    }

    // 6. Tax Breakdown
    let taxBreakdownValue: Prisma.InputJsonValue | undefined = undefined;
    const taxes = detail.corporate?.taxes || [];
    if (Array.isArray(taxes) && taxes.length > 0) {
      taxBreakdownValue = taxes
        .filter((t) => t && (typeof t.rate === "number" || typeof t.base_amount === "number"))
        .map((t) => ({
          rate: Number(t.rate ?? 0),
          baseAmount: Number(t.base_amount ?? t.base ?? 0),
          taxAmount: Number(t.amount ?? t.quota ?? 0),
        })) as unknown as Prisma.InputJsonValue;
    }

    // 7. Atomic update receipt + items
    await prisma.$transaction(async (tx) => {
      if (itemsToCreate.length > 0) {
        await tx.receiptItem.createMany({ data: itemsToCreate });
      }

      await tx.receipt.update({
        where: { id: receipt.id },
        data: {
          sourceFile: `${receipt.id}.webp`,
          status: "REVIEW",
          errorMessage: null,
          taxBreakdown: taxBreakdownValue !== undefined ? taxBreakdownValue : Prisma.DbNull,
        },
      });
    });

    console.log(
      `[DiaImporter] ✓ Successfully imported Dia ticket ${externalTicketId} (${receipt.id}) with ${itemsToCreate.length} items.`
    );

    return {
      receiptId: receipt.id,
      externalTicketId,
      totalAmount: totalAmountNum,
      itemCount: itemsToCreate.length,
      isDuplicate: false,
      status: "IMPORTED",
    };
  } catch (importErr) {
    const errorMsg = importErr instanceof Error ? importErr.message : String(importErr);
    console.error(`[DiaImporter] ❌ Error importing ticket ${externalTicketId}:`, importErr);
    await prisma.receipt.update({
      where: { id: receipt.id },
      data: {
        status: "FAILED",
        errorMessage: `Dia import error: ${errorMsg}`,
      },
    });
    throw importErr;
  }
}
