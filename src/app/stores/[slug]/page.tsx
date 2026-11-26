import React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import {
  formatCurrency,
  formatUnitPrice,
  formatPercent,
  formatDate,
  getStoreBrand,
} from "@/lib/format";
import { StoreSwitcher } from "./store-switcher";

export const dynamic = "force-dynamic";

export default async function StoreDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [store, allStores] = await Promise.all([
    prisma.store.findUnique({
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
    }),
    prisma.store.findMany({
      where: {
        receipts: {
          some: { status: "CONFIRMED" },
        },
      },
      select: { slug: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!store) {
    notFound();
  }

  const storeItems = await prisma.receiptItem.findMany({
    where: {
      receipt: { storeId: store.id, status: "CONFIRMED" },
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

  const latestDateMs =
    storeItems.length > 0
      ? Math.max(...storeItems.map((i) => i.receipt.purchaseDate.getTime()))
      : 0;
  const oneYearAgoMs = latestDateMs - 365 * 24 * 60 * 60 * 1000;

  const productSummaries = Array.from(productMap.values())
    .map(({ product, observations }) => {
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

      return {
        id: product.id,
        slug: product.slug,
        displayName: product.displayName,
        category: product.category,
        baseUnit: product.baseUnit as "KG" | "L" | "UNIT",
        rawName: latestObs.rawName,
        currentPricePerBase,
        currentPackPrice,
        diffPercent1Y,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));

  const totalReceiptsCount = await prisma.receipt.count({
    where: { storeId: store.id, status: "CONFIRMED" },
  });

  const brand = getStoreBrand(store.name, store.brandHex);
  const switcherStores = allStores.some((s) => s.slug === store.slug)
    ? allStores
    : [...allStores, { slug: store.slug, name: store.name }].sort((a, b) =>
        a.name.localeCompare(b.name)
      );

  return (
    <div className="max-w-[1120px] mx-auto px-4 sm:px-6 py-7 sm:py-10 space-y-8">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link
          href="/stores"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Supermarkets</span>
        </Link>

        {switcherStores.length > 1 && (
          <StoreSwitcher stores={switcherStores} currentSlug={store.slug} />
        )}
      </div>

      {/* Store Header Surface */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6 flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center font-display font-bold text-[16px] shrink-0"
          style={{ backgroundColor: brand.color, color: brand.fg }}
        >
          {brand.monogram}
        </div>
        <div>
          <h1 className="font-display text-[25px] sm:text-[30px] font-bold leading-tight text-[var(--text-primary)]">
            {store.name}
          </h1>
          <p className="mt-1 text-[15px] text-[var(--text-muted)] tabular-nums">
            {productSummaries.length} tracked{" "}
            {productSummaries.length === 1 ? "item" : "items"} ·{" "}
            {totalReceiptsCount}{" "}
            {totalReceiptsCount === 1 ? "receipt" : "receipts"}
          </p>
        </div>
      </div>

      {/* Tracked Prices at Store */}
      <section aria-labelledby="store-prices-heading" className="space-y-3.5">
        <div>
          <h2
            id="store-prices-heading"
            className="font-display text-[18px] font-semibold text-[var(--text-primary)]"
          >
            Prices at {store.name}
          </h2>
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
            Latest unit prices recorded from your {store.name} receipts.
          </p>
        </div>

        {productSummaries.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center text-[13px] text-[var(--text-muted)]">
            No confirmed groceries recorded from {store.name} yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {productSummaries.map((p) => (
              <Link
                key={p.slug}
                href={`/products/${p.slug}`}
                className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-strong)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)] p-5 flex flex-col justify-between gap-3 transition-[transform,border-color,box-shadow] duration-150"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-[17px] font-semibold text-[var(--text-primary)] leading-snug">
                      {p.displayName}
                    </h3>
                    {p.diffPercent1Y !== null && (
                      <span
                        className={`text-[13px] font-semibold tabular-nums whitespace-nowrap shrink-0 ${
                          p.diffPercent1Y < -0.05
                            ? "text-[var(--positive)]"
                            : p.diffPercent1Y > 0.05
                              ? "text-[var(--negative)]"
                              : "text-[var(--text-muted)]"
                        }`}
                      >
                        {formatPercent(p.diffPercent1Y)}
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] text-[var(--text-muted)] mt-1">
                    {p.category}
                  </div>
                  <div className="text-[13px] text-[var(--text-muted)] mt-1 truncate">
                    Printed as: &ldquo;{p.rawName}&rdquo;
                  </div>
                </div>

                <div className="pt-3 border-t border-[var(--border)] flex items-baseline justify-between gap-2">
                  <span className="font-display text-[22px] font-bold tabular-nums text-[var(--text-primary)]">
                    {formatUnitPrice(p.currentPricePerBase, p.baseUnit)}
                  </span>
                  <span className="text-[13px] text-[var(--text-muted)] tabular-nums">
                    Pack: {formatCurrency(p.currentPackPrice)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Recent Receipts from Store */}
      <section aria-labelledby="store-receipts-heading" className="space-y-3.5">
        <div>
          <h2
            id="store-receipts-heading"
            className="font-display text-[18px] font-semibold text-[var(--text-primary)]"
          >
            Recent receipts from {store.name}
          </h2>
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
            Confirmed receipts saved from this store.
          </p>
        </div>

        {store.receipts.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center text-[13px] text-[var(--text-muted)]">
            No confirmed receipts saved from {store.name} yet.
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] divide-y divide-[var(--border)]">
            {store.receipts.map((r) => (
              <Link
                key={r.id}
                href={`/receipts/${r.id}/review`}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-[var(--bg-subtle)]/60 transition-colors"
              >
                <div>
                  <div className="font-semibold text-[15px] tabular-nums text-[var(--text-primary)]">
                    {formatDate(r.purchaseDate)}
                  </div>
                  <div className="text-[13px] text-[var(--text-muted)] tabular-nums mt-0.5">
                    {r._count.items} {r._count.items === 1 ? "item" : "items"} ·
                    Receipt #{r.id.slice(-6)}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-display text-[19px] font-bold tabular-nums text-[var(--text-primary)]">
                    {formatCurrency(
                      r.totalAmount ? Number(r.totalAmount) : 0
                    )}
                  </span>
                  <span className="text-[13px] font-semibold text-[var(--primary)]">
                    Review →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
