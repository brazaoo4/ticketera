"use client";

import React, { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShoppingBag,
  Search,
  TrendingDown,
  TrendingUp,
  X,
  ArrowRight,
  ArrowUpDown,
  Clock,
  Flame,
  ChevronDown,
} from "lucide-react";

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
  sightings: CatalogSighting[];
}

type Timeframe = "3M" | "1Y" | "2Y";
type PriceMode = "unit" | "pack";
type SortOption = "name" | "recent" | "most_bought";

/**
 * Lightweight SVG sparkline showing price evolution over timeframe.
 */
function SparklineSvg({
  points,
  color,
}: {
  points: number[];
  color: string;
}) {
  if (points.length < 2) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-600 font-mono">
        —
      </div>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const width = 120;
  const height = 48;
  const paddingY = 6;
  const usableHeight = height - paddingY * 2;

  const coords = points.map((val, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const y = height - paddingY - ((val - min) / range) * usableHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polylineStr = coords.join(" ");
  const areaPath = `M ${coords[0]} ${coords.map((c) => `L ${c}`).join(" ")} L ${width},${height} L 0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${color.replace("#", "")})`} />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polylineStr}
      />
    </svg>
  );
}

function ProductsContent({ products }: { products: CatalogProduct[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [timeframe, setTimeframe] = useState<Timeframe>("2Y");
  const [priceMode, setPriceMode] = useState<PriceMode>("unit");
  const initialSort = searchParams.get("sort") as SortOption;
  const [sortBy, setSortBy] = useState<SortOption>(
    initialSort === "name" || initialSort === "recent" || initialSort === "most_bought"
      ? initialSort
      : "name"
  );

  // Keep search in sync
  useEffect(() => {
    const q = searchParams.get("q");
    if (q !== null) setSearchQuery(q);
  }, [searchParams]);

  // Extract all categories dynamically from PostgreSQL products
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ["All", ...Array.from(set).sort()];
  }, [products]);

  // Compute reference latest date in dataset
  const latestDateMs = useMemo(() => {
    let max = Date.now();
    products.forEach((p) => {
      p.sightings.forEach((s) => {
        const ms = new Date(s.purchaseDate).getTime();
        if (ms > max) max = ms;
      });
    });
    return max;
  }, [products]);

  const daysCutoff = timeframe === "3M" ? 92 : timeframe === "1Y" ? 366 : 732;
  const cutoffMs = latestDateMs - daysCutoff * 24 * 60 * 60 * 1000;

  // Process and filter each product
  const processedProducts = useMemo(() => {
    return products
      .filter((p) => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = p.name.toLowerCase().includes(q);
          const matchCat = p.category.toLowerCase().includes(q);
          if (!matchName && !matchCat) return false;
        }
        if (selectedCategory !== "All" && p.category !== selectedCategory) {
          return false;
        }
        return true;
      })
      .map((p) => {
        const unitLabel =
          p.baseUnit === "KG"
            ? "€/kg"
            : p.baseUnit === "L"
            ? "€/L"
            : "€/unit";

        // Filter sightings by selected timeframe
        const tfSightings = p.sightings.filter(
          (s) => new Date(s.purchaseDate).getTime() >= cutoffMs
        );

        // Store prices: latest price per store
        const storeMap = new Map<string, { name: string; brandHex: string; price: number }>();
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
          name: "Unknown",
          brandHex: "#10b981",
          price: 0,
        };

        const otherStores = storeList.slice(1);

        // Period change calculation
        let periodChangePercent = 0;
        if (tfSightings.length >= 2) {
          const sorted = [...tfSightings].sort(
            (a, b) =>
              new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime()
          );

          const earliestDate = sorted[0].purchaseDate.slice(0, 10);
          const latestDate = sorted[sorted.length - 1].purchaseDate.slice(0, 10);

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
                  sum + (priceMode === "unit" ? s.pricePerBaseUnit : s.unitPrice),
                0
              ) / earliest.length;

            const newAvg =
              latest.reduce(
                (sum, s) =>
                  sum + (priceMode === "unit" ? s.pricePerBaseUnit : s.unitPrice),
                0
              ) / latest.length;

            if (oldAvg > 0) {
              periodChangePercent = ((newAvg - oldAvg) / oldAvg) * 100;
            }
          }
        }

        // Sparkline data points (daily averages or chronological sequence)
        const dayBuckets = new Map<string, number[]>();
        tfSightings.forEach((s) => {
          const dayKey = s.purchaseDate.slice(0, 10); // YYYY-MM-DD
          const pVal = priceMode === "unit" ? s.pricePerBaseUnit : s.unitPrice;
          const bucket = dayBuckets.get(dayKey) || [];
          bucket.push(pVal);
          dayBuckets.set(dayKey, bucket);
        });

        let sparklinePoints: number[] = Array.from(dayBuckets.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([, vals]) => vals.reduce((a, b) => a + b, 0) / vals.length);

        // If multiple observations exist on the same day (e.g. across stores), plot chronological prices
        if (sparklinePoints.length < 2 && tfSightings.length >= 2) {
          sparklinePoints = [...tfSightings]
            .sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime())
            .map((s) => (priceMode === "unit" ? s.pricePerBaseUnit : s.unitPrice));
        }

        // Calculate purchase metadata for sorting and display
        const latestPurchaseMs =
          p.sightings.length > 0
            ? p.sightings.reduce((max, s) => {
                const ms = new Date(s.purchaseDate).getTime();
                return ms > max ? ms : max;
              }, 0)
            : 0;

        const sightingsCount = p.sightings.length;

        const formattedLastBought =
          latestPurchaseMs > 0
            ? new Date(latestPurchaseMs).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : null;

        return {
          ...p,
          unitLabel,
          cheapestStore,
          otherStores,
          periodChangePercent,
          sparklinePoints,
          latestPurchaseMs,
          sightingsCount,
          formattedLastBought,
        };
      })
      .sort((a, b) => {
        if (sortBy === "name") {
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        }
        if (sortBy === "recent") {
          if (b.latestPurchaseMs !== a.latestPurchaseMs) {
            return b.latestPurchaseMs - a.latestPurchaseMs;
          }
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        }
        if (sortBy === "most_bought") {
          if (b.sightingsCount !== a.sightingsCount) {
            return b.sightingsCount - a.sightingsCount;
          }
          if (b.latestPurchaseMs !== a.latestPurchaseMs) {
            return b.latestPurchaseMs - a.latestPurchaseMs;
          }
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        }
        return 0;
      });
  }, [products, searchQuery, selectedCategory, cutoffMs, priceMode, sortBy]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
      {/* Header (Clean, concise, no redundant description) */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400 shrink-0" />
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Product Catalogue
          </h1>
          <span className="text-[11px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
            {products.length} {products.length === 1 ? "product" : "products"}
          </span>
        </div>
      </div>

      {/* Search Bar & Filters */}
      <div className="space-y-2.5 sm:space-y-3">
        {/* Main Toolbar: Search + Sort + Timeframe & Price Mode */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Row 1 on mobile: Search Bar (flex-1) + Sort Selector (shrink-0) */}
          <div className="flex items-center gap-2 flex-1 max-w-full sm:max-w-md">
            {/* Search Input */}
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                <Search className="w-4 h-4" />
              </div>
              <input
                id="catalogue-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search product or category..."
                className="w-full pl-9 pr-9 py-2 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
              />
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
                  <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-500 border border-zinc-700/60 font-mono whitespace-nowrap shrink-0">
                    ⌘K
                  </kbd>
                </div>
              )}
            </div>

            {/* Sort Selector Dropdown */}
            <div className="relative shrink-0">
              <div className="flex items-center gap-1.5 h-9 sm:h-9.5 px-3 bg-zinc-900/80 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-200 transition-colors pointer-events-none">
                <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="hidden md:inline text-zinc-400 font-normal">Sort:</span>
                <span className="whitespace-nowrap shrink-0">
                  {sortBy === "name"
                    ? "Name"
                    : sortBy === "recent"
                    ? "Recent"
                    : "Most Bought"}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0 ml-0.5" />
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-xs"
                title="Sort products by name, recently bought, or most bought"
              >
                <option value="name">Name (A–Z)</option>
                <option value="recent">Recently Bought</option>
                <option value="most_bought">Most Bought</option>
              </select>
            </div>
          </div>

          {/* Row 2 on mobile / Right side on desktop: Timeframe & Price Mode */}
          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
            {/* Timeframe Pills */}
            <div className="inline-flex rounded-xl p-0.5 bg-zinc-900/80 border border-zinc-800 shrink-0">
              {(["3M", "1Y", "2Y"] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                    timeframe === tf
                      ? "bg-zinc-800 text-emerald-400 border border-zinc-700/60 shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Price Unit Mode Toggle */}
            <div className="inline-flex rounded-xl p-0.5 bg-zinc-900/80 border border-zinc-800 shrink-0">
              <button
                type="button"
                onClick={() => setPriceMode("unit")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                  priceMode === "unit"
                    ? "bg-emerald-500 text-zinc-950 font-bold shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                €/kg · €/L
              </button>
              <button
                type="button"
                onClick={() => setPriceMode("pack")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                  priceMode === "pack"
                    ? "bg-emerald-500 text-zinc-950 font-bold shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Pack €
              </button>
            </div>
          </div>
        </div>

        {/* Category Filter Pills (Scrollable with hidden scrollbar) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 max-w-full [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                selectedCategory === cat
                  ? "bg-zinc-800 text-emerald-400 border border-zinc-700 shadow-sm font-semibold"
                  : "bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80 hover:bg-zinc-900/80"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Clean Product Cards */}
      {processedProducts.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-12 text-center max-w-md mx-auto space-y-3">
          <Search className="w-8 h-8 text-zinc-500 mx-auto" />
          <h2 className="text-base font-semibold text-zinc-200">No products found</h2>
          <p className="text-xs text-zinc-400">
            No products matched your search or filters.
          </p>
          <button
            onClick={() => {
              setSearchQuery("");
              setSelectedCategory("All");
              setSortBy("name");
              router.replace("/products");
            }}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {processedProducts.map((p) => {
            const isNegative = p.periodChangePercent < 0;
            const isPositive = p.periodChangePercent > 0;

            return (
              <Link
                key={p.slug}
                href={`/products/${p.slug}`}
                className="group rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 space-y-4 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all hover:shadow-xl flex flex-col justify-between"
              >
                {/* Top: Product Name (truncate single line) + Category tag + Period Change badge */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60 text-[10px] font-medium whitespace-nowrap shrink-0">
                        {p.category}
                      </span>
                      {p.isStaple && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Staple item" />
                      )}
                      {sortBy === "recent" && p.formattedLastBought && (
                        <span className="text-[10px] font-mono text-zinc-400 whitespace-nowrap shrink-0 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5 text-zinc-500 shrink-0" />
                          <span>{p.formattedLastBought}</span>
                        </span>
                      )}
                      {sortBy === "most_bought" && (
                        <span className="text-[10px] font-mono text-zinc-400 whitespace-nowrap shrink-0 flex items-center gap-1">
                          <Flame className="w-2.5 h-2.5 text-amber-500/80 shrink-0" />
                          <span>{p.sightingsCount} {p.sightingsCount === 1 ? "purchase" : "purchases"}</span>
                        </span>
                      )}
                    </div>

                    {/* Period Change Badge */}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0 flex items-center gap-1 font-mono ${
                        isNegative
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : isPositive
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {isNegative && <TrendingDown className="w-3 h-3 shrink-0" />}
                      {isPositive && <TrendingUp className="w-3 h-3 shrink-0" />}
                      <span>
                        {isPositive ? "+" : ""}
                        {p.periodChangePercent.toFixed(1)}% ({timeframe})
                      </span>
                    </span>
                  </div>

                  <h2 className="text-base font-bold text-zinc-100 group-hover:text-emerald-300 transition-colors truncate leading-tight">
                    {p.name}
                  </h2>
                </div>

                {/* Middle (Visual): Mini Sparkline SVG + Best Current Price + Cheapest Store badge */}
                <div className="flex items-center justify-between gap-4 py-3 border-y border-zinc-800/80">
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase font-mono text-zinc-400">
                      Best Price
                    </div>
                    <div className="text-2xl font-bold font-mono text-white tabular-nums tracking-tight">
                      {p.cheapestStore.price.toFixed(2)}{" "}
                      <span className="text-xs font-normal text-zinc-400">
                        {priceMode === "unit" ? p.unitLabel : "€"}
                      </span>
                    </div>
                    <div>
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-sm inline-block whitespace-nowrap"
                        style={{ backgroundColor: p.cheapestStore.brandHex }}
                      >
                        {p.cheapestStore.name}
                      </span>
                    </div>
                  </div>

                  {/* Sparkline */}
                  <div className="w-28 h-12 shrink-0">
                    <SparklineSvg
                      points={p.sparklinePoints}
                      color={isNegative ? "#10b981" : isPositive ? "#f43f5e" : "#00B4E5"}
                    />
                  </div>
                </div>

                {/* Bottom: Compact row of other stores' current prices + "History →" */}
                <div className="flex items-center justify-between gap-2 text-xs font-mono pt-1">
                  <div className="flex items-center gap-2 text-zinc-400 truncate text-[11px]">
                    {p.otherStores.slice(0, 3).map((st) => (
                      <span key={st.name} className="truncate whitespace-nowrap">
                        <span className="text-zinc-500">{st.name}:</span>{" "}
                        <span className="text-zinc-300 font-semibold">{st.price.toFixed(2)}€</span>
                      </span>
                    ))}
                  </div>

                  <span className="text-emerald-400 group-hover:translate-x-0.5 transition-transform font-semibold whitespace-nowrap shrink-0 flex items-center gap-1 text-xs">
                    <span>History</span>
                    <ArrowRight className="w-3.5 h-3.5" />
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
        <div className="max-w-7xl mx-auto px-4 py-12 text-center text-zinc-500 text-xs font-mono">
          Loading product catalogue...
        </div>
      }
    >
      <ProductsContent products={products} />
    </Suspense>
  );
}
