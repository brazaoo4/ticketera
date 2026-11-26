import React from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminHeaderTabs } from "@/components/admin/admin-header-tabs";
import {
  ProductManagementClient,
  type ManagedProduct,
} from "./product-management-client";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/");
  }

  const rawProducts = await prisma.product.findMany({
    include: {
      _count: {
        select: {
          receiptItems: true,
          aliases: true,
        },
      },
    },
    orderBy: [
      { isStaple: "desc" },
      { receiptItems: { _count: "desc" } },
      { displayName: "asc" },
    ],
  });

  const products: ManagedProduct[] = rawProducts.map((p) => ({
    id: p.id,
    slug: p.slug,
    displayName: p.displayName,
    category: p.category,
    baseUnit: p.baseUnit as "KG" | "L" | "UNIT",
    isStaple: p.isStaple,
    sightingsCount: p._count.receiptItems,
    aliasesCount: p._count.aliases,
    nutriScore: p.nutriScore ?? null,
    novaGroup: p.novaGroup ?? null,
    proteinPer100g:
      p.proteinPer100g !== null ? Number(p.proteinPer100g) : null,
    kcalPer100g: p.kcalPer100g !== null ? Number(p.kcalPer100g) : null,
    ean: p.ean ?? null,
  }));

  const totalProducts = products.length;
  const stapleCount = products.filter((p) => p.isStaple).length;
  const totalPurchases = products.reduce(
    (sum, p) => sum + p.sightingsCount,
    0
  );
  const totalAliases = products.reduce((sum, p) => sum + p.aliasesCount, 0);

  return (
    <div className="max-w-[1120px] mx-auto px-4 sm:px-6 py-7 sm:py-10 space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-display font-bold text-[28px] sm:text-[34px] leading-tight text-[var(--text-primary)]">
          Settings and administration
        </h1>
        <p className="text-[14px] text-[var(--text-muted)]">
          Manage grocery product names, pack units, household staples, and
          duplicate merges.
        </p>
      </div>

      <AdminHeaderTabs />

      {/* 4-Column Hairline Metrics Strip */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] grid grid-cols-2 lg:grid-cols-4 overflow-hidden">
        <div className="p-4 sm:p-5 space-y-1">
          <div className="text-[13px] text-[var(--text-muted)]">
            Tracked groceries
          </div>
          <div className="font-display font-bold text-[24px] tabular-nums text-[var(--text-primary)]">
            {totalProducts}
          </div>
        </div>
        <div className="p-4 sm:p-5 space-y-1 border-l border-[var(--border)]">
          <div className="text-[13px] text-[var(--text-muted)]">
            Household staples
          </div>
          <div className="font-display font-bold text-[24px] tabular-nums text-[var(--accent)]">
            {stapleCount}
          </div>
        </div>
        <div className="p-4 sm:p-5 space-y-1 border-t lg:border-t-0 lg:border-l border-[var(--border)]">
          <div className="text-[13px] text-[var(--text-muted)]">
            Recorded purchases
          </div>
          <div className="font-display font-bold text-[24px] tabular-nums text-[var(--text-primary)]">
            {totalPurchases}
          </div>
        </div>
        <div className="p-4 sm:p-5 space-y-1 border-t lg:border-t-0 border-l border-[var(--border)]">
          <div className="text-[13px] text-[var(--text-muted)]">
            Receipt name matches
          </div>
          <div className="font-display font-bold text-[24px] tabular-nums text-[var(--text-primary)]">
            {totalAliases}
          </div>
        </div>
      </div>

      <ProductManagementClient initialProducts={products} />
    </div>
  );
}
