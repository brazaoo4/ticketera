import React from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getShrinkflationIncidents } from "@/lib/analytics/shrinkflation";
import { MyStatsClient, type StatsReceipt, type StatsItem } from "./my-stats-client";
import { EmptyStateDemoCard } from "@/components/demo/empty-state-demo-card";

export const dynamic = "force-dynamic";

export default async function MyStatsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/my-stats");
  }

  const receipts = await prisma.receipt.findMany({
    where: {
      userId: session.user.id,
      status: "CONFIRMED",
    },
    include: {
      store: true,
      items: {
        where: { excluded: false, confirmed: true },
        include: {
          product: {
            select: {
              id: true,
              displayName: true,
              slug: true,
              category: true,
              baseUnit: true,
              isStaple: true,
            },
          },
        },
      },
    },
    orderBy: { purchaseDate: "asc" },
  });

  if (receipts.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <EmptyStateDemoCard
          title="Tu IPC Real y Estadísticas"
          description="Para calcular tu inflación personal y analizar la reduflación en tus compras, necesitas tickets confirmados. Sube tu primer ticket o carga datos de demostración."
        />
      </div>
    );
  }

  // Store-wide staple sightings for general inflation index benchmark
  const storeWideStapleItems = await prisma.receiptItem.findMany({
    where: {
      confirmed: true,
      excluded: false,
      product: { isStaple: true },
      receipt: { status: "CONFIRMED" },
    },
    select: {
      productId: true,
      pricePerBaseUnit: true,
      receipt: {
        select: {
          purchaseDate: true,
          storeId: true,
        },
      },
    },
    orderBy: { receipt: { purchaseDate: "asc" } },
  });

  const shrinkflationIncidents = await getShrinkflationIncidents({
    userId: session.user.id,
  });

  const serializedReceipts: StatsReceipt[] = receipts.map((r) => ({
    id: r.id,
    purchaseDate: r.purchaseDate.toISOString(),
    totalAmount: r.totalAmount ? Number(r.totalAmount) : 0,
    taxBreakdown: Array.isArray(r.taxBreakdown)
      ? (r.taxBreakdown as Array<{ rate: number; baseAmount: number; taxAmount: number }>).map((t) => ({
          rate: Number(t.rate) || 0,
          baseAmount: Number(t.baseAmount) || 0,
          taxAmount: Number(t.taxAmount) || 0,
        }))
      : null,
    store: {
      id: r.store.id,
      name: r.store.name,
      slug: r.store.slug,
      brandHex: r.store.brandHex,
    },
  }));

  const serializedItems: StatsItem[] = receipts.flatMap((r) =>
    r.items.map((item) => ({
      id: item.id,
      receiptId: r.id,
      purchaseDate: r.purchaseDate.toISOString(),
      storeName: r.store.name,
      storeBrandHex: r.store.brandHex,
      storeSlug: r.store.slug,
      rawName: item.rawName,
      suggestedName: item.suggestedName,
      category: item.product?.category || item.suggestedCat || "Other",
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unitPrice) || 0,
      totalPrice: Number(item.totalPrice) || 0,
      baseUnit: item.baseUnit as "KG" | "L" | "UNIT",
      unitMeasure: Number(item.unitMeasure) || 1,
      pricePerBaseUnit: Number(item.pricePerBaseUnit) || 0,
      productSlug: item.product?.slug || null,
      productName: item.product?.displayName || item.suggestedName,
      isStaple: item.product?.isStaple ?? false,
    }))
  );

  const serializedStapleSightings = storeWideStapleItems.map((s) => ({
    productId: s.productId,
    pricePerBaseUnit: Number(s.pricePerBaseUnit) || 0,
    purchaseDate: s.receipt.purchaseDate.toISOString(),
  }));

  return (
    <MyStatsClient
      initialReceipts={serializedReceipts}
      initialItems={serializedItems}
      stapleSightings={serializedStapleSightings}
      shrinkflationIncidents={shrinkflationIncidents}
    />
  );
}
