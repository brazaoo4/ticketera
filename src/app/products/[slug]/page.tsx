import React from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getShrinkflationIncidents } from "@/lib/analytics/shrinkflation";
import {
  ProductTrackerClient,
  SightingObservation,
} from "./product-tracker-client";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const product = await prisma.product.findUnique({
    where: { slug },
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
      aliases: {
        include: {
          store: true,
        },
      },
    },
  });

  if (!product) {
    notFound();
  }

  // Serialize observations
  const sightings: SightingObservation[] = product.receiptItems.map((item) => ({
    id: item.id,
    receiptId: item.receiptId,
    purchaseDate: item.receipt.purchaseDate.toISOString(),
    storeName: item.receipt.store.name,
    storeSlug: item.receipt.store.slug,
    storeBrandHex: item.receipt.store.brandHex || "#10b981",
    rawName: item.rawName,
    unitPrice: Number(item.unitPrice),
    pricePerBaseUnit: Number(item.pricePerBaseUnit),
    baseUnit: product.baseUnit as "KG" | "L" | "UNIT",
    unitMeasure: Number(item.unitMeasure),
    quantity: Number(item.quantity),
  }));

  const aliases = product.aliases.map((a) => ({
    id: a.id,
    storeId: a.storeId,
    storeName: a.store.name,
    storeBrandHex: a.store.brandHex || "#10b981",
    rawAlias: a.rawAlias,
    unitMeasurePerPack: a.unitMeasurePerPack !== null ? Number(a.unitMeasurePerPack) : null,
    isVariableWeight: !!a.isVariableWeight,
  }));

  const session = await auth();
  const canDelete = !!session?.user;
  const isAdmin = session?.user?.role === "ADMIN";

  const shrinkflationIncidents = await getShrinkflationIncidents({ productSlug: slug });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <ProductTrackerClient
        product={{
          id: product.id,
          slug: product.slug,
          displayName: product.displayName,
          category: product.category,
          baseUnit: product.baseUnit as "KG" | "L" | "UNIT",
          isStaple: product.isStaple,
        }}
        sightings={sightings}
        aliases={aliases}
        shrinkflationIncidents={shrinkflationIncidents}
        canDelete={canDelete}
        isAdmin={isAdmin}
      />
    </div>
  );
}
