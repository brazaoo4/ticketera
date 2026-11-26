"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Search, Plus } from "lucide-react";
import {
  formatCurrency,
  formatUnitPrice,
  formatPerPackMeasure,
  formatPercent,
  getStoreBrand,
} from "@/lib/format";

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
  isStaple?: boolean;
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
    () => new Set(initialItems.map((item) => item.id))
  );
  const [priceMode, setPriceMode] = useState<"unit" | "shelf">("unit");
  const [searchQuery, setSearchQuery] = useState("");
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [showUntrackedStores, setShowUntrackedStores] = useState(false);
  const [checkedOffIds, setCheckedOffIds] = useState<Set<string>>(
    () => new Set()
  );

  const toggleCheckedOff = (id: string) => {
    setCheckedOffIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleItem = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getActivePrice = (
    item: BasketItem,
    storeKey: string
  ): number | undefined => {
    const detail = item.details[storeKey];
    if (!detail) return undefined;
    if (priceMode === "unit") {
      return detail.pricePerBaseUnit > 0
        ? detail.pricePerBaseUnit
        : detail.unitPrice;
    }
    return detail.unitPrice;
  };

  const activeItems = useMemo(
    () => initialItems.filter((i) => selectedItemIds.has(i.id)),
    [initialItems, selectedItemIds]
  );

  // Stores with at least 1 tracked item across the catalogue (hides zero-receipt stores from matrix)
  const storesWithAnyHistory = useMemo(() => {
    return stores.filter((store) =>
      initialItems.some((item) => item.details[store.key] !== undefined)
    );
  }, [stores, initialItems]);

  const untrackedStores = useMemo(() => {
    const activeKeys = new Set(storesWithAnyHistory.map((s) => s.key));
    return stores.filter((s) => !activeKeys.has(s.key));
  }, [stores, storesWithAnyHistory]);

  // Single-store coverage and totals sorted by coverage DESC, then lowest total ASC
  const storeSummaries = useMemo(() => {
    return storesWithAnyHistory
      .map((store) => {
        let sum = 0;
        let covered = 0;
        for (const item of activeItems) {
          const p = getActivePrice(item, store.key);
          if (p !== undefined) {
            sum += p;
            covered++;
          }
        }
        return {
          store,
          total: Math.round(sum * 100) / 100,
          covered,
          isComplete: activeItems.length > 0 && covered === activeItems.length,
        };
      })
      .filter((s) => s.covered > 0)
      .sort((a, b) => {
        if (b.covered !== a.covered) return b.covered - a.covered;
        return a.total - b.total;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storesWithAnyHistory, activeItems, priceMode]);

  const bestFullStoreKey = useMemo(() => {
    const full = storeSummaries.find((s) => s.isComplete);
    return full ? full.store.key : null;
  }, [storeSummaries]);

  const highestCoverageLeaderKey = useMemo(() => {
    if (bestFullStoreKey || storeSummaries.length === 0) return null;
    return storeSummaries[0].store.key;
  }, [bestFullStoreKey, storeSummaries]);

  // Optimal split calculation & store-grouped shopping list
  const optimalSplit = useMemo(() => {
    let splitTotal = 0;
    let highestTotal = 0;
    const byStore = new Map<
      string,
      {
        store: ComparisonStore;
        rows: Array<{ item: BasketItem; price: number }>;
        sum: number;
      }
    >();

    for (const item of activeItems) {
      let lowest = Infinity;
      let highest = 0;
      let bestStore: ComparisonStore | null = null;

      for (const store of storesWithAnyHistory) {
        const p = getActivePrice(item, store.key);
        if (p !== undefined) {
          if (p < lowest) {
            lowest = p;
            bestStore = store;
          }
          if (p > highest) {
            highest = p;
          }
        }
      }

      if (bestStore && lowest < Infinity) {
        splitTotal += lowest;
        highestTotal += highest > 0 ? highest : lowest;
        const group = byStore.get(bestStore.key) || {
          store: bestStore,
          rows: [],
          sum: 0,
        };
        group.rows.push({ item, price: lowest });
        group.sum += lowest;
        byStore.set(bestStore.key, group);
      }
    }

    const roundedSplit = Math.round(splitTotal * 100) / 100;
    const roundedMax = Math.round(highestTotal * 100) / 100;
    const savingsEuro = Math.max(
      0,
      Math.round((roundedMax - roundedSplit) * 100) / 100
    );
    const savingsPct =
      roundedMax > 0 ? (savingsEuro / roundedMax) * 100 : 0;

    return {
      total: roundedSplit,
      savingsEuro,
      savingsPct,
      storesNeeded: byStore.size,
      groups: Array.from(byStore.values()),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItems, storesWithAnyHistory, priceMode]);

  const visibleItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return initialItems;
    return initialItems.filter(
      (i) =>
        i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)
    );
  }, [initialItems, searchQuery]);

  if (initialItems.length === 0) {
    return (
      <div className="max-w-[1120px] mx-auto px-4 sm:px-6 py-12">
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-card)] p-10 text-center space-y-4">
          <h1 className="font-display text-[25px] sm:text-[30px] font-bold text-[var(--text-primary)]">
            Compare your basket
          </h1>
          <p className="text-[15px] text-[var(--text-muted)] max-w-md mx-auto">
            Add and confirm grocery receipts to compare basket totals across supermarkets.
          </p>
          <div className="pt-1">
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add receipt</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1120px] mx-auto px-4 sm:px-6 py-7 sm:py-10 space-y-9">
      {/* Header & Comparison Mode Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[25px] sm:text-[30px] font-bold leading-tight text-[var(--text-primary)]">
            Compare your basket
          </h1>
          <p className="mt-1.5 text-[15px] text-[var(--text-muted)]">
            Select the groceries you plan to buy to compare one-stop trips against splitting across stores.
          </p>
        </div>

        <div
          className="inline-flex items-center p-[3px] rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] gap-0.5 self-start sm:self-auto"
          role="group"
          aria-label="Comparison basis"
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
            Compare by unit (kg / L)
          </button>
          <button
            type="button"
            onClick={() => setPriceMode("shelf")}
            className={`h-[30px] px-3 rounded-full text-[13px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              priceMode === "shelf"
                ? "bg-[var(--bg-card)] text-[var(--text-primary)] font-semibold shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium"
            }`}
          >
            Compare by pack price
          </button>
        </div>
      </div>

      {/* Split-Trip Summary Banner */}
      <section
        aria-label="Split trip summary"
        className="space-y-3"
      >
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--accent-tint)] p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div>
            <h2 className="font-display text-[20px] sm:text-[22px] font-semibold text-[var(--text-primary)]">
              {activeItems.length > 0
                ? `Split your list across stores to pay ${formatCurrency(optimalSplit.total)}`
                : "Select items below to compare store totals"}
            </h2>
            <p className="mt-1.5 text-[15px] text-[var(--text-muted)] tabular-nums">
              {activeItems.length > 0
                ? `${activeItems.length} ${activeItems.length === 1 ? "item" : "items"} across ${optimalSplit.storesNeeded} ${optimalSplit.storesNeeded === 1 ? "store" : "stores"}${
                    optimalSplit.savingsEuro > 0.005
                      ? `, saving ${formatCurrency(optimalSplit.savingsEuro)} (${formatPercent(optimalSplit.savingsPct, { showPlus: false })}) compared to the priciest options.`
                      : "."
                  }`
                : "Tick any groceries in the table below to build your shopping list."}
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2.5 shrink-0">
            <div className="font-display text-[32px] font-bold leading-none tabular-nums text-[var(--text-primary)]">
              {formatCurrency(optimalSplit.total)}
            </div>
            {activeItems.length > 0 && (
              <button
                type="button"
                aria-expanded={showShoppingList}
                onClick={() => setShowShoppingList((prev) => !prev)}
                className="h-9 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                {showShoppingList
                  ? "Hide shopping list"
                  : "View shopping list by store"}
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Shopping List by Store */}
        {showShoppingList && activeItems.length > 0 && (
          <div
            aria-label="Shopping list grouped by store"
            className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            <div className="col-span-full flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border)] text-[13px]">
              <span className="text-[var(--text-muted)] tabular-nums">
                {activeItems.filter((i) => checkedOffIds.has(i.id)).length} of{" "}
                {activeItems.length} picked up
              </span>
              {activeItems.some((i) => checkedOffIds.has(i.id)) && (
                <button
                  type="button"
                  onClick={() => setCheckedOffIds(new Set())}
                  className="font-semibold text-[var(--primary)] hover:underline underline-offset-4 cursor-pointer"
                >
                  Reset checklist
                </button>
              )}
            </div>

            {optimalSplit.groups.map((group) => {
              const brand = getStoreBrand(
                group.store.name,
                group.store.brandHex
              );
              return (
                <div key={group.store.key}>
                  <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[var(--border)]">
                    <span className="inline-flex items-center gap-2 font-semibold text-[15px]">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: brand.color }}
                      />
                      <span>{group.store.name}</span>
                    </span>
                    <span className="font-bold text-[15px] tabular-nums">
                      {formatCurrency(group.sum)}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {group.rows.map((r) => {
                      const isPicked = checkedOffIds.has(r.item.id);
                      return (
                        <li key={r.item.id}>
                          <label className="flex items-center justify-between gap-2 text-[13px] cursor-pointer select-none">
                            <span className="inline-flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isPicked}
                                onChange={() => toggleCheckedOff(r.item.id)}
                                className="w-4 h-4 rounded shrink-0 cursor-pointer"
                              />
                              <span
                                className={`truncate ${
                                  isPicked
                                    ? "line-through text-[var(--text-muted)]"
                                    : "text-[var(--text-primary)]"
                                }`}
                              >
                                {r.item.name}
                              </span>
                            </span>
                            <span className="text-[var(--text-muted)] tabular-nums whitespace-nowrap shrink-0">
                              {priceMode === "unit"
                                ? formatUnitPrice(r.price, r.item.baseUnit)
                                : formatCurrency(r.price)}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Single-Store Totals (Coverage-first sorting, honest partial labels) */}
      <section aria-labelledby="single-store-heading" className="space-y-3.5">
        <div>
          <h2
            id="single-store-heading"
            className="font-display text-[18px] font-semibold text-[var(--text-primary)]"
          >
            Single-store totals
          </h2>
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
            Sorted by how many of your selected items each supermarket carries,
            then by lowest total.
          </p>
        </div>

        {storeSummaries.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 text-[13px] text-[var(--text-muted)]">
            Select at least one grocery item below to see supermarket totals.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {storeSummaries.map((st) => {
              const covPct =
                activeItems.length > 0
                  ? Math.round((st.covered / activeItems.length) * 100)
                  : 0;
              const isBestFull = st.store.key === bestFullStoreKey;
              const isMostCovered = st.store.key === highestCoverageLeaderKey;
              const brand = getStoreBrand(st.store.name, st.store.brandHex);

              return (
                <div
                  key={st.store.key}
                  className={`rounded-xl border p-4 flex flex-col justify-between gap-2.5 ${
                    isBestFull
                      ? "border-[var(--positive)] bg-[var(--positive-tint)]"
                      : "border-[var(--border)] bg-[var(--bg-card)]"
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold text-[15px] text-[var(--text-primary)]">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: brand.color }}
                    />
                    <span className="truncate">{st.store.name}</span>
                  </div>

                  <div>
                    <div className="font-display text-2xl font-bold leading-tight tabular-nums text-[var(--text-primary)]">
                      {formatCurrency(st.total)}
                    </div>
                    <div
                      className={`text-[13px] mt-1 font-medium ${
                        isBestFull
                          ? "text-[var(--positive)]"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {isBestFull
                        ? "Best full basket"
                        : isMostCovered
                          ? "Most items covered"
                          : `Partial total (${st.covered} of ${activeItems.length})`}
                    </div>
                  </div>

                  <div>
                    <div className="h-[5px] w-full rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-[width] duration-200"
                        style={{
                          width: `${covPct}%`,
                          backgroundColor: isBestFull
                            ? "var(--positive)"
                            : "var(--primary)",
                        }}
                      />
                    </div>
                    <div className="text-[13px] text-[var(--text-muted)] tabular-nums mt-1.5">
                      {st.covered} of {activeItems.length} items tracked
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {untrackedStores.length > 0 && (
          <div>
            <button
              type="button"
              aria-expanded={showUntrackedStores}
              onClick={() => setShowUntrackedStores((prev) => !prev)}
              className="text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              {showUntrackedStores
                ? "Hide stores with no tracked prices"
                : `Show ${untrackedStores.length} ${untrackedStores.length === 1 ? "store" : "stores"} with no tracked prices (${untrackedStores.map((s) => s.name).join(", ")})`}
            </button>
            {showUntrackedStores && (
              <p className="mt-1.5 text-[13px] text-[var(--text-muted)]">
                No receipts uploaded yet for{" "}
                {untrackedStores.map((s) => s.name).join(", ")}. Upload a
                receipt from any of these chains and they will appear here
                automatically.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Basket Items & Store Prices Matrix / Mobile Cards */}
      <section aria-labelledby="matrix-heading" className="space-y-3">
        <div>
          <h2
            id="matrix-heading"
            className="font-display text-[18px] font-semibold text-[var(--text-primary)]"
          >
            Basket items and store prices
          </h2>
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
            {priceMode === "shelf"
              ? "Showing shelf pack prices paid on your latest receipts."
              : "Showing unit prices (per kg, litre, or unit) with pack size underneath."}
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          {/* Toolbar */}
          <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-[260px]">
              <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter items..."
                aria-label="Filter basket items"
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] placeholder:font-normal"
              />
            </div>

            <div className="flex items-center gap-4 flex-wrap text-[13px]">
              <button
                type="button"
                onClick={() =>
                  setSelectedItemIds(new Set(initialItems.map((i) => i.id)))
                }
                className="font-semibold text-[var(--primary)] hover:underline underline-offset-4 cursor-pointer"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => {
                  const staples = initialItems.filter((i) => i.isStaple);
                  const target = staples.length > 0 ? staples : initialItems;
                  setSelectedItemIds(new Set(target.map((i) => i.id)));
                }}
                className="font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Weekly essentials
              </button>
              <button
                type="button"
                onClick={() => setSelectedItemIds(new Set())}
                className="font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Clear selection
              </button>
            </div>
          </div>

          {/* Desktop Matrix Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-[13px] font-semibold text-[var(--text-muted)]">
                  <th className="py-3 px-4 w-20 whitespace-nowrap">In list</th>
                  <th className="py-3 px-4">Grocery item</th>
                  <th className="py-3 px-4">Basis</th>
                  {storesWithAnyHistory.map((s) => {
                    const brand = getStoreBrand(s.name, s.brandHex);
                    return (
                      <th key={s.key} className="py-3 px-4 text-right">
                        <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: brand.color }}
                          />
                          <span>{s.name}</span>
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] text-[15px]">
                {visibleItems.map((item) => {
                  const isSelected = selectedItemIds.has(item.id);
                  let minP = Infinity;
                  storesWithAnyHistory.forEach((s) => {
                    const p = getActivePrice(item, s.key);
                    if (p !== undefined && p < minP) minP = p;
                  });

                  return (
                    <tr
                      key={item.id}
                      className={isSelected ? "" : "opacity-55"}
                    >
                      <td className="py-3.5 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleItem(item.id)}
                          aria-label={`Include ${item.name} in basket`}
                          className="w-[18px] h-[18px] cursor-pointer"
                        />
                      </td>
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/products/${item.slug}`}
                          className="font-semibold text-[var(--text-primary)] hover:text-[var(--primary)] transition-colors"
                        >
                          {item.name}
                        </Link>
                        <div className="text-[13px] text-[var(--text-muted)]">
                          {item.category}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-[13px] text-[var(--text-muted)] tabular-nums whitespace-nowrap">
                        {priceMode === "shelf" ? "Pack" : item.unit}
                      </td>
                      {storesWithAnyHistory.map((store) => {
                        const detail = item.details[store.key];
                        const activePrice = getActivePrice(item, store.key);
                        if (!detail || activePrice === undefined) {
                          return (
                            <td
                              key={store.key}
                              className="py-3.5 px-4 text-right text-[var(--text-muted)]"
                            >
                              —
                            </td>
                          );
                        }
                        const isBest = activePrice === minP;
                        return (
                          <td
                            key={store.key}
                            className={`py-3.5 px-4 text-right tabular-nums ${
                              isBest ? "bg-[var(--positive-tint)]" : ""
                            }`}
                          >
                            <div
                              className={`whitespace-nowrap ${
                                isBest
                                  ? "font-bold text-[var(--positive)]"
                                  : "font-medium text-[var(--text-primary)]"
                              }`}
                            >
                              {priceMode === "unit"
                                ? formatUnitPrice(activePrice, item.baseUnit)
                                : formatCurrency(activePrice)}
                            </div>
                            <div className="text-[13px] text-[var(--text-muted)] whitespace-nowrap">
                              {formatPerPackMeasure(
                                detail.unitMeasure,
                                detail.quantity,
                                item.baseUnit
                              )}{" "}
                              · {formatCurrency(detail.unitPrice)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Interactive Stacked Cards */}
          <div className="md:hidden divide-y divide-[var(--border)]">
            {visibleItems.map((item) => {
              const isSelected = selectedItemIds.has(item.id);
              const storeRows = storesWithAnyHistory
                .map((store) => {
                  const p = getActivePrice(item, store.key);
                  return p !== undefined ? { store, price: p } : null;
                })
                .filter((x): x is { store: ComparisonStore; price: number } =>
                  Boolean(x)
                )
                .sort((a, b) => a.price - b.price);

              const winner = storeRows[0];

              return (
                <div
                  key={item.id}
                  className={`p-4 ${isSelected ? "" : "opacity-55"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleItem(item.id)}
                        aria-label={`Include ${item.name} in basket`}
                        className="w-[18px] h-[18px] mt-0.5 cursor-pointer shrink-0"
                      />
                      <div className="min-w-0">
                        <Link
                          href={`/products/${item.slug}`}
                          className="font-semibold text-[15px] text-[var(--text-primary)] hover:text-[var(--primary)]"
                        >
                          {item.name}
                        </Link>
                        <div className="text-[13px] text-[var(--text-muted)]">
                          {item.category}
                        </div>
                      </div>
                    </div>

                    {winner && (
                      <div className="text-right shrink-0">
                        <div className="font-bold text-[15px] tabular-nums text-[var(--positive)]">
                          {priceMode === "unit"
                            ? formatUnitPrice(winner.price, item.baseUnit)
                            : formatCurrency(winner.price)}
                        </div>
                        <div className="text-[13px] text-[var(--text-muted)]">
                          {winner.store.name}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5 pl-7">
                    {storeRows.map((entry, idx) => {
                      const brand = getStoreBrand(
                        entry.store.name,
                        entry.store.brandHex
                      );
                      return (
                        <span
                          key={entry.store.key}
                          className="inline-flex items-center gap-1.5 text-[13px] tabular-nums"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: brand.color }}
                          />
                          <span
                            className={
                              idx === 0
                                ? "font-semibold text-[var(--positive)]"
                                : "text-[var(--text-muted)]"
                            }
                          >
                            {entry.store.name} {formatCurrency(entry.price)}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
