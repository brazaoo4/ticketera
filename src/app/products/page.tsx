import React from "react";
import { prisma } from "@/lib/db";
import { ProductsClient, CatalogProduct } from "./products-client";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  // Query 100% real PostgreSQL data, strictly no mock or hardcoded product fallbacks!
  const dbProducts = await prisma.product.findMany({
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
  });

  const catalogProducts: CatalogProduct[] = dbProducts.map((p) => ({
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

  return <ProductsClient products={catalogProducts} />;
}
