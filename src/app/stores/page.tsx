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

  const stores = await Promise.all(
    dbStores.map(async (store) => {
      const [distinctProducts, receiptsCount] = await Promise.all([
        prisma.receiptItem.groupBy({
          by: ["productId"],
          where: {
            receipt: { storeId: store.id, status: "CONFIRMED" },
            confirmed: true,
            excluded: false,
            productId: { not: null },
          },
        }),
        prisma.receipt.count({
          where: { storeId: store.id, status: "CONFIRMED" },
        }),
      ]);

      return {
        id: store.id,
        name: store.name,
        slug: store.slug,
        brandHex: store.brandHex || "#15803D",
        productsCount: distinctProducts.length,
        receiptsCount,
      };
    })
  );

  return (
    <div className="max-w-[1120px] mx-auto px-4 sm:px-6 py-7 sm:py-10">
      <StoresClient initialStores={stores} isLoggedIn={isLoggedIn} />
    </div>
  );
}
