import { prisma } from "@/lib/db";

export interface ShrinkflationIncident {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  category: string;
  storeId: string;
  storeName: string;
  storeHex: string;
  storeSlug: string;
  date: string; // ISO date string of the smaller package purchase
  oldDate: string; // ISO date string of previous purchase
  oldMeasure: number;
  newMeasure: number;
  oldUnitPrice: number;
  newUnitPrice: number;
  oldNormPrice: number;
  newNormPrice: number;
  percentNormIncrease: number;
  percentMeasureReduction: number;
  baseUnit: "KG" | "L" | "UNIT";
  receiptId: string;
  oldReceiptId: string;
}

export interface GetShrinkflationOptions {
  userId?: string;
  productId?: string;
  productSlug?: string;
  sinceDate?: Date;
}

export function formatMeasure(measure: number, baseUnit: "KG" | "L" | "UNIT"): string {
  if (baseUnit === "KG") {
    if (measure < 1) {
      return `${Math.round(measure * 1000)}g`;
    }
    return `${measure.toFixed(measure % 1 === 0 ? 0 : 2)} kg`;
  }
  if (baseUnit === "L") {
    if (measure < 1) {
      return `${Math.round(measure * 1000)} ml`;
    }
    return `${measure.toFixed(measure % 1 === 0 ? 0 : 2)} L`;
  }
  return `${measure} ud`;
}

/**
 * Pure PostgreSQL query engine detecting shrinkflation:
 * Products where package net content was reduced (>= 5%) while package price stayed roughly identical (+-10%)
 * resulting in a stealth price spike per base unit (>= 5%).
 */
