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
  // Query 100% real PostgreSQL data for all products, stores & confirmed receipts
  const [dbProducts, dbReceipts, dbStores, totalReceiptsCount] = await Promise.all([
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
      orderBy: [
        { isStaple: "desc" },
        { displayName: "asc" },
      ],
    }),
    prisma.receipt.findMany({
      where: { status: "CONFIRMED" },
      include: {
        store: true,
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
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
      storeBrandHex: item.receipt.store.brandHex || "#10b981",
      unitPrice: Number(item.unitPrice),
      pricePerBaseUnit: Number(item.pricePerBaseUnit),
    })),
  }));

  const recentReceipts: RecentReceiptItem[] = dbReceipts.map((r) => ({
    id: r.id,
    storeName: r.store.name,
    storeBrandHex: r.store.brandHex || "#10b981",
    purchaseDate: r.purchaseDate.toISOString(),
    itemsCount: r._count.items,
    totalAmount: r.totalAmount ? Number(r.totalAmount) : 0,
  }));

  const stores: HomeStoreData[] = dbStores.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    brandHex: s.brandHex || "#10b981",
    receiptsCount: s._count.receipts,
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <HomePriceIntelligence
        products={products}
        recentReceipts={recentReceipts}
        stores={stores}
        totalReceiptsCount={totalReceiptsCount}
      />
    </div>
  );
}
