import React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  ShoppingBag,
  FileText,
  ArrowLeft,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Receipt as ReceiptIcon,
} from "lucide-react";

export const dynamic = "force-dynamic";

function getStoreMonogram(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  const upper = name.toUpperCase();
  if (upper.startsWith("CARR")) return "CR";
  if (upper.startsWith("MERC")) return "MC";
  if (upper.startsWith("ALC")) return "AC";
  if (upper.startsWith("ALD")) return "AL";
  return name.substring(0, 2).toUpperCase();
}

export default async function StoreDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const store = await prisma.store.findUnique({
    where: { slug },
    include: {
      receipts: {
        where: { status: "CONFIRMED" },
        orderBy: { purchaseDate: "desc" },
        take: 10,
        include: {
          _count: { select: { items: true } },
        },
      },
    },
  });

  if (!store) {
    notFound();
  }

  // Fetch all confirmed items bought at this store
  const storeItems = await prisma.receiptItem.findMany({
    where: {
      receipt: { storeId: store.id },
      confirmed: true,
      excluded: false,
      productId: { not: null },
    },
    include: {
      product: true,
      receipt: true,
    },
    orderBy: {
      receipt: { purchaseDate: "asc" },
    },
  });

  // Group items by product
  const productMap = new Map<
    string,
    {
      product: NonNullable<(typeof storeItems)[0]["product"]>;
      observations: typeof storeItems;
    }
  >();

  storeItems.forEach((item) => {
    if (!item.product) return;
    const existing = productMap.get(item.product.id);
    if (!existing) {
      productMap.set(item.product.id, {
        product: item.product,
        observations: [item],
      });
    } else {
      existing.observations.push(item);
    }
  });

  // Reference date: latest purchase date in storeItems
  const latestDateMs =
    storeItems.length > 0
      ? Math.max(...storeItems.map((i) => i.receipt.purchaseDate.getTime()))
      : Date.now();

  const oneYearAgoMs = latestDateMs - 365 * 24 * 60 * 60 * 1000;

  const productSummaries = Array.from(productMap.values()).map(
    ({ product, observations }) => {
      const latestObs = observations[observations.length - 1];
      const old1YObs = observations.find(
        (o) => o.receipt.purchaseDate.getTime() <= oneYearAgoMs
      );

      const currentPricePerBase = Number(latestObs.pricePerBaseUnit);
      const currentPackPrice = Number(latestObs.unitPrice);

      let diffPercent1Y: number | null = null;
      if (old1YObs) {
        const oldP = Number(old1YObs.pricePerBaseUnit);
        if (oldP > 0) {
          diffPercent1Y = ((currentPricePerBase - oldP) / oldP) * 100;
        }
      }

      const unitLabel =
        product.baseUnit === "KG"
          ? "€/kg"
          : product.baseUnit === "L"
          ? "€/L"
          : "€/unit";

      return {
        id: product.id,
        slug: product.slug,
        displayName: product.displayName,
        category: product.category,
        baseUnit: product.baseUnit,
        unitLabel,
        rawName: latestObs.rawName,
        currentPricePerBase,
        currentPackPrice,
        diffPercent1Y,
        lastSeenDate: latestObs.receipt.purchaseDate,
      };
    }
  );

  productSummaries.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const totalReceiptsCount = await prisma.receipt.count({
    where: { storeId: store.id },
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
        <Link
          href="/stores"
          className="hover:text-zinc-200 transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Stores</span>
        </Link>
        <span>/</span>
        <span className="text-emerald-400 font-semibold truncate">
          {store.name}
        </span>
      </div>

      {/* Supermarket Header Banner */}
      <div className="rounded-3xl border border-zinc-800/80 bg-gradient-to-r from-zinc-900/90 via-zinc-900/60 to-zinc-950 p-6 sm:p-8 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-white shadow-xl text-xl shrink-0"
            style={{ backgroundColor: store.brandHex || "#10b981" }}
          >
            {getStoreMonogram(store.name)}
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {store.name}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400">
              Verified price intelligence and receipt observations for {store.name}.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 border-t md:border-t-0 md:border-l border-zinc-800 pt-4 md:pt-0 md:pl-6 text-xs font-mono">
          <div className="space-y-0.5">
            <div className="text-[11px] text-zinc-400 flex items-center gap-1 font-sans">
              <ShoppingBag className="w-3.5 h-3.5 text-zinc-400" />
              <span>Tracked Items</span>
            </div>
            <div className="text-xl font-bold font-mono text-white tabular-nums">
              {productSummaries.length}
            </div>
          </div>

          <div className="space-y-0.5">
            <div className="text-[11px] text-zinc-400 flex items-center gap-1 font-sans">
              <FileText className="w-3.5 h-3.5 text-zinc-400" />
              <span>Total Receipts</span>
            </div>
            <div className="text-xl font-bold font-mono text-white tabular-nums">
              {totalReceiptsCount}
            </div>
          </div>
        </div>
      </div>

      {/* Tracked Products at this Supermarket */}
      <div className="space-y-4">
        <div className="space-y-0.5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-400" />
            <span>Tracked Products at {store.name}</span>
          </h2>
          <p className="text-xs text-zinc-400">
            Current normalized prices and 1-year historical inflation recorded at this chain.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {productSummaries.map((p) => (
            <Link
              key={p.slug}
              href={`/products/${p.slug}`}
              className="group rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 space-y-3 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60 text-[10px] font-medium whitespace-nowrap">
                    {p.category}
                  </span>
                  {p.diffPercent1Y !== null && (
                    <span
                      className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap ${
                        p.diffPercent1Y < 0
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : p.diffPercent1Y > 0
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {p.diffPercent1Y < 0 && <TrendingDown className="w-3 h-3" />}
                      {p.diffPercent1Y > 0 && <TrendingUp className="w-3 h-3" />}
                      <span>
                        {p.diffPercent1Y > 0 ? "+" : ""}
                        {p.diffPercent1Y.toFixed(1)}% (1Y)
                      </span>
                    </span>
                  )}
                </div>

                <h3 className="text-base font-bold text-zinc-100 group-hover:text-emerald-300 transition-colors truncate">
                  {p.displayName}
                </h3>
                <div className="text-[11px] text-zinc-500 font-mono truncate" title={p.rawName}>
                  POS: &ldquo;{p.rawName}&rdquo;
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-800/80 flex items-baseline justify-between">
                <div>
                  <div className="text-xl font-bold font-mono text-white tabular-nums">
                    €{p.currentPricePerBase.toFixed(2)}{" "}
                    <span className="text-xs font-normal text-zinc-400">
                      {p.unitLabel}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono">
                    Pack: €{p.currentPackPrice.toFixed(2)}
                  </div>
                </div>

                <div className="text-xs font-semibold text-emerald-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                  <span>Price History</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Receipts from this Supermarket */}
      <div className="space-y-4">
        <div className="space-y-0.5">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <ReceiptIcon className="w-4 h-4 text-emerald-400" />
            <span>Recent Receipts from {store.name}</span>
          </h2>
          <p className="text-xs text-zinc-400">
            Confirmed purchase tickets recorded in PostgreSQL for this supermarket.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {store.receipts.map((r) => (
            <Link
              key={r.id}
              href={`/receipts/${r.id}/review`}
              className="p-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-950 transition-all space-y-2 group"
            >
              <div className="text-xs font-mono text-zinc-400 flex items-center justify-between">
                <span>{new Date(r.purchaseDate).toLocaleDateString("en-GB")}</span>
                <span className="text-emerald-400">#{r.id.slice(-6)}</span>
              </div>

              <div className="pt-2 border-t border-zinc-800/60 flex items-baseline justify-between">
                <div>
                  <div className="text-lg font-bold font-mono text-white tabular-nums">
                    €{r.totalAmount ? Number(r.totalAmount).toFixed(2) : "0.00"}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono">
                    {r._count.items} line items
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
