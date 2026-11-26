import React from "react";
import { prisma } from "@/lib/db";
import {
  HomePriceIntelligence,
  HomeProductData,
  RecentReceiptItem,
  HomeStoreData,
} from "@/components/home/home-price-intelligence";
import { EmptyStateDemoCard } from "@/components/demo/empty-state-demo-card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [dbProducts, dbReceipts, dbStores, totalReceiptsCount] =
    await Promise.all([
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
              receipt: {
                purchaseDate: "asc",
              },
            },
          },
        },
        orderBy: [{ isStaple: "desc" }, { displayName: "asc" }],
      }),
      prisma.receipt.findMany({
        where: { status: "CONFIRMED" },
        include: {
          store: true,
          items: {
            where: {
              confirmed: true,
              excluded: false,
              isDiscount: false,
            },
            include: {
              product: {
                select: {
                  slug: true,
                  displayName: true,
                },
              },
            },
            orderBy: { totalPrice: "desc" },
          },
          _count: {
            select: { items: true },
          },
        },
        orderBy: {
          purchaseDate: "desc",
        },
        take: 6,
      }),
      prisma.store.findMany({
        where: {
          receipts: {
            some: { status: "CONFIRMED" },
          },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          brandHex: true,
          _count: {
            select: {
              receipts: { where: { status: "CONFIRMED" } },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.receipt.count({ where: { status: "CONFIRMED" } }),
    ]);

  if (totalReceiptsCount === 0) {
    return (
      <div className="max-w-[1120px] mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <EmptyStateDemoCard />
      </div>
    );
  }

  const products: HomeProductData[] = dbProducts.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.displayName,
    category: p.category,
    baseUnit: p.baseUnit as "KG" | "L" | "UNIT",
    isStaple: p.isStaple,
    sightings: p.receiptItems.map((item) => ({
      purchaseDate: item.receipt.purchaseDate.toISOString(),
      storeName: item.receipt.store.name,
      storeSlug: item.receipt.store.slug,
      storeBrandHex: item.receipt.store.brandHex || "#15803D",
      unitPrice: Number(item.unitPrice),
      pricePerBaseUnit: Number(item.pricePerBaseUnit),
      unitMeasure: Number(item.unitMeasure),
      quantity: Number(item.quantity),
      rawName: item.rawName,
    })),
  }));

  const recentReceipts: RecentReceiptItem[] = dbReceipts.map((r) => ({
    id: r.id,
    storeName: r.store.name,
    storeBrandHex: r.store.brandHex || "#15803D",
    purchaseDate: r.purchaseDate.toISOString(),
    itemsCount: r._count.items,
    totalAmount: r.totalAmount ? Number(r.totalAmount) : 0,
    taxBreakdown: Array.isArray(r.taxBreakdown)
      ? (
          r.taxBreakdown as Array<{
            rate: number;
            baseAmount: number;
            taxAmount: number;
          }>
        ).map((t) => ({
          rate: Number(t.rate) || 0,
          baseAmount: Number(t.baseAmount) || 0,
          taxAmount: Number(t.taxAmount) || 0,
        }))
      : null,
    items: r.items.map((it) => ({
      id: it.id,
      name: it.product?.displayName || it.suggestedName || it.rawName,
      productSlug: it.product?.slug || null,
      rawName: it.rawName,
      totalPrice: Number(it.totalPrice),
      unitMeasure: Number(it.unitMeasure),
      baseUnit: it.baseUnit as "KG" | "L" | "UNIT",
      quantity: Number(it.quantity),
    })),
  }));

  const stores: HomeStoreData[] = dbStores.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    brandHex: s.brandHex || "#15803D",
    receiptsCount: s._count.receipts,
  }));

  return (
    <div className="max-w-[1120px] mx-auto px-4 sm:px-6 py-7 sm:py-10">
      <HomePriceIntelligence
        products={products}
        recentReceipts={recentReceipts}
        stores={stores}
        totalReceiptsCount={totalReceiptsCount}
      />
    </div>
  );
}
