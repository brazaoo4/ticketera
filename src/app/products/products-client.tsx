"use client";

import React, { useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Search, X, ScanBarcode, Loader2, ArrowRight } from "lucide-react";
import {
  formatCurrency,
  formatUnitPrice,
  formatPercent,
  getStoreBrand,
} from "@/lib/format";
import { Sparkline } from "@/components/common/sparkline";
import { BarcodeScannerModal } from "@/components/common/barcode-scanner-modal";
import { getNutriScoreBadgeStyle } from "@/lib/analytics/nutrition";
import type { CatalogLookupResult } from "@/lib/catalog/parser";

export interface CatalogSighting {
  purchaseDate: string;
  storeName: string;
  storeSlug: string;
  storeBrandHex: string;
  unitPrice: number;
  pricePerBaseUnit: number;
}

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  category: string;
  baseUnit: "KG" | "L" | "UNIT";
  isStaple: boolean;
  nutriScore?: string | null;
  novaGroup?: number | null;
  ean?: string | null;
  sightings: CatalogSighting[];
}

type Timeframe = "3M" | "1Y" | "2Y";
type PriceMode = "unit" | "pack";
type SortOption =
  | "name"
  | "lowest"
  | "drop"
  | "rise"
  | "recent"
  | "most_bought";

function ProductsContent({ products }: { products: CatalogProduct[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlQuery = searchParams.get("q") || "";
  const [prevUrlQuery, setPrevUrlQuery] = useState(urlQuery);
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  if (urlQuery !== prevUrlQuery) {
    setPrevUrlQuery(urlQuery);
    setSearchQuery(urlQuery);
  }
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [timeframe, setTimeframe] = useState<Timeframe>("2Y");
  const [priceMode, setPriceMode] = useState<PriceMode>("unit");
  const initialSort = searchParams.get("sort") as SortOption;
  const [sortBy, setSortBy] = useState<SortOption>(
    initialSort === "name" ||
      initialSort === "lowest" ||
      initialSort === "drop" ||
      initialSort === "rise" ||
      initialSort === "recent" ||
      initialSort === "most_bought"
      ? initialSort
      : "name"
  );
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState<{
    loading: boolean;
    ean: string;
    localMatches: Array<{
      id: string;
      slug: string;
      displayName: string;
      category: string;
    }>;
    offMatch: CatalogLookupResult | null;
    error?: string | null;
  } | null>(null);

  const handleBarcodeDetected = async (ean: string) => {
    setBarcodeModalOpen(false);
    setBarcodeResult({
      loading: true,
      ean,
      localMatches: [],
      offMatch: null,
      error: null,
    });

    try {
      const localRes = await fetch(
        `/api/products/search?barcode=${encodeURIComponent(ean)}`
      );
      const localData = localRes.ok ? await localRes.json() : { products: [] };
      const localMatches = Array.isArray(localData.products)
        ? localData.products
        : [];

      let offMatch: CatalogLookupResult | null = null;
      try {
        const offRes = await fetch(
          `/api/catalog/lookup?barcode=${encodeURIComponent(ean)}`
        );
        if (offRes.ok) {
          const offData = await offRes.json();
          offMatch = offData.offMatch || null;
        }
      } catch {
        // Public visitors skip authenticated OpenFoodFacts lookup gracefully
      }

      if (localMatches.length > 0) {
        setSearchQuery(localMatches[0].displayName);
      } else if (offMatch?.productName) {
        setSearchQuery(offMatch.productName);
      }

      setBarcodeResult({
        loading: false,
        ean,
        localMatches,
        offMatch,
        error:
          localMatches.length === 0 && !offMatch
            ? `No tracked product or OpenFoodFacts entry matched EAN ${ean}.`
            : null,
      });
    } catch {
      setBarcodeResult({
        loading: false,
        ean,
        localMatches: [],
        offMatch: null,
        error: "Barcode lookup failed.",
      });
    }
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ["All", ...Array.from(set).sort()];
  }, [products]);

  const latestDateMs = useMemo(() => {
    let max = 0;
    products.forEach((p) => {
      p.sightings.forEach((s) => {
        const ms = new Date(s.purchaseDate).getTime();
        if (ms > max) max = ms;
      });
    });
    return max;
  }, [products]);

  const daysCutoff = timeframe === "3M" ? 92 : timeframe === "1Y" ? 366 : 732;
  const cutoffMs =
    latestDateMs > 0
      ? latestDateMs - daysCutoff * 24 * 60 * 60 * 1000
      : 0;

  const processedProducts = useMemo(() => {
    return products
      .filter((p) => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = p.name.toLowerCase().includes(q);
          const matchCat = p.category.toLowerCase().includes(q);
          const matchStore = p.sightings.some((s) =>
            s.storeName.toLowerCase().includes(q)
          );
          if (!matchName && !matchCat && !matchStore) return false;
        }
        if (selectedCategory !== "All" && p.category !== selectedCategory) {
          return false;
        }
        return true;
      })
      .map((p) => {
        const tfSightings = p.sightings.filter(
          (s) => new Date(s.purchaseDate).getTime() >= cutoffMs
        );

        const storeMap = new Map<
          string,
          { name: string; brandHex: string; price: number }
        >();
        p.sightings.forEach((s) => {
          const price = priceMode === "unit" ? s.pricePerBaseUnit : s.unitPrice;
          storeMap.set(s.storeName, {
            name: s.storeName,
            brandHex: s.storeBrandHex,
            price,
          });
        });

        const storeList = Array.from(storeMap.values()).sort(
          (a, b) => a.price - b.price
        );

        const cheapestStore = storeList[0] || {
          name: "Store",
          brandHex: "#15803D",
          price: 0,
        };
        const otherStores = storeList.slice(1);

        let periodChangePercent = 0;
        let hasPeriodHistory = false;
        if (tfSightings.length >= 2) {
          const sorted = [...tfSightings].sort(
            (a, b) =>
              new Date(a.purchaseDate).getTime() -
              new Date(b.purchaseDate).getTime()
          );

          const earliestDate = sorted[0].purchaseDate.slice(0, 10);
          const latestDate = sorted[sorted.length - 1].purchaseDate.slice(
            0,
            10
          );

          if (earliestDate !== latestDate) {
            const earliest = sorted.filter(
              (s) => s.purchaseDate.slice(0, 10) === earliestDate
            );
            const latest = sorted.filter(
              (s) => s.purchaseDate.slice(0, 10) === latestDate
            );

            const oldAvg =
              earliest.reduce(
                (sum, s) =>
                  sum +
                  (priceMode === "unit" ? s.pricePerBaseUnit : s.unitPrice),
                0
              ) / earliest.length;

            const newAvg =
              latest.reduce(
                (sum, s) =>
                  sum +
                  (priceMode === "unit" ? s.pricePerBaseUnit : s.unitPrice),
                0
              ) / latest.length;

            if (oldAvg > 0) {
              periodChangePercent = ((newAvg - oldAvg) / oldAvg) * 100;
              hasPeriodHistory = true;
            }
          }
        }

        const dayBuckets = new Map<string, number[]>();
        tfSightings.forEach((s) => {
          const dayKey = s.purchaseDate.slice(0, 10);
          const pVal = priceMode === "unit" ? s.pricePerBaseUnit : s.unitPrice;
          const bucket = dayBuckets.get(dayKey) || [];
          bucket.push(pVal);
          dayBuckets.set(dayKey, bucket);
        });

        let sparklinePoints: number[] = Array.from(dayBuckets.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([, vals]) => vals.reduce((a, b) => a + b, 0) / vals.length);

        if (sparklinePoints.length < 2 && tfSightings.length >= 2) {
          sparklinePoints = [...tfSightings]
            .sort(
              (a, b) =>
                new Date(a.purchaseDate).getTime() -
                new Date(b.purchaseDate).getTime()
            )
            .map((s) =>
              priceMode === "unit" ? s.pricePerBaseUnit : s.unitPrice
            );
        }

        const latestPurchaseMs =
          p.sightings.length > 0
            ? p.sightings.reduce((max, s) => {
                const ms = new Date(s.purchaseDate).getTime();
                return ms > max ? ms : max;
              }, 0)
            : 0;

        return {
          ...p,
          cheapestStore,
          otherStores,
          periodChangePercent,
          hasPeriodHistory,
          sparklinePoints,
          latestPurchaseMs,
          sightingsCount: p.sightings.length,
        };
      })
      .sort((a, b) => {
        if (sortBy === "name") {
          return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
        }
        if (sortBy === "lowest") {
          return a.cheapestStore.price - b.cheapestStore.price;
        }
        if (sortBy === "drop") {
          return a.periodChangePercent - b.periodChangePercent;
        }
        if (sortBy === "rise") {
          return b.periodChangePercent - a.periodChangePercent;
        }
        if (sortBy === "recent") {
          if (b.latestPurchaseMs !== a.latestPurchaseMs) {
            return b.latestPurchaseMs - a.latestPurchaseMs;
          }
          return a.name.localeCompare(b.name, "es");
        }
        if (sortBy === "most_bought") {
          if (b.sightingsCount !== a.sightingsCount) {
            return b.sightingsCount - a.sightingsCount;
          }
          return a.name.localeCompare(b.name, "es");
        }
        return 0;
      });
  }, [products, searchQuery, selectedCategory, cutoffMs, priceMode, sortBy]);

  return (
    <div className="max-w-[1120px] mx-auto px-4 sm:px-6 py-7 sm:py-10 space-y-6">
      {/* Header + Timeframe & Unit/Pack Toggles */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[25px] sm:text-[30px] font-bold leading-tight text-[var(--text-primary)]">
            Your groceries
          </h1>
          <p className="mt-1.5 text-[15px] text-[var(--text-muted)] tabular-nums">
            {processedProducts.length}{" "}
            {processedProducts.length === 1 ? "item" : "items"} tracked across
            your receipts
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div
            className="inline-flex items-center p-[3px] rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] gap-0.5"
            role="group"
            aria-label="Timeframe"
          >
            {(["3M", "1Y", "2Y"] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`h-[30px] px-3 rounded-full text-[13px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  timeframe === tf
                    ? "bg-[var(--bg-card)] text-[var(--text-primary)] font-semibold shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div
            className="inline-flex items-center p-[3px] rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] gap-0.5"
            role="group"
            aria-label="Price display mode"
          >
            <button
              type="button"
              onClick={() => setPriceMode("unit")}
              className={`h-[30px] px-3 rounded-full text-[13px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                priceMode === "unit"
                  ? "bg-[var(--bg-card)] text-[var(--text-primary)] font-semibold shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium"
              }`}
            >
              Per litre / kg
            </button>
            <button
              type="button"
              onClick={() => setPriceMode("pack")}
              className={`h-[30px] px-3 rounded-full text-[13px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                priceMode === "pack"
                  ? "bg-[var(--bg-card)] text-[var(--text-primary)] font-semibold shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium"
              }`}
            >
              Per pack
            </button>
          </div>
        </div>
      </div>

      {/* Single Search Input & Sort Select */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-[290px]">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="catalogue-search-input"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search grocery or store..."
            aria-label="Search grocery or store"
            className="w-full h-10 pl-9 pr-9 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] placeholder:font-normal focus:outline-none focus:border-[var(--primary)]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            aria-label="Sort groceries"
            className="h-10 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] cursor-pointer"
          >
            <option value="name">Sort: Name</option>
            <option value="lowest">Sort: Lowest price</option>
            <option value="drop">Sort: Biggest drop</option>
            <option value="rise">Sort: Biggest rise</option>
            <option value="recent">Sort: Recently bought</option>
            <option value="most_bought">Sort: Most bought</option>
          </select>

          <button
            type="button"
            onClick={() => setBarcodeModalOpen(true)}
            aria-label="Scan barcode"
            title="Scan barcode or enter EAN"
            className="w-10 h-10 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] hover:border-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--primary)] inline-flex items-center justify-center shrink-0 transition-colors cursor-pointer"
          >
            <ScanBarcode className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>

      {/* Barcode Lookup Result Banner */}
      {barcodeResult && (
        <div className="rounded-2xl border border-[var(--primary)]/30 bg-[var(--primary-tint)]/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-[13px]">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <ScanBarcode className="w-4 h-4 text-[var(--primary)] shrink-0" />
            <span className="font-medium text-[var(--text-primary)] tabular-nums">
              EAN {barcodeResult.ean}:
            </span>
            {barcodeResult.loading ? (
              <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--primary)]" />
                <span>Looking up product...</span>
              </span>
            ) : barcodeResult.localMatches.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {barcodeResult.localMatches.map((m) => (
                  <Link
                    key={m.id}
                    href={`/products/${m.slug}`}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--primary)] font-semibold whitespace-nowrap shrink-0 transition-colors"
                  >
                    <span>{m.displayName}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                ))}
              </div>
            ) : barcodeResult.offMatch ? (
              <span className="text-[var(--text-primary)]">
                <strong>{barcodeResult.offMatch.productName}</strong>
                {barcodeResult.offMatch.brand
                  ? ` (${barcodeResult.offMatch.brand})`
                  : ""}
                {barcodeResult.offMatch.rawQuantityText
                  ? ` · ${barcodeResult.offMatch.rawQuantityText}`
                  : ""}
              </span>
            ) : (
              <span className="text-[var(--negative)] font-medium">
                {barcodeResult.error || "No matching product found."}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setBarcodeResult(null)}
            className="w-8 h-8 rounded-full hover:bg-[var(--bg-card)]/70 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
            aria-label="Dismiss barcode result"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <BarcodeScannerModal
        isOpen={barcodeModalOpen}
        onClose={() => setBarcodeModalOpen(false)}
        onDetected={(code) => void handleBarcodeDetected(code)}
      />

      {/* Underline Category Tabs */}
      <div
        role="tablist"
        aria-label="Filter by category"
        className="flex items-center gap-5 border-b border-[var(--border)] overflow-x-auto no-scrollbar"
      >
        {categories.map((cat) => {
          const active = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedCategory(cat)}
              className={`py-2.5 -mb-px text-[13px] whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                active
                  ? "text-[var(--text-primary)] font-semibold border-[var(--primary)]"
                  : "text-[var(--text-muted)] font-medium border-transparent hover:text-[var(--text-primary)]"
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Product Cards Grid */}
      {processedProducts.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-10 text-center space-y-3">
          <p className="font-display text-[18px] font-semibold text-[var(--text-primary)]">
            No groceries match your search
          </p>
          <p className="text-[13px] text-[var(--text-muted)]">
            Try clearing your filter or searching another supermarket.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSelectedCategory("All");
              setSortBy("name");
              router.replace("/products");
            }}
            className="h-9 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] text-[13px] font-medium text-[var(--text-primary)] cursor-pointer"
          >
            Show all groceries
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {processedProducts.map((p) => {
            const isDown = p.periodChangePercent < -0.05;
            const isUp = p.periodChangePercent > 0.05;
            const trendType = isDown ? "down" : isUp ? "up" : "flat";
            const brand = getStoreBrand(
              p.cheapestStore.name,
              p.cheapestStore.brandHex
            );
            const nsBadge = getNutriScoreBadgeStyle(p.nutriScore);

            const priceText =
              priceMode === "unit"
                ? formatUnitPrice(p.cheapestStore.price, p.baseUnit)
                : formatCurrency(p.cheapestStore.price);

            const runnersText =
              p.otherStores.length > 0
                ? p.otherStores
                    .slice(0, 2)
                    .map((r) => `${r.name} ${formatCurrency(r.price)}`)
                    .join(" · ")
                : `Only bought at ${p.cheapestStore.name} so far`;

            return (
              <Link
                key={p.slug}
                href={`/products/${p.slug}`}
                className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-strong)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)] p-5 flex flex-col justify-between gap-3.5 transition-[transform,border-color,box-shadow] duration-150"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-[17px] font-semibold text-[var(--text-primary)] leading-snug">
                      {p.name}
                    </h2>
                    {p.hasPeriodHistory && (isDown || isUp) ? (
                      <span
                        className={`text-[13px] font-semibold tabular-nums whitespace-nowrap shrink-0 ${
                          isDown
                            ? "text-[var(--positive)]"
                            : "text-[var(--negative)]"
                        }`}
                      >
                        {formatPercent(p.periodChangePercent)}
                      </span>
                    ) : (
                      <span className="text-[13px] text-[var(--text-muted)] whitespace-nowrap shrink-0">
                        Stable
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-[13px] text-[var(--text-muted)]">
                    <span>{p.category}</span>
                    {nsBadge && (
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[13px] leading-none font-semibold whitespace-nowrap shrink-0 ${nsBadge.className}`}
                        title={`Nutri-Score ${nsBadge.letter}`}
                      >
                        NS {nsBadge.letter}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="font-display text-[26px] font-bold leading-none tabular-nums text-[var(--text-primary)]">
                      {priceText}
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-[13px] font-medium text-[var(--text-primary)]">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: brand.color }}
                      />
                      <span>Best at {p.cheapestStore.name}</span>
                    </div>
                  </div>
                  <Sparkline points={p.sparklinePoints} trend={trendType} />
                </div>

                <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between gap-2 text-[13px] text-[var(--text-muted)]">
                  <span className="truncate tabular-nums">{runnersText}</span>
                  <span className="font-semibold text-[var(--primary)] whitespace-nowrap shrink-0">
                    History
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ProductsClient({ products }: { products: CatalogProduct[] }) {
  return (
    <Suspense
      fallback={
        <div className="max-w-[1120px] mx-auto px-4 py-12 text-center text-[var(--text-muted)] text-[13px]">
          Loading your groceries...
        </div>
      }
    >
      <ProductsContent products={products} />
    </Suspense>
  );
}
