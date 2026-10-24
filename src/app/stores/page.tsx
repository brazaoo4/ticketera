import React from "react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { StoresClient } from "./stores-client";

export const dynamic = "force-dynamic";

export default async function StoresPage() {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  const dbStores = await prisma.store.findMany({
    orderBy: { name: "asc" },
  });

  // Calculate actual PostgreSQL statistics for every supermarket
  const stores = await Promise.all(
    dbStores.map(async (store) => {
      const [distinctProducts, receiptsCount] = await Promise.all([
        prisma.receiptItem.groupBy({
          by: ["productId"],
          where: {
            receipt: { storeId: store.id },
            confirmed: true,
            excluded: false,
            productId: { not: null },
          },
        }),
        prisma.receipt.count({
          where: { storeId: store.id },
        }),
      ]);

      return {
        id: store.id,
        name: store.name,
        slug: store.slug,
        brandHex: store.brandHex || "#10b981",
        productsCount: distinctProducts.length,
        receiptsCount,
      };
    })
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <StoresClient initialStores={stores} isLoggedIn={isLoggedIn} />
    </div>
  );
}
