import React from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { ShoppingBag, Star, FileText, Sparkles } from "lucide-react";
import { ProductManagementClient, ManagedProduct } from "./product-management-client";
import { AdminHeaderTabs } from "@/components/admin/admin-header-tabs";

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

  const totalProducts = products.length;
  const stapleCount = products.filter((p) => p.isStaple).length;
  const totalSightings = products.reduce((acc, p) => acc + p.sightingsCount, 0);
  const totalAliases = products.reduce((acc, p) => acc + p.aliasesCount, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner / Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
            <span>ADMINISTRATION</span>
            <span>/</span>
            <span className="text-emerald-400">PRODUCT CATALOGUE</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <ShoppingBag className="w-6 h-6 text-emerald-400" />
            <span>Product Catalogue</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Manage canonical product definitions, toggle staple items, and merge duplicate entries.
          </p>
        </div>
      </div>

      {/* Admin Navigation Tabs */}
      <AdminHeaderTabs />

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-mono uppercase">Total Products</span>
            <ShoppingBag className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white tabular-nums">
            {totalProducts}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-mono uppercase">Staple Items</span>
            <Star className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white tabular-nums">
            {stapleCount}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-mono uppercase">Total Sightings</span>
            <FileText className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white tabular-nums">
            {totalSightings}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-mono uppercase">POS Aliases</span>
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white tabular-nums">
            {totalAliases}
          </div>
        </div>
      </div>

      {/* Interactive Product Management Client */}
      <ProductManagementClient initialProducts={products} />
    </div>
  );
}
