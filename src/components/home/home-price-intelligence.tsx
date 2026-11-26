"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, X, Plus } from "lucide-react";
import {
  formatCurrency,
  formatUnitPrice,
  formatMeasureText,
  formatPerPackMeasure,
  formatPercent,
  formatDate,
  formatShortDate,
  getStoreBrand,
} from "@/lib/format";
import { Sparkline } from "@/components/common/sparkline";

export interface HomeProductObservation {
  purchaseDate: string;
  storeName: string;
  storeSlug: string;
  storeBrandHex: string;
  unitPrice: number;
  pricePerBaseUnit: number;
  unitMeasure: number;
  quantity: number;
  rawName: string;
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

export interface RecentReceiptLineItem {
  id: string;
  name: string;
  productSlug: string | null;
  rawName: string;
  totalPrice: number;
  unitMeasure: number;
  baseUnit: "KG" | "L" | "UNIT";
  quantity: number;
}

export interface RecentReceiptItem {
  id: string;
  storeName: string;
  storeBrandHex: string;
  purchaseDate: string;
  itemsCount: number;
  totalAmount: number;
  taxBreakdown?: Array<{
    rate: number;
    baseAmount: number;
    taxAmount: number;
  }> | null;
  items: RecentReceiptLineItem[];
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

type HomeSortOption = "name" | "drop" | "rise" | "lowest";

function DrawerHistoryChart({
  points,
  dates,
  unit,
  isDown,
}: {
  points: number[];
  dates: string[];
  unit: "KG" | "L" | "UNIT";
  isDown: boolean;
}) {
  if (points.length < 2) {
    return (
      <p className="text-[13px] text-[var(--text-muted)] py-3">
        Only one recorded price so far. More receipts will draw the trend line.
      </p>
    );
  }

  const width = 396;
  const height = 148;
  const padL = 14;
  const padR = 14;
  const padT = 24;
  const padB = 34;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || max * 0.1 || 1;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const stroke = isDown ? "var(--positive)" : "var(--negative)";

  const coords = points.map((val, idx) => ({
    x: padL + (idx / Math.max(points.length - 1, 1)) * innerW,
    y: padT + innerH - ((val - min) / range) * innerH,
    val,
    date: dates[idx] || "",
  }));

  let lineD = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 1; i < coords.length; i++) {
    const p0 = coords[i - 1];
    const p1 = coords[i];
    const cx = ((p0.x + p1.x) / 2).toFixed(1);
    lineD += ` C ${cx} ${p0.y.toFixed(1)}, ${cx} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }

  const first = coords[0];
  const last = coords[coords.length - 1];
  const baseLineY = height - padB;
  const areaD = `${lineD} L ${last.x.toFixed(1)} ${baseLineY} L ${first.x.toFixed(1)} ${baseLineY} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      fill="none"
      role="img"
      aria-label="Price history chart"
    >
      <line
        x1={padL}
        y1={padTopOrSafe(padT)}
        x2={width - padR}
        y2={padT}
        stroke="var(--border)"
        strokeDasharray="3 3"
      />
      <line
        x1={padL}
        y1={baseLineY}
        x2={width - padR}
        y2={baseLineY}
        stroke="var(--border)"
      />
      <path d={areaD} fill={stroke} fillOpacity="0.1" />
      <path
        d={lineD}
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {coords.map((c, idx) => {
        const isEdge = idx === 0 || idx === coords.length - 1;
        const anchor =
          idx === 0 ? "start" : idx === coords.length - 1 ? "end" : "middle";
        return (
          <g key={`${c.date}-${idx}`}>
            <circle
              cx={c.x}
              cy={c.y}
              r={isEdge ? 4.5 : 3.5}
              fill="var(--bg-card)"
              stroke={stroke}
              strokeWidth="2.2"
            />
            {isEdge && (
              <text
                x={c.x}
                y={Math.max(15, c.y - 10)}
                textAnchor={anchor}
                fill="var(--text-primary)"
                fontSize="13"
                fontWeight="600"
              >
                {formatUnitPrice(c.val, unit)}
              </text>
            )}
          </g>
        );
      })}
      <text
        x={padL}
        y={height - 10}
        textAnchor="start"
        fill="var(--text-muted)"
        fontSize="13"
      >
        {formatShortDate(first.date)}
      </text>
      <text
        x={width - padR}
        y={height - 10}
        textAnchor="end"
        fill="var(--text-muted)"
        fontSize="13"
      >
        {formatShortDate(last.date)}
      </text>
    </svg>
  );
}

function padTopOrSafe(v: number) {
  return v;
}

export function HomePriceIntelligence({
  products,
  recentReceipts,
  stores,
  totalReceiptsCount,
}: HomePriceIntelligenceProps) {
  const [selectedStoreSlug, setSelectedStoreSlug] = useState<string | null>(
    null
  );
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [sortBy, setSortBy] = useState<HomeSortOption>("name");
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [activeReceiptId, setActiveReceiptId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProductId && !activeReceiptId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveProductId(null);
        setActiveReceiptId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeProductId, activeReceiptId]);

