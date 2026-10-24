"use client";

import React, { useState, useMemo } from "react";
import { GitCompare, Sparkles, Check, ShoppingBag, Scale, Tag } from "lucide-react";
import Link from "next/link";

export interface StorePriceDetail {
  unitPrice: number;
  pricePerBaseUnit: number;
  unitMeasure: number;
  quantity: number;
}

export interface BasketItem {
  id: string;
  slug: string;
  name: string;
  category: string;
  baseUnit: "KG" | "L" | "UNIT";
  unit: string;
  details: Record<string, StorePriceDetail>;
}

export interface ComparisonStore {
  key: string;
  name: string;
  brandHex: string;
}

export function CompareClient({
  initialItems,
  stores,
}: {
  initialItems: BasketItem[];
  stores: ComparisonStore[];
}) {
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    new Set(initialItems.map((item) => item.id))
  );

  // Price Mode: "unit" (Normalized €/kg or €/L) vs "shelf" (Shelf Pack Price)
  const [priceMode, setPriceMode] = useState<"unit" | "shelf">("unit");

  const toggleItem = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedItemIds(new Set(initialItems.map((i) => i.id)));
  };

  // Helper to extract the active price depending on priceMode
  const getActivePrice = (item: BasketItem, storeKey: string): number | undefined => {
    const detail = item.details[storeKey];
    if (!detail) return undefined;
    if (priceMode === "unit") {
      return detail.pricePerBaseUnit > 0 ? detail.pricePerBaseUnit : detail.unitPrice;
    }
    return detail.unitPrice;
  };

  // Active selected items
  const activeItems = useMemo(
    () => initialItems.filter((i) => selectedItemIds.has(i.id)),
    [initialItems, selectedItemIds]
  );

  // Calculate coverage and totals for each store
  const storeStats = useMemo(() => {
    const stats: Record<
      string,
      { total: number; pricedCount: number; isComplete: boolean }
    > = {};

    for (const store of stores) {
      let sum = 0;
      let count = 0;
      for (const item of activeItems) {
        const p = getActivePrice(item, store.key);
        if (p !== undefined) {
          sum += p;
          count++;
        }
      }
      stats[store.key] = {
        total: Math.round(sum * 100) / 100,
        pricedCount: count,
        isComplete: count === activeItems.length && activeItems.length > 0,
      };
    }
    return stats;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItems, stores, priceMode]);

  // Sort stores so active stores (with priced items) appear first
  const sortedStores = useMemo(() => {
    return [...stores].sort((a, b) => {
      const countA = storeStats[a.key]?.pricedCount || 0;
      const countB = storeStats[b.key]?.pricedCount || 0;
      if (countB !== countA) return countB - countA;
      return a.name.localeCompare(b.name);
    });
  }, [stores, storeStats]);

  // Stores that have at least one price in this basket
  const storesWithPrices = useMemo(() => {
    return sortedStores.filter((s) => (storeStats[s.key]?.pricedCount || 0) > 0);
  }, [sortedStores, storeStats]);

  // Cheapest single store among stores with highest coverage
  const cheapestSingleStore = useMemo(() => {
    if (storesWithPrices.length === 0) {
      return null;
    }
    const maxCoverage = Math.max(
      ...storesWithPrices.map((s) => storeStats[s.key]?.pricedCount || 0)
    );
    const topCoverageStores = storesWithPrices.filter(
      (s) => (storeStats[s.key]?.pricedCount || 0) === maxCoverage
    );

    let best = topCoverageStores[0];
    let minT = storeStats[best.key]?.total || Infinity;

    for (const s of topCoverageStores) {
      const t = storeStats[s.key]?.total || Infinity;
      if (t < minT) {
        minT = t;
        best = s;
      }
    }

    return {
      store: best,
      total: minT,
      pricedCount: maxCoverage,
      isComplete: maxCoverage === activeItems.length,
    };
  }, [storesWithPrices, storeStats, activeItems.length]);

  // Optimal split calculation: best store for each item
  const optimalSplit = useMemo(() => {
    let splitTotal = 0;
    let maxBasketTotal = 0;
    const itemSplits: Array<{
      item: BasketItem;
      bestStore: ComparisonStore;
      bestPrice: number;
    }> = [];

    for (const item of activeItems) {
      let lowest = Infinity;
      let highest = 0;
      let lowestStore = stores[0];

      for (const store of stores) {
        const p = getActivePrice(item, store.key);
        if (p !== undefined) {
          if (p < lowest) {
            lowest = p;
            lowestStore = store;
          }
          if (p > highest) {
            highest = p;
          }
        }
      }

      if (lowest < Infinity) {
        splitTotal += lowest;
        maxBasketTotal += highest > 0 ? highest : lowest;
        itemSplits.push({
          item,
          bestStore: lowestStore,
          bestPrice: lowest,
        });
      }
    }

    const roundedSplit = Math.round(splitTotal * 100) / 100;
    const roundedMax = Math.round(maxBasketTotal * 100) / 100;

    // Savings vs worst single-store selection (always >= 0)
    const savingsVsMax = Math.max(0, Math.round((roundedMax - roundedSplit) * 100) / 100);
    const savingsPercentVsMax =
      roundedMax > 0 ? Math.round((savingsVsMax / roundedMax) * 1000) / 10 : 0;

    // Savings vs best single store (if same coverage)
    let savingsVsCheapest = 0;
    if (cheapestSingleStore && cheapestSingleStore.isComplete) {
      savingsVsCheapest = Math.max(
        0,
        Math.round((cheapestSingleStore.total - roundedSplit) * 100) / 100
      );
    }

    return {
      total: roundedSplit,
      benchmarkTotal: roundedMax,
      savingsVsCheapest,
      savingsVsMax,
      savingsPercentVsMax,
      itemSplits,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItems, stores, cheapestSingleStore, priceMode]);

  if (initialItems.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-900/30 p-12 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
          <GitCompare className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-white">No Products to Compare Yet</h2>
        <p className="text-sm text-zinc-400 max-w-md mx-auto">
          Upload and confirm your grocery receipts to start comparing identical items across Mercadona, Lidl, Carrefour, Alcampo, Consum, and DIA.
        </p>
        <div className="pt-2">
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm shadow-md shadow-emerald-500/20 transition-all whitespace-nowrap shrink-0"
          >
            <span>Scan Receipt</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header with Mode Selector */}
      <div className="border-b border-zinc-800/80 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <GitCompare className="w-6 h-6 text-emerald-400" />
            <span>Basket Comparator</span>
          </h1>
          <p className="text-sm text-zinc-400 max-w-2xl">
            Compare the real total cost of a customized grocery basket across supermarket chains with transparent unit normalization.
          </p>
        </div>

        {/* Pricing Mode Toggle: Normalized vs Shelf */}
        <div className="flex items-center gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-2xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setPriceMode("unit")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              priceMode === "unit"
                ? "bg-emerald-500 text-zinc-950 font-bold shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Normalized (€/kg · €/L)</span>
          </button>
          <button
            type="button"
            onClick={() => setPriceMode("shelf")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              priceMode === "shelf"
                ? "bg-emerald-500 text-zinc-950 font-bold shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Shelf Pack Price</span>
          </button>
        </div>
      </div>

      {/* Smart Split Basket Highlight Card */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-zinc-900/90 to-zinc-900/80 p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-semibold whitespace-nowrap">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Smart Split Basket</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Save up to {optimalSplit.savingsPercentVsMax}% across supermarkets
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Splitting items across their lowest-priced stores brings your {activeItems.length}-item basket to{" "}
              <strong className="text-white font-mono font-bold">€{optimalSplit.total.toFixed(2)}</strong>
              {priceMode === "unit" && " (normalized unit total)"}.
              {optimalSplit.savingsVsCheapest > 0 && (
                <span> That is an extra <strong className="text-emerald-400 font-mono">€{optimalSplit.savingsVsCheapest.toFixed(2)} saved</strong> compared to shopping only at the cheapest single chain.</span>
              )}
            </p>
          </div>

          <div className="bg-zinc-950/90 border border-zinc-800/90 rounded-2xl p-5 text-center min-w-[220px] space-y-1 shadow-lg shrink-0">
            <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
              Optimal Split Total
            </div>
            <div className="text-3xl font-bold font-mono text-emerald-400 tabular-nums">
              €{optimalSplit.total.toFixed(2)}
            </div>
            <div className="text-xs text-zinc-400 font-mono">
              {activeItems.length} items selected &bull; {priceMode === "unit" ? "Normalized" : "Shelf"}
            </div>
          </div>
        </div>
      </div>

      {/* Single-Store Totals Comparison Row */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">
            Single-Store Basket Totals
          </h2>
          <span className="text-xs text-zinc-500 font-mono">
            {priceMode === "unit" ? "Normalized unit comparison" : "Shelf price comparison"}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {sortedStores.map((store) => {
            const stat = storeStats[store.key] || { total: 0, pricedCount: 0, isComplete: false };
            const isLowest =
              cheapestSingleStore &&
              store.key === cheapestSingleStore.store.key &&
              stat.pricedCount > 0;

            return (
              <div
                key={store.key}
                className={`rounded-2xl border p-4 space-y-3 transition-all ${
                  isLowest
                    ? "border-emerald-500/50 bg-zinc-900/90 shadow-md ring-1 ring-emerald-500/30"
                    : stat.pricedCount > 0
                    ? "border-zinc-800/80 bg-zinc-900/40 hover:border-zinc-700"
                    : "border-zinc-800/40 bg-zinc-950/40 opacity-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="px-2.5 py-0.5 rounded-lg text-xs font-semibold text-white shadow-sm whitespace-nowrap"
                    style={{ backgroundColor: store.brandHex }}
                  >
                    {store.name}
                  </span>
                  {isLowest && (
                    <span className="text-[10px] font-semibold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 whitespace-nowrap">
                      Lowest
                    </span>
                  )}
                </div>

                <div className="pt-2 border-t border-zinc-800/60 font-mono">
                  {stat.pricedCount > 0 ? (
                    <>
                      <div className="text-xl font-bold text-white tabular-nums">
                        €{stat.total.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5 truncate">
                        {stat.isComplete
                          ? isLowest
                            ? "Best complete store"
                            : `+€${(stat.total - (cheapestSingleStore?.total || 0)).toFixed(2)}`
                          : `${stat.pricedCount}/${activeItems.length} items priced`}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-xl font-bold text-zinc-600 tabular-nums">
                        —
                      </div>
                      <div className="text-[11px] text-zinc-600 mt-0.5">
                        0 items tracked
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive Basket Items Table */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-emerald-400" />
              <span>Basket Items & Supermarket Pricing</span>
            </h2>
            <p className="text-xs text-zinc-400">
              Exact package weights, volumes, and pack counts are shown under each store price for 100% fair comparisons.
            </p>
          </div>

          <button
            type="button"
            onClick={selectAll}
            className="self-start sm:self-auto text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium whitespace-nowrap shrink-0"
          >
            Select All ({initialItems.length})
          </button>
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto rounded-2xl border border-zinc-800/80 bg-zinc-900/40">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-medium font-sans">
                <th className="py-3 px-4 w-12 text-center">In Basket</th>
                <th className="py-3 px-4">Item</th>
                <th className="py-3 px-3 text-zinc-400">Unit Basis</th>
                {sortedStores.map((s) => (
                  <th key={s.key} className="py-3 px-3 text-right">
                    <span
                      className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold text-white shadow-sm whitespace-nowrap"
                      style={{ backgroundColor: s.brandHex }}
                    >
                      {s.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {initialItems.map((item) => {
                const isSelected = selectedItemIds.has(item.id);

                let minP = Infinity;
                for (const store of sortedStores) {
                  const p = getActivePrice(item, store.key);
                  if (p !== undefined && p < minP) minP = p;
                }

                return (
                  <tr
                    key={item.id}
                    className={`transition-colors ${
                      isSelected
                        ? "hover:bg-zinc-800/30"
                        : "opacity-40 hover:opacity-75 bg-zinc-950/30"
                    }`}
                  >
                    <td
                      className="py-3 px-4 text-center cursor-pointer"
                      onClick={() => toggleItem(item.id)}
                    >
                      <div
                        className={`w-4 h-4 rounded mx-auto flex items-center justify-center transition-colors ${
                          isSelected
                            ? "bg-emerald-500 text-zinc-950"
                            : "border border-zinc-700 bg-zinc-900"
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </td>

                    <td className="py-3 px-4 font-sans">
                      <Link
                        href={`/products/${item.slug}`}
                        className="font-semibold text-zinc-200 hover:text-emerald-400 transition-colors inline-block"
                      >
                        {item.name}
                      </Link>
                      <div className="text-[10px] text-zinc-500">
                        {item.category}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-zinc-400 font-mono">
                      {item.unit}
                    </td>

                    {sortedStores.map((store) => {
                      const detail = item.details[store.key];
                      const activePrice = getActivePrice(item, store.key);
                      const isCheapest = activePrice === minP;

                      return (
                        <td
                          key={store.key}
                          className="py-3 px-3 text-right tabular-nums font-mono"
                        >
                          {detail && activePrice !== undefined ? (
                            <div className="space-y-0.5">
                              <span
                                className={
                                  isCheapest && isSelected
                                    ? "text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 inline-block"
                                    : "text-zinc-200 inline-block"
                                }
                              >
                                €{activePrice.toFixed(2)}
                                {priceMode === "unit" && item.baseUnit !== "UNIT" && (
                                  <span className="text-[10px] text-zinc-500 font-normal ml-0.5">
                                    /{item.baseUnit.toLowerCase()}
                                  </span>
                                )}
                              </span>

                              {/* Package Specification Subtitle */}
                              <div className="text-[10px] text-zinc-500 font-mono">
                                {item.baseUnit === "KG"
                                  ? `${detail.unitMeasure}kg @ €${detail.unitPrice.toFixed(2)}`
                                  : item.baseUnit === "L"
                                  ? `${detail.unitMeasure}L @ €${detail.unitPrice.toFixed(2)}`
                                  : detail.unitMeasure > 1
                                  ? `${detail.unitMeasure} uds @ €${detail.unitPrice.toFixed(2)}`
                                  : `€${detail.unitPrice.toFixed(2)} / pack`}
                              </div>
                            </div>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
