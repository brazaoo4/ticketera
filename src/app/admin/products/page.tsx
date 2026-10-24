import React from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { ProductManagementClient, ManagedProduct } from "./product-management-client";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/admin/products");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/");
  }

  const dbProducts = await prisma.product.findMany({
    orderBy: [
      { isStaple: "desc" },
      { displayName: "asc" },
    ],
    include: {
      _count: {
        select: {
          receiptItems: {
            where: {
              confirmed: true,
              excluded: false,
              receipt: { status: "CONFIRMED" },
            },
          },
          aliases: true,
        },
      },
    },
  });

  const products: ManagedProduct[] = dbProducts.map((p) => ({
    id: p.id,
    slug: p.slug,
    displayName: p.displayName,
    category: p.category,
    baseUnit: p.baseUnit as "KG" | "L" | "UNIT",
    isStaple: p.isStaple,
    sightingsCount: p._count.receiptItems,
    aliasesCount: p._count.aliases,
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <ProductManagementClient initialProducts={products} />
    </div>
  );
}
