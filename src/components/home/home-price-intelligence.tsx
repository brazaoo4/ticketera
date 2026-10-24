"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  TrendingDown,
  TrendingUp,
  Camera,
  ArrowRight,
  Receipt as ReceiptIcon,
  Sparkles,
  Store as StoreIcon,
  ShoppingBag,
} from "lucide-react";

export interface HomeProductObservation {
  purchaseDate: string;
  storeName: string;
  storeSlug: string;
  storeBrandHex: string;
  unitPrice: number;
  pricePerBaseUnit: number;
}

export interface HomeProductData {
  id: string;
  slug: string;
  name: string;
  category: string;
  baseUnit: "KG" | "L" | "UNIT";
  isStaple: boolean;
  sightings: HomeProductObservation[];
}

export interface RecentReceiptItem {
  id: string;
  storeName: string;
  storeBrandHex: string;
  purchaseDate: string;
  itemsCount: number;
  totalAmount: number;
}

export interface HomeStoreData {
  id: string;
  name: string;
  slug: string;
  brandHex: string;
  receiptsCount: number;
}

interface HomePriceIntelligenceProps {
  products: HomeProductData[];
  recentReceipts: RecentReceiptItem[];
  stores: HomeStoreData[];
  totalReceiptsCount: number;
}

export function HomePriceIntelligence({
  products,
  recentReceipts,
  stores,
  totalReceiptsCount,
}: HomePriceIntelligenceProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // 1. Compute Essential Household Staples Watchlist
  const stapleWatchlist = useMemo(() => {
    // Filter for staples or products with high sightings count
    const stapleCandidates = products.filter(
      (p) => p.isStaple || p.sightings.length >= 2
    );

    return stapleCandidates
      .map((p) => {
        if (!p.sightings.length) return null;

        const sorted = [...p.sightings].sort(
          (a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime()
        );

        // Group latest sightings by store to determine current prices
        const storeLatestMap = new Map<string, HomeProductObservation>();
        sorted.forEach((s) => {
          storeLatestMap.set(s.storeName, s);
        });

        const latestStoreSightings = Array.from(storeLatestMap.values());
        if (!latestStoreSightings.length) return null;

        // Find cheapest current store
        let cheapestSighting = latestStoreSightings[0];
        let highestPrice = latestStoreSightings[0].pricePerBaseUnit;

        latestStoreSightings.forEach((s) => {
          if (s.pricePerBaseUnit < cheapestSighting.pricePerBaseUnit) {
            cheapestSighting = s;
          }
          if (s.pricePerBaseUnit > highestPrice) {
            highestPrice = s.pricePerBaseUnit;
          }
        });

        // Price change trend over time
        let changePercent = 0;
        let hasTrend = false;
        if (sorted.length >= 2) {
          const earliestDate = sorted[0].purchaseDate.slice(0, 10);
          const latestDate = sorted[sorted.length - 1].purchaseDate.slice(0, 10);
          if (earliestDate !== latestDate) {
            const earliest = sorted.filter((s) => s.purchaseDate.slice(0, 10) === earliestDate);
            const latest = sorted.filter((s) => s.purchaseDate.slice(0, 10) === latestDate);

            const oldAvg = earliest.reduce((sum, s) => sum + s.pricePerBaseUnit, 0) / earliest.length;
            const newAvg = latest.reduce((sum, s) => sum + s.pricePerBaseUnit, 0) / latest.length;

            if (oldAvg > 0) {
              changePercent = ((newAvg - oldAvg) / oldAvg) * 100;
              hasTrend = true;
            }
          }
        }

        const unitLabel =
          p.baseUnit === "KG" ? "/ kg" : p.baseUnit === "L" ? "/ L" : "/ ud";

        return {
          id: p.id,
          slug: p.slug,
          name: p.name,
          category: p.category,
          isStaple: p.isStaple,
          bestPrice: cheapestSighting.pricePerBaseUnit,
          highestPrice,
          cheapestStoreName: cheapestSighting.storeName,
          cheapestStoreHex: cheapestSighting.storeBrandHex,
          storesCount: latestStoreSightings.length,
          unitLabel,
          changePercent,
          hasTrend,
          sightingsCount: p.sightings.length,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        // Sort staples first, then by number of sightings
        if (a.isStaple !== b.isStaple) return a.isStaple ? -1 : 1;
        return b.sightingsCount - a.sightingsCount;
      });
  }, [products]);

  // Categories available in staples for the filter tabs
  const availableStapleCategories = useMemo(() => {
    const cats = new Set<string>();
    stapleWatchlist.forEach((s) => cats.add(s.category));
    return ["all", ...Array.from(cats).sort()];
  }, [stapleWatchlist]);

  // Filtered staples
  const filteredStaples = useMemo(() => {
    if (categoryFilter === "all") return stapleWatchlist.slice(0, 8);
    return stapleWatchlist.filter((s) => s.category === categoryFilter).slice(0, 8);
  }, [stapleWatchlist, categoryFilter]);

  // 2. Compute Supermarket Barometer Stats
  const supermarketStats = useMemo(() => {
    return stores.map((store) => {
      // Count products with sightings at this store
      let productsAtStore = 0;
      let cheapestStaplesCount = 0;

      products.forEach((p) => {
        const hasStore = p.sightings.some((s) => s.storeName === store.name);
        if (hasStore) productsAtStore++;
      });

      stapleWatchlist.forEach((s) => {
        if (s.cheapestStoreName === store.name) {
          cheapestStaplesCount++;
        }
      });

      return {
        ...store,
        productsCount: productsAtStore,
        cheapestStaplesCount,
      };
    });
  }, [stores, products, stapleWatchlist]);

  // 3. Compute Ranked Price Drops & Price Increases (Inflation & Deflation)
  const rankedProductChanges = useMemo(() => {
    return products
      .map((p) => {
        if (p.sightings.length < 2) return null;

        const sorted = [...p.sightings].sort(
          (a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime()
        );

        const earliestDate = sorted[0].purchaseDate.slice(0, 10);
        const latestDate = sorted[sorted.length - 1].purchaseDate.slice(0, 10);

        if (earliestDate === latestDate) return null;

        const earliest = sorted.filter((s) => s.purchaseDate.slice(0, 10) === earliestDate);
        const latest = sorted.filter((s) => s.purchaseDate.slice(0, 10) === latestDate);

        const oldAvg = earliest.reduce((sum, s) => sum + s.pricePerBaseUnit, 0) / earliest.length;
        const newAvg = latest.reduce((sum, s) => sum + s.pricePerBaseUnit, 0) / latest.length;

        const changePercent = oldAvg > 0 ? ((newAvg - oldAvg) / oldAvg) * 100 : 0;
        const bestCurrentPrice = Math.min(...latest.map((s) => s.pricePerBaseUnit));
        const unitLabel = p.baseUnit === "KG" ? "/ kg" : p.baseUnit === "L" ? "/ L" : "/ ud";

        return {
          slug: p.slug,
          name: p.name,
          category: p.category,
          bestPrice: bestCurrentPrice,
          unitLabel,
          changePercent,
          oldAvg,
          newAvg,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [products]);

  const priceDrops = useMemo(() => {
    return [...rankedProductChanges]
      .filter((item) => item.changePercent <= -0.1)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, 5);
  }, [rankedProductChanges]);

  const priceHikes = useMemo(() => {
    return [...rankedProductChanges]
      .filter((item) => item.changePercent >= 0.1)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 5);
  }, [rankedProductChanges]);

  if (products.length === 0) {
    return (
      <div className="space-y-10">
        {/* Empty State */}
        <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-900/30 p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
            <Sparkles className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white">Start Building Your Grocery Price Tracker</h2>
          <p className="text-sm text-zinc-400 max-w-md mx-auto">
            No products in catalogue yet. Upload your first supermarket receipts to build your catalogue organically and track price changes across stores.
          </p>
          <div className="pt-2">
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm shadow-md shadow-emerald-500/20 transition-all whitespace-nowrap shrink-0"
            >
              <Camera className="w-4 h-4 stroke-[2.4]" />
              <span>Upload Your First Receipt</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* 1. Hero Title & Market Pulse Barometer */}
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-950 p-6 sm:p-8 shadow-xl space-y-6">
        <div className="space-y-1.5 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>LIVE PRICE INTELLIGENCE</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Spanish Grocery Price Tracker
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
            Track multi-year inflation, spot verified price drops, and discover which supermarket is cheapest for your weekly household staples.
          </p>
        </div>

        {/* 3-Slot Market Pulse Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-zinc-800/80">
          <div className="p-3.5 rounded-2xl bg-zinc-900/50 border border-zinc-800/60 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-white tabular-nums">
                {products.length}
              </div>
              <div className="text-[11px] text-zinc-400 font-mono">Tracked Products</div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-zinc-900/50 border border-zinc-800/60 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
              <StoreIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-white tabular-nums">
                {stores.length}
              </div>
              <div className="text-[11px] text-zinc-400 font-mono">Monitored Chains</div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-zinc-900/50 border border-zinc-800/60 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
              <ReceiptIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-white tabular-nums">
                {totalReceiptsCount}
              </div>
              <div className="text-[11px] text-zinc-400 font-mono">Verified Tickets</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. ⭐ Essential Staples Market Watch (Clean, mobile-first cards) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>Essential Staples Watchlist</span>
            </h2>
            <p className="text-xs text-zinc-400">
              Current lowest verified prices for household essentials. Tap any staple to view its multi-year price graph.
            </p>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            {availableStapleCategories.slice(0, 5).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                  categoryFilter === cat
                    ? "bg-emerald-500 text-zinc-950 shadow-sm"
                    : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                }`}
              >
                {cat === "all" ? "All Staples" : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Staples Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredStaples.map((staple) => (
            <Link
              key={staple.id}
              href={`/products/${staple.slug}`}
              className="group p-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-700 transition-all flex flex-col justify-between space-y-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/50 truncate">
                    {staple.category}
                  </span>

                  {staple.hasTrend && staple.changePercent !== 0 ? (
                    <span
                      className={`inline-flex items-center gap-0.5 text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        staple.changePercent < 0
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-rose-500/10 text-rose-400"
                      }`}
                    >
                      {staple.changePercent < 0 ? (
                        <TrendingDown className="w-3 h-3" />
                      ) : (
                        <TrendingUp className="w-3 h-3" />
                      )}
                      <span>
                        {staple.changePercent > 0 ? "+" : ""}
                        {staple.changePercent.toFixed(1)}%
                      </span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-zinc-500">Stable</span>
                  )}
                </div>

                <h3 className="font-bold text-sm text-zinc-100 group-hover:text-emerald-400 transition-colors line-clamp-2">
                  {staple.name}
                </h3>
              </div>

              {/* Price Callout */}
              <div className="border-t border-zinc-800/80 pt-2.5 space-y-1.5">
                <div className="flex items-baseline gap-1 font-mono">
                  <span className="text-2xl font-bold text-white tabular-nums">
                    €{staple.bestPrice.toFixed(2)}
                  </span>
                  <span className="text-xs text-zinc-400 font-normal">
                    {staple.unitLabel}
                  </span>
                </div>

                {/* Cheapest Store Badge */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: staple.cheapestStoreHex }}
                    />
                    <span className="text-zinc-300 text-xs font-medium truncate">
                      Cheapest at {staple.cheapestStoreName}
                    </span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* 3. Supermarket Price Barometer */}
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-6 sm:p-8 space-y-4 shadow-xl">
        <div className="space-y-1 border-b border-zinc-800 pb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <StoreIcon className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>Supermarket Price Standing</span>
          </h2>
          <p className="text-xs text-zinc-400">
            Verified ticket volume and staple competitiveness across monitored supermarket chains.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {supermarketStats.map((store) => (
            <Link
              key={store.id}
              href={`/stores/${store.slug}`}
              className="p-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 hover:bg-zinc-900/60 hover:border-zinc-700 transition-all space-y-2 group"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 truncate">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: store.brandHex }}
                  />
                  <span className="font-bold text-sm text-zinc-100 group-hover:text-emerald-400 transition-colors truncate">
                    {store.name}
                  </span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all shrink-0" />
              </div>

              <div className="space-y-1 font-mono text-xs pt-1">
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Tracked items:</span>
                  <span className="font-bold text-white tabular-nums">
                    {store.productsCount}
                  </span>
                </div>
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Verified tickets:</span>
                  <span className="font-bold text-white tabular-nums">
                    {store.receiptsCount}
                  </span>
                </div>
                {store.cheapestStaplesCount > 0 && (
                  <div className="pt-1">
                    <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Cheapest on {store.cheapestStaplesCount} staples
                    </span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* 4. Market Movers: Price Drops & Increases */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Biggest Price Drops (Deflation & Deals) */}
        <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Biggest Price Drops</span>
            </h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap shrink-0">
              Deflation
            </span>
          </div>

          {priceDrops.length === 0 ? (
            <p className="text-xs text-zinc-500 font-mono py-4 text-center">
              No significant price drops detected yet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {priceDrops.map((item) => (
                <Link
                  key={item.slug}
                  href={`/products/${item.slug}`}
                  className="p-3 rounded-xl border border-zinc-800/60 bg-zinc-950/40 hover:bg-zinc-900/60 transition-colors flex items-center justify-between gap-3 text-xs group"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-zinc-200 group-hover:text-emerald-400 transition-colors truncate">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono">
                      {item.category} • From €{item.oldAvg.toFixed(2)} {item.unitLabel}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="inline-block px-2 py-0.5 rounded font-mono font-bold text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 tabular-nums">
                      {item.changePercent.toFixed(1)}%
                    </span>
                    <span className="block font-mono text-white font-bold text-xs pt-0.5 tabular-nums">
                      €{item.bestPrice.toFixed(2)} {item.unitLabel}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Biggest Price Increases (Inflation Alerts) */}
        <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Biggest Price Increases</span>
            </h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 whitespace-nowrap shrink-0">
              Inflation
            </span>
          </div>

          {priceHikes.length === 0 ? (
            <p className="text-xs text-zinc-500 font-mono py-4 text-center">
              No significant price increases detected yet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {priceHikes.map((item) => (
                <Link
                  key={item.slug}
                  href={`/products/${item.slug}`}
                  className="p-3 rounded-xl border border-zinc-800/60 bg-zinc-950/40 hover:bg-zinc-900/60 transition-colors flex items-center justify-between gap-3 text-xs group"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-zinc-200 group-hover:text-rose-400 transition-colors truncate">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono">
                      {item.category} • From €{item.oldAvg.toFixed(2)} {item.unitLabel}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="inline-block px-2 py-0.5 rounded font-mono font-bold text-xs bg-rose-500/10 text-rose-400 border border-rose-500/30 tabular-nums">
                      +{item.changePercent.toFixed(1)}%
                    </span>
                    <span className="block font-mono text-white font-bold text-xs pt-0.5 tabular-nums">
                      €{item.bestPrice.toFixed(2)} {item.unitLabel}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 5. Recent Confirmed Receipts Feed */}
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-6 sm:p-8 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <ReceiptIcon className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>Recent Confirmed Receipts</span>
            </h2>
            <p className="text-xs text-zinc-400">Verified grocery receipts scanned by the community.</p>
          </div>
          <Link
            href="/upload"
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <span>Upload Ticket</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {recentReceipts.map((r) => (
            <Link
              key={r.id}
              href={`/receipts/${r.id}/review`}
              className="p-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 hover:bg-zinc-900/60 hover:border-zinc-700 transition-all flex items-center justify-between gap-4 group"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold text-white shrink-0 shadow-sm"
                    style={{ backgroundColor: r.storeBrandHex }}
                  >
                    {r.storeName}
                  </span>
                  <span className="text-[11px] text-zinc-500 font-mono">
                    {new Date(r.purchaseDate).toLocaleDateString("en-GB")}
                  </span>
                </div>
                <div className="text-xs text-zinc-400 font-mono">
                  {r.itemsCount} line {r.itemsCount === 1 ? "item" : "items"}
                </div>
              </div>

              <div className="text-right font-mono shrink-0">
                <div className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors tabular-nums">
                  €{r.totalAmount.toFixed(2)}
                </div>
                <span className="text-[10px] text-zinc-500 flex items-center justify-end gap-1">
                  <span>View</span>
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
