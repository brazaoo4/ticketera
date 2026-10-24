import React from "react";
import { prisma } from "@/lib/db";
import { CompareClient, BasketItem, ComparisonStore } from "./compare-client";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const [dbProducts, dbStores] = await Promise.all([
    prisma.product.findMany({
      where: {
        receiptItems: {
          some: {
            confirmed: true,
            excluded: false,
            receipt: {
              status: "CONFIRMED",
            },
          },
        },
      },
      include: {
        receiptItems: {
          where: {
            confirmed: true,
            excluded: false,
            receipt: {
              status: "CONFIRMED",
            },
          },
          include: {
            receipt: {
              include: {
                store: true,
              },
            },
          },
          orderBy: {
            receipt: { purchaseDate: "desc" },
          },
        },
      },
      orderBy: [
        { isStaple: "desc" },
        { displayName: "asc" },
      ],
    }),
    prisma.store.findMany({
      orderBy: { name: "asc" },
    }),
  ]);

  const stores: ComparisonStore[] = dbStores.map((s) => ({
    key: s.slug,
    name: s.name,
    brandHex: s.brandHex || "#10b981",
  }));

  const items: BasketItem[] = dbProducts.map((p) => {
    const details: Record<string, {
      unitPrice: number;
      pricePerBaseUnit: number;
      unitMeasure: number;
      quantity: number;
    }> = {};

    p.receiptItems.forEach((item) => {
      const storeSlug = item.receipt.store.slug;
      if (!details[storeSlug]) {
        details[storeSlug] = {
          unitPrice: Number(item.unitPrice),
          pricePerBaseUnit: Number(item.pricePerBaseUnit),
          unitMeasure: Number(item.unitMeasure),
          quantity: Number(item.quantity),
        };
      }
    });

    const unit =
      p.baseUnit === "KG" ? "1 kg" : p.baseUnit === "L" ? "1 L" : "Pack";

    return {
      id: p.id,
      slug: p.slug,
      name: p.displayName,
      category: p.category,
      baseUnit: p.baseUnit as "KG" | "L" | "UNIT",
      unit,
      details,
    };
  });

  return <CompareClient initialItems={items} stores={stores} />;
}