export async function getShrinkflationIncidents(
  options: GetShrinkflationOptions = {}
): Promise<ShrinkflationIncident[]> {
  const { userId, productId, productSlug, sinceDate } = options;

  // Query confirmed items linked to a canonical Product
  const items = await prisma.receiptItem.findMany({
    where: {
      confirmed: true,
      excluded: false,
      productId: productId ? productId : { not: null },
      product: productSlug ? { slug: productSlug } : undefined,
      receipt: {
        status: "CONFIRMED",
        userId: userId ? userId : undefined,
        purchaseDate: sinceDate ? { gte: sinceDate } : undefined,
      },
    },
    include: {
      product: {
        select: {
          id: true,
          displayName: true,
          slug: true,
          category: true,
          baseUnit: true,
          aliases: {
            select: {
              storeId: true,
              rawAlias: true,
              isVariableWeight: true,
            },
          },
        },
      },
      receipt: {
        select: {
          id: true,
          purchaseDate: true,
          storeId: true,
          store: {
            select: {
              id: true,
              name: true,
              brandHex: true,
              slug: true,
            },
          },
        },
      },
    },
    orderBy: [
      { receipt: { purchaseDate: "asc" } },
      { id: "asc" },
    ],
  });

  function isItemVariableWeight(
    item: (typeof items)[number],
    baseUnit: "KG" | "L" | "UNIT",
    singlePackMeasure: number
  ): boolean {
    const storeId = item.receipt.storeId;
    const rawUpper = item.rawName.trim().toUpperCase();
    const matchedAlias = item.product?.aliases?.find(
      (a) => a.storeId === storeId && a.rawAlias.trim().toUpperCase() === rawUpper
    );

    if (matchedAlias) {
      return matchedAlias.isVariableWeight;
    }

    // Heuristic fallback for produce/deli weighed at checkout
    if (baseUnit === "KG") {
      const q = Number(item.quantity) || 1;
      if (q === 1) {
        const remainder = Math.abs(singlePackMeasure * 20 - Math.round(singlePackMeasure * 20));
        if (remainder > 0.05) return true;
      }
    }

    return false;
  }

  // Group items by `${productId}__${storeId}`
  const grouped = new Map<string, typeof items>();

  for (const item of items) {
    if (!item.productId || !item.product) continue;
    const key = `${item.productId}__${item.receipt.storeId}`;
    const list = grouped.get(key) || [];
    list.push(item);
    grouped.set(key, list);
  }

  const incidents: ShrinkflationIncident[] = [];

  for (const [, storeItems] of grouped.entries()) {
    if (storeItems.length < 2) continue;

    // Compare consecutive purchases chronologically
    for (let i = 1; i < storeItems.length; i++) {
      const prev = storeItems[i - 1];
      const curr = storeItems[i];

      const prevPackSize = Number(prev.unitMeasure) / Math.max(Number(prev.quantity) || 1, 1);
      const currPackSize = Number(curr.unitMeasure) / Math.max(Number(curr.quantity) || 1, 1);
      const baseUnit = curr.product!.baseUnit as "KG" | "L" | "UNIT";

      // Guardrail 1: Skip if either item is variable checkout weight (produce, meat counter)
      if (
        isItemVariableWeight(prev, baseUnit, prevPackSize) ||
        isItemVariableWeight(curr, baseUnit, currPackSize)
      ) {
        continue;
      }

      const oldMeasure = Number(prevPackSize.toFixed(3));
      const newMeasure = Number(currPackSize.toFixed(3));
      const oldUnitPrice = Number(prev.unitPrice);
      const newUnitPrice = Number(curr.unitPrice);
      const oldNormPrice = Number(prev.pricePerBaseUnit);
      const newNormPrice = Number(curr.pricePerBaseUnit);

      // Validate numeric sanity
      if (
        oldMeasure <= 0 ||
        newMeasure <= 0 ||
        oldUnitPrice <= 0 ||
        newUnitPrice <= 0 ||
        oldNormPrice <= 0 ||
        newNormPrice <= 0
      ) {
        continue;
      }

      // Guardrail 2: Multi-size catalog protection
      // Either the exact same POS SKU text shrank (isExactPOSMatch && ratio <= 0.95)
      // OR pack size reduction is within stealth shrinkflation bounds (0.75 <= ratio <= 0.95, e.g. 500g -> 420g or 2L -> 1.75L).
      // Prevents flagging normal pack purchases (e.g. 5L garrafa -> 1L bottle: ratio 0.20, or 6-pack -> 1-pack: ratio 0.16)
      const ratio = newMeasure / oldMeasure;
      const isExactPOSMatch = curr.rawName.trim().toUpperCase() === prev.rawName.trim().toUpperCase();
      const isStealthReduction = (isExactPOSMatch && ratio <= 0.95) || (ratio >= 0.75 && ratio <= 0.95);

      // Guardrail 3: Deceptive shelf price (pack shelf price stayed within +-10%)
      const priceDiffRatio = Math.abs(newUnitPrice - oldUnitPrice) / oldUnitPrice;
      const isDeceptivePrice = priceDiffRatio <= 0.10;

      // Guardrail 4: Normalized base unit price spike >= 5%
      const isNormPriceSpike = newNormPrice >= oldNormPrice * 1.05;

      if (isStealthReduction && isDeceptivePrice && isNormPriceSpike) {
        const percentMeasureReduction = ((oldMeasure - newMeasure) / oldMeasure) * 100;
        const percentNormIncrease = ((newNormPrice - oldNormPrice) / oldNormPrice) * 100;

        incidents.push({
          id: `${prev.id}-${curr.id}`,
          productId: curr.product!.id,
          productName: curr.product!.displayName,
          productSlug: curr.product!.slug,
          category: curr.product!.category,
          storeId: curr.receipt.store.id,
          storeName: curr.receipt.store.name,
          storeHex: curr.receipt.store.brandHex || "#10b981",
          storeSlug: curr.receipt.store.slug,
          date: curr.receipt.purchaseDate.toISOString(),
          oldDate: prev.receipt.purchaseDate.toISOString(),
          oldMeasure,
          newMeasure,
          oldUnitPrice,
          newUnitPrice,
          oldNormPrice,
          newNormPrice,
          percentNormIncrease: Math.round(percentNormIncrease * 10) / 10,
          percentMeasureReduction: Math.round(percentMeasureReduction * 10) / 10,
          baseUnit: curr.product!.baseUnit as "KG" | "L" | "UNIT",
          receiptId: curr.receipt.id,
          oldReceiptId: prev.receipt.id,
        });
      }
    }
  }

  // Sort incidents by date descending (most recent first)
  incidents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return incidents;
}