  const enrichedProducts = useMemo(() => {
    return products
      .map((p) => {
        if (!p.sightings.length) return null;

        const sorted = [...p.sightings].sort(
          (a, b) =>
            new Date(a.purchaseDate).getTime() -
            new Date(b.purchaseDate).getTime()
        );

        const storeLatestMap = new Map<string, HomeProductObservation>();
        sorted.forEach((s) => {
          storeLatestMap.set(s.storeSlug, s);
        });

        const latestStores = Array.from(storeLatestMap.values()).sort(
          (a, b) => a.pricePerBaseUnit - b.pricePerBaseUnit
        );
        if (!latestStores.length) return null;

        const cheapest = latestStores[0];

        let changePercent = 0;
        let hasTrend = false;
        let oldAvg = cheapest.pricePerBaseUnit;
        let newAvg = cheapest.pricePerBaseUnit;

        if (sorted.length >= 2) {
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

            oldAvg =
              earliest.reduce((sum, s) => sum + s.pricePerBaseUnit, 0) /
              earliest.length;
            newAvg =
              latest.reduce((sum, s) => sum + s.pricePerBaseUnit, 0) /
              latest.length;

            if (oldAvg > 0) {
              changePercent = ((newAvg - oldAvg) / oldAvg) * 100;
              hasTrend = true;
            }
          }
        }

        const sparkPoints = sorted.map((s) => s.pricePerBaseUnit);
        const sparkDates = sorted.map((s) => s.purchaseDate);

        return {
          ...p,
          bestPrice: cheapest.pricePerBaseUnit,
          cheapestStoreName: cheapest.storeName,
          cheapestStoreSlug: cheapest.storeSlug,
          latestStoreName: sorted[sorted.length - 1].storeName,
          latestStores,
          changePercent,
          hasTrend,
          oldAvg,
          newAvg,
          sparkPoints,
          sparkDates,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [products]);

  const supermarketStats = useMemo(() => {
    return stores
      .map((store) => {
        let productsCount = 0;
        let wins = 0;

        enrichedProducts.forEach((p) => {
          if (p.latestStores.some((s) => s.storeSlug === store.slug)) {
            productsCount++;
          }
          if (p.cheapestStoreSlug === store.slug) {
            wins++;
          }
        });

        return {
          ...store,
          productsCount,
          wins,
          brand: getStoreBrand(store.name, store.brandHex),
        };
      })
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.productsCount !== a.productsCount) {
          return b.productsCount - a.productsCount;
        }
        return a.name.localeCompare(b.name);
      });
  }, [stores, enrichedProducts]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    enrichedProducts.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ["All", ...Array.from(set).sort()];
  }, [enrichedProducts]);

  const selectedStoreObj = useMemo(
    () => stores.find((s) => s.slug === selectedStoreSlug) || null,
    [stores, selectedStoreSlug]
  );

  const visibleProducts = useMemo(() => {
    const filtered = enrichedProducts.filter((p) => {
      if (selectedStoreSlug) {
        const atStore = p.latestStores.some(
          (s) => s.storeSlug === selectedStoreSlug
        );
        if (!atStore) return false;
      }
      if (selectedCategory !== "All" && p.category !== selectedCategory) {
        return false;
      }
      return true;
    });

    const sorted = [...filtered];
    if (sortBy === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "es"));
    } else if (sortBy === "drop") {
      sorted.sort((a, b) => a.changePercent - b.changePercent);
    } else if (sortBy === "rise") {
      sorted.sort((a, b) => b.changePercent - a.changePercent);
    } else if (sortBy === "lowest") {
      sorted.sort((a, b) => {
        const priceA = selectedStoreSlug
          ? a.latestStores.find((s) => s.storeSlug === selectedStoreSlug)
              ?.pricePerBaseUnit ?? a.bestPrice
          : a.bestPrice;
        const priceB = selectedStoreSlug
          ? b.latestStores.find((s) => s.storeSlug === selectedStoreSlug)
              ?.pricePerBaseUnit ?? b.bestPrice
          : b.bestPrice;
        return priceA - priceB;
      });
    }
    return sorted;
  }, [enrichedProducts, selectedStoreSlug, selectedCategory, sortBy]);

  const priceDrops = useMemo(
    () =>
      [...enrichedProducts]
        .filter((p) => p.hasTrend && p.changePercent <= -0.1)
        .sort((a, b) => a.changePercent - b.changePercent)
        .slice(0, 5),
    [enrichedProducts]
  );

  const priceRises = useMemo(
    () =>
      [...enrichedProducts]
        .filter((p) => p.hasTrend && p.changePercent >= 0.1)
        .sort((a, b) => b.changePercent - a.changePercent)
        .slice(0, 5),
    [enrichedProducts]
  );

  const activeProduct = useMemo(
    () => enrichedProducts.find((p) => p.id === activeProductId) || null,
    [enrichedProducts, activeProductId]
  );

  const activeReceipt = useMemo(
    () => recentReceipts.find((r) => r.id === activeReceiptId) || null,
    [recentReceipts, activeReceiptId]
  );

  if (enrichedProducts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-card)] p-10 sm:p-12 text-center space-y-4">
        <h1 className="font-display text-[25px] sm:text-[30px] font-bold text-[var(--text-primary)]">
          Your grocery prices
        </h1>
        <p className="text-[15px] text-[var(--text-muted)] max-w-md mx-auto">
          No groceries matched yet. Add a receipt to start tracking unit prices across supermarkets.
        </p>
        <div className="pt-1">
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add your first receipt</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-11">
      {/* 1. Direct Opening */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[25px] sm:text-[30px] font-bold leading-tight text-[var(--text-primary)]">
            Your grocery prices
          </h1>
          <p className="mt-1.5 text-[15px] text-[var(--text-muted)] tabular-nums">
            Latest unit prices from your {totalReceiptsCount}{" "}
            {totalReceiptsCount === 1 ? "receipt" : "receipts"} across{" "}
            {stores.length} {stores.length === 1 ? "supermarket" : "supermarkets"}.
          </p>
        </div>

        <Link
          href="/my-stats"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--primary)] hover:underline underline-offset-4 whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <span>View spending summary</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

      {/* 2. Interactive Supermarket Filter Strip */}
      <section aria-labelledby="by-supermarket-heading" className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2
            id="by-supermarket-heading"
            className="font-display text-[18px] font-semibold text-[var(--text-primary)]"
          >
            By supermarket
          </h2>
          {selectedStoreSlug && (
            <button
              type="button"
              onClick={() => setSelectedStoreSlug(null)}
              className="text-[13px] font-semibold text-[var(--primary)] hover:underline underline-offset-4 cursor-pointer whitespace-nowrap shrink-0"
            >
              All stores
            </button>
          )}
        </div>

        <div
          role="group"
          aria-label="Filter groceries by supermarket"
          className="flex md:grid md:grid-cols-3 lg:grid-cols-5 gap-3 overflow-x-auto pb-1 no-scrollbar"
        >
          {supermarketStats.map((store) => {
            const isSelected = selectedStoreSlug === store.slug;
            const summary =
              store.wins > 0
                ? `Cheapest on ${store.wins} ${store.wins === 1 ? "item" : "items"} · ${store.receiptsCount} ${store.receiptsCount === 1 ? "receipt" : "receipts"}`
                : `${store.productsCount} tracked ${store.productsCount === 1 ? "item" : "items"} · ${store.receiptsCount} ${store.receiptsCount === 1 ? "receipt" : "receipts"}`;

            return (
              <button
                key={store.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() =>
                  setSelectedStoreSlug((prev) =>
                    prev === store.slug ? null : store.slug
                  )
                }
                className={`flex-none w-[200px] md:w-auto text-left rounded-xl border p-4 transition-[transform,border-color,box-shadow,background-color] duration-150 cursor-pointer ${
                  isSelected
                    ? "border-[var(--accent)] bg-[var(--accent-tint)] shadow-sm"
                    : "border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-strong)]"
                }`}
              >
                <div className="flex items-center gap-2 font-display text-[15px] font-semibold text-[var(--text-primary)] mb-1">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: store.brand.color }}
                  />
                  <span className="truncate">{store.name}</span>
                </div>
                <p
                  className={`text-[13px] tabular-nums leading-snug ${
                    isSelected
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  {summary}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. Tracked Groceries Grid */}
      <section aria-labelledby="tracked-groceries-heading" className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2
            id="tracked-groceries-heading"
            className="font-display text-[18px] font-semibold text-[var(--text-primary)]"
          >
            Tracked groceries
          </h2>
          <span className="text-[13px] text-[var(--text-muted)] tabular-nums">
            {visibleProducts.length}{" "}
            {visibleProducts.length === 1 ? "item" : "items"}
          </span>
        </div>

        {/* Category Tabs + Sort */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)]">
          <div
            role="tablist"
            aria-label="Filter by category"
            className="flex items-center gap-5 overflow-x-auto no-scrollbar -mb-px"
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
                  className={`py-2.5 text-[13px] whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
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

          <div className="flex items-center justify-between sm:justify-end gap-2 pb-2 shrink-0">
            <label
              htmlFor="home-sort-select"
              className="text-[13px] text-[var(--text-muted)] whitespace-nowrap"
            >
              Sort:
            </label>
            <select
              id="home-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as HomeSortOption)}
              className="h-9 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] cursor-pointer"
            >
              <option value="name">Name A-Z</option>
              <option value="drop">Biggest price drop</option>
              <option value="rise">Biggest price rise</option>
              <option value="lowest">Lowest unit price</option>
            </select>
          </div>
        </div>

        {selectedStoreObj && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-[var(--accent-tint)] text-[13px] text-[var(--text-primary)]">
            <span>
              Showing groceries tracked at <strong>{selectedStoreObj.name}</strong>
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedStoreSlug(null);
                setSelectedCategory("All");
              }}
              className="font-semibold text-[var(--primary)] hover:underline underline-offset-4 cursor-pointer whitespace-nowrap shrink-0"
            >
              Clear filter
            </button>
          </div>
        )}

        {visibleProducts.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-10 text-center space-y-3">
            <p className="font-display text-[18px] font-semibold text-[var(--text-primary)]">
              No matching groceries found
            </p>
            <p className="text-[13px] text-[var(--text-muted)]">
              Try clearing your supermarket or category filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedStoreSlug(null);
                setSelectedCategory("All");
              }}
              className="h-9 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] text-[13px] font-medium text-[var(--text-primary)] cursor-pointer"
            >
              Show all groceries
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleProducts.map((p) => {
              const isDown = p.changePercent < -0.05;
              const isUp = p.changePercent > 0.05;
              const trendType = isDown ? "down" : isUp ? "up" : "flat";

              const storeEntry = selectedStoreSlug
                ? p.latestStores.find((s) => s.storeSlug === selectedStoreSlug)
                : null;
              const mainPrice = storeEntry
                ? storeEntry.pricePerBaseUnit
                : p.bestPrice;
              const mainStoreName = storeEntry
                ? storeEntry.storeName
                : p.cheapestStoreName;
              const mainStoreBrand = getStoreBrand(mainStoreName);

              const storeLineText = storeEntry
                ? storeEntry.storeName === p.cheapestStoreName
                  ? `Lowest at ${storeEntry.storeName}`
                  : `At ${storeEntry.storeName} · Lowest is ${formatCurrency(p.bestPrice)} at ${p.cheapestStoreName}`
                : `Lowest at ${p.cheapestStoreName}`;

              const otherStores = p.latestStores.filter(
                (s) => s.storeName !== mainStoreName
              );
              const footerText =
                otherStores.length > 0
                  ? `Also at ${otherStores
                      .slice(0, 2)
                      .map((s) => `${s.storeName} ${formatCurrency(s.pricePerBaseUnit)}`)
                      .join(" · ")}`
                  : `Only bought at ${mainStoreName} so far`;

              return (
                <article
                  key={p.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => setActiveProductId(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActiveProductId(p.id);
                    }
                  }}
                  className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-strong)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)] p-5 flex flex-col justify-between gap-3.5 transition-[transform,border-color,box-shadow,background-color] duration-150 cursor-pointer"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[13px] font-medium text-[var(--text-muted)] truncate">
                        {p.category}
                      </span>
                      {p.hasTrend && (isDown || isUp) ? (
                        <span
                          className={`text-[13px] font-semibold tabular-nums whitespace-nowrap shrink-0 ${
                            isDown
                              ? "text-[var(--positive)]"
                              : "text-[var(--negative)]"
                          }`}
                        >
                          {isDown ? "↓ " : "↑ "}
                          {formatPercent(p.changePercent, { showPlus: false })}
                        </span>
                      ) : (
                        <span className="text-[13px] text-[var(--text-muted)]">
                          Stable
                        </span>
                      )}
                    </div>
                    <h3 className="font-display text-[18px] font-semibold leading-snug text-[var(--text-primary)]">
                      {p.name}
                    </h3>
                  </div>

                  <div>
                    <div className="flex items-end justify-between gap-3">
                      <div className="font-display text-[26px] font-bold leading-none tabular-nums text-[var(--text-primary)]">
                        {formatUnitPrice(mainPrice, p.baseUnit)}
                      </div>
                      <Sparkline points={p.sparkPoints} trend={trendType} />
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-[13px] font-medium text-[var(--text-primary)]">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: mainStoreBrand.color }}
                      />
                      <span className="truncate">{storeLineText}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between gap-2 text-[13px] text-[var(--text-muted)]">
                    <span className="truncate tabular-nums">{footerText}</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-[var(--primary)] whitespace-nowrap shrink-0">
                      <span>History</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Recent Price Changes (2-Column Side-by-Side) */}
      <section aria-label="Recent price changes">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-5 sm:px-6 pt-5 pb-2">
            <h2 className="font-display text-[18px] font-semibold text-[var(--text-primary)]">
              Prices that went down
            </h2>
            <p className="text-[13px] text-[var(--text-muted)] mt-1 mb-3.5">
              Cheaper on your latest receipt compared to earlier trips.
            </p>
            {priceDrops.length === 0 ? (
              <p className="text-[13px] text-[var(--text-muted)] py-4 border-t border-[var(--border)]">
                No significant price drops recorded yet.
              </p>
            ) : (
              <div>
                {priceDrops.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveProductId(item.id)}
                    className="w-full flex items-center justify-between gap-3 py-3 px-1.5 -mx-1.5 rounded-lg border-t border-[var(--border)] hover:bg-[var(--bg-subtle)] text-left transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold text-[var(--text-primary)] truncate">
                        {item.name}
                      </div>
                      <div className="text-[13px] text-[var(--text-muted)] tabular-nums mt-0.5">
                        {formatUnitPrice(item.oldAvg, item.baseUnit)} →{" "}
                        {formatUnitPrice(item.newAvg, item.baseUnit)} ·{" "}
                        {item.latestStoreName}
                      </div>
                    </div>
                    <span className="text-[13px] font-semibold tabular-nums text-[var(--positive)] whitespace-nowrap shrink-0">
                      ↓ {formatPercent(item.changePercent, { showPlus: false })}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-5 sm:px-6 pt-5 pb-2">
            <h2 className="font-display text-[18px] font-semibold text-[var(--text-primary)]">
              Prices that went up
            </h2>
            <p className="text-[13px] text-[var(--text-muted)] mt-1 mb-3.5">
              Cost more per unit than on earlier trips.
            </p>
            {priceRises.length === 0 ? (
              <p className="text-[13px] text-[var(--text-muted)] py-4 border-t border-[var(--border)]">
                No significant price rises recorded yet.
              </p>
            ) : (
              <div>
                {priceRises.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveProductId(item.id)}
                    className="w-full flex items-center justify-between gap-3 py-3 px-1.5 -mx-1.5 rounded-lg border-t border-[var(--border)] hover:bg-[var(--bg-subtle)] text-left transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold text-[var(--text-primary)] truncate">
                        {item.name}
                      </div>
                      <div className="text-[13px] text-[var(--text-muted)] tabular-nums mt-0.5">
                        {formatUnitPrice(item.oldAvg, item.baseUnit)} →{" "}
                        {formatUnitPrice(item.newAvg, item.baseUnit)} ·{" "}
                        {item.latestStoreName}
                      </div>
                    </div>
                    <span className="text-[13px] font-semibold tabular-nums text-[var(--negative)] whitespace-nowrap shrink-0">
                      ↑ {formatPercent(item.changePercent, { showPlus: false })}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 5. Recent Receipts */}
      <section aria-labelledby="recent-receipts-heading" className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2
            id="recent-receipts-heading"
            className="font-display text-[18px] font-semibold text-[var(--text-primary)]"
          >
            Recent receipts
          </h2>
          <Link
            href="/my-receipts"
            className="text-[13px] font-semibold text-[var(--primary)] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
          >
            See all {totalReceiptsCount}{" "}
            {totalReceiptsCount === 1 ? "receipt" : "receipts"}
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recentReceipts.map((r) => {
            const brand = getStoreBrand(r.storeName, r.storeBrandHex);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setActiveReceiptId(r.id)}
                className="w-full text-left rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-strong)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)] px-5 py-4 flex items-center justify-between gap-4 transition-[transform,border-color,box-shadow,background-color] duration-150 cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-display text-[16px] font-semibold text-[var(--text-primary)]">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: brand.color }}
                    />
                    <span className="truncate">{r.storeName}</span>
                  </div>
                  <div className="text-[13px] text-[var(--text-muted)] tabular-nums mt-0.5">
                    {formatDate(r.purchaseDate)} · {r.itemsCount}{" "}
                    {r.itemsCount === 1 ? "item" : "items"}
                  </div>
                </div>
                <span className="font-display text-[19px] font-bold tabular-nums text-[var(--text-primary)] whitespace-nowrap shrink-0">
                  {formatCurrency(r.totalAmount)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Slide-Over Product Detail Drawer */}
      {activeProduct && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="home-product-drawer-title"
          className="fixed inset-0 z-50 flex justify-end bg-[var(--scrim)]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveProductId(null);
          }}
        >
          <div className="w-full max-w-[460px] h-full bg-[var(--bg-card)] border-l border-[var(--border)] overflow-y-auto p-6 sm:p-7 space-y-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium text-[var(--text-muted)]">
                  {activeProduct.category}
                </p>
                <h2
                  id="home-product-drawer-title"
                  className="font-display text-2xl font-bold text-[var(--text-primary)] mt-0.5"
                >
                  {activeProduct.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveProductId(null)}
                aria-label="Close product details"
                className="w-9 h-9 rounded-full border border-[var(--border)] inline-flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-[var(--bg-subtle)] p-4 sm:p-5 space-y-2">
              <div className="text-[13px] text-[var(--text-muted)]">
                Lowest unit price right now
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-display text-[30px] font-bold leading-none tabular-nums text-[var(--text-primary)]">
                  {formatUnitPrice(
                    activeProduct.bestPrice,
                    activeProduct.baseUnit
                  )}
                </span>
                {activeProduct.hasTrend && (
                  <span
                    className={`text-[13px] font-semibold tabular-nums ${
                      activeProduct.changePercent <= 0
                        ? "text-[var(--positive)]"
                        : "text-[var(--negative)]"
                    }`}
                  >
                    {activeProduct.changePercent <= 0 ? "↓ " : "↑ "}
                    {formatPercent(activeProduct.changePercent, {
                      showPlus: false,
                    })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)] pt-1">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: getStoreBrand(
                      activeProduct.cheapestStoreName
                    ).color,
                  }}
                />
                <span>Cheapest at {activeProduct.cheapestStoreName}</span>
              </div>
              {activeProduct.hasTrend && (
                <p className="text-[13px] text-[var(--text-muted)] tabular-nums">
                  Earlier average:{" "}
                  {formatUnitPrice(
                    activeProduct.oldAvg,
                    activeProduct.baseUnit
                  )}
                </p>
              )}
            </div>

            <div>
              <h3 className="font-display text-[17px] font-semibold text-[var(--text-primary)] mb-2">
                Price history
              </h3>
              <DrawerHistoryChart
                points={activeProduct.sparkPoints}
                dates={activeProduct.sparkDates}
                unit={activeProduct.baseUnit}
                isDown={activeProduct.changePercent <= 0}
              />
            </div>

            <div>
              <h3 className="font-display text-[17px] font-semibold text-[var(--text-primary)] mb-2">
                Prices by supermarket
              </h3>
              <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
                {activeProduct.latestStores.map((st, idx) => {
                  const diff = st.pricePerBaseUnit - activeProduct.bestPrice;
                  const brand = getStoreBrand(st.storeName, st.storeBrandHex);
                  return (
                    <div
                      key={st.storeSlug}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-semibold text-[15px] text-[var(--text-primary)]">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: brand.color }}
                          />
                          <span>{st.storeName}</span>
                        </div>
                        <div className="text-[13px] text-[var(--text-muted)] tabular-nums mt-0.5">
                          {formatPerPackMeasure(
                            st.unitMeasure,
                            st.quantity,
                            activeProduct.baseUnit
                          )}{" "}
                          · {formatCurrency(st.unitPrice)} ·{" "}
                          {formatDate(st.purchaseDate)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-[15px] tabular-nums text-[var(--text-primary)]">
                          {formatUnitPrice(
                            st.pricePerBaseUnit,
                            activeProduct.baseUnit
                          )}
                        </div>
                        <div
                          className={`text-[13px] tabular-nums ${
                            idx === 0
                              ? "text-[var(--positive)] font-medium"
                              : "text-[var(--text-muted)]"
                          }`}
                        >
                          {idx === 0
                            ? "Lowest price"
                            : `+${formatUnitPrice(diff, activeProduct.baseUnit)} more`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-2">
              <Link
                href={`/products/${activeProduct.slug}`}
                className="w-full h-10 px-4 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <span>Open full price history</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Slide-Over Receipt Detail Drawer */}
      {activeReceipt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="home-receipt-drawer-title"
          className="fixed inset-0 z-50 flex justify-end bg-[var(--scrim)]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveReceiptId(null);
          }}
        >
          <div className="w-full max-w-[460px] h-full bg-[var(--bg-card)] border-l border-[var(--border)] overflow-y-auto p-6 sm:p-7 space-y-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: getStoreBrand(
                        activeReceipt.storeName,
                        activeReceipt.storeBrandHex
                      ).color,
                    }}
                  />
                  <h2
                    id="home-receipt-drawer-title"
                    className="font-display text-2xl font-bold text-[var(--text-primary)]"
                  >
                    {activeReceipt.storeName}
                  </h2>
                </div>
                <p className="text-[13px] text-[var(--text-muted)] tabular-nums mt-0.5">
                  {formatDate(activeReceipt.purchaseDate)} ·{" "}
                  {activeReceipt.itemsCount}{" "}
                  {activeReceipt.itemsCount === 1 ? "item" : "items"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveReceiptId(null)}
                aria-label="Close receipt details"
                className="w-9 h-9 rounded-full border border-[var(--border)] inline-flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-[var(--bg-subtle)] p-4 sm:p-5 flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-medium text-[var(--text-muted)]">
                Receipt total
              </span>
              <span className="font-display text-[30px] font-bold tabular-nums text-[var(--text-primary)]">
                {formatCurrency(activeReceipt.totalAmount)}
              </span>
            </div>

            <div>
              <h3 className="font-display text-[17px] font-semibold text-[var(--text-primary)] mb-2">
                Items bought
              </h3>
              <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
                {activeReceipt.items.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-start justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      {it.productSlug ? (
                        <Link
                          href={`/products/${it.productSlug}`}
                          className="font-semibold text-[15px] text-[var(--text-primary)] hover:text-[var(--primary)] transition-colors"
                        >
                          {it.name}
                        </Link>
                      ) : (
                        <div className="font-semibold text-[15px] text-[var(--text-primary)]">
                          {it.name}
                        </div>
                      )}
                      <div className="text-[13px] text-[var(--text-muted)] tabular-nums mt-0.5">
                        {formatMeasureText(it.unitMeasure, it.baseUnit)}
                      </div>
                    </div>
                    <span className="font-semibold text-[15px] tabular-nums text-[var(--text-primary)] whitespace-nowrap shrink-0">
                      {formatCurrency(it.totalPrice)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {activeReceipt.taxBreakdown &&
              activeReceipt.taxBreakdown.length > 0 && (
                <div>
                  <h3 className="font-display text-[17px] font-semibold text-[var(--text-primary)] mb-2">
                    Summary and tax
                  </h3>
                  {(() => {
                    const totalBase = activeReceipt.taxBreakdown.reduce(
                      (sum, t) => sum + t.baseAmount,
                      0
                    );
                    const totalTax = activeReceipt.taxBreakdown.reduce(
                      (sum, t) => sum + t.taxAmount,
                      0
                    );
                    return (
                      <div className="divide-y divide-[var(--border)] border-y border-[var(--border)] text-[13px]">
                        <div className="flex justify-between py-2.5">
                          <span className="text-[var(--text-muted)]">
                            Subtotal before tax
                          </span>
                          <span className="font-medium tabular-nums">
                            {formatCurrency(totalBase)}
                          </span>
                        </div>
                        <div className="flex justify-between py-2.5">
                          <span className="text-[var(--text-muted)]">
                            Spanish VAT included
                          </span>
                          <span className="font-medium tabular-nums">
                            {formatCurrency(totalTax)}
                          </span>
                        </div>
                        <div className="flex justify-between py-2.5 text-[15px] font-semibold">
                          <span>Total paid</span>
                          <span className="tabular-nums">
                            {formatCurrency(activeReceipt.totalAmount)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

            <div className="pt-2">
              <Link
                href={`/receipts/${activeReceipt.id}/review`}
                className="w-full h-10 px-4 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <span>Open full receipt</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
