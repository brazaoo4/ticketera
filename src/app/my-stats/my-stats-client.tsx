"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  TrendingDown,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Package,
  Store as StoreIcon,
  ReceiptText,
  ArrowUpRight,
} from "lucide-react";
import {
  formatCurrency,
  formatWholeCurrency,
  formatUnitPrice,
  formatMeasureText,
  formatPercent,
  formatDate,
  formatMonthShort,
  formatMonthYear,
  getUTCMonthKey,
  getStoreBrand,
} from "@/lib/format";
import type { ShrinkflationIncident } from "@/lib/analytics/shrinkflation-types";
import { ExportDataMenu } from "@/components/common/export-data-menu";
import { MonthlyBudgetsSection } from "@/components/stats/monthly-budgets-section";
import { NutritionValueSection } from "@/components/stats/nutrition-value-section";
import type { UserBudgetTarget } from "@/lib/analytics/budgets";

export interface TaxBreakdownBracket {
  rate: number;
  baseAmount: number;
  taxAmount: number;
}

export interface StatsReceipt {
  id: string;
  purchaseDate: string;
  totalAmount: number;
  taxBreakdown?: TaxBreakdownBracket[] | null;
  store: {
    id: string;
    name: string;
    slug: string;
    brandHex: string;
  };
}

export interface StatsItem {
  id: string;
  receiptId: string;
  purchaseDate: string;
  storeName: string;
  storeBrandHex: string;
  storeSlug?: string;
  rawName: string;
  suggestedName: string;
  category: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  baseUnit: "KG" | "L" | "UNIT";
  unitMeasure: number;
  pricePerBaseUnit: number;
  productId?: string | null;
  productSlug?: string | null;
  productName?: string | null;
  isStaple?: boolean;
  nutriScore?: string | null;
  novaGroup?: number | null;
  proteinPer100g?: number | null;
  kcalPer100g?: number | null;
}

export interface StapleSighting {
  productId: string | null;
  pricePerBaseUnit: number;
  purchaseDate: string;
}

interface MyStatsClientProps {
  initialReceipts: StatsReceipt[];
  initialItems: StatsItem[];
  stapleSightings?: StapleSighting[];
  shrinkflationIncidents?: ShrinkflationIncident[];
  initialBudgets?: UserBudgetTarget[];
  untaggedFoodProductCount?: number;
}

type Timeframe = "3M" | "6M" | "1Y" | "All";
type ChartMode = "stacked" | "total";

const CATEGORY_PALETTE: Record<string, string> = {
  "Dairy & Eggs": "#D97706",
  "Meat & Poultry": "#DC2626",
  "Fish & Seafood": "#0284C7",
  "Fruits & Vegetables": "#15803D",
  Bakery: "#EA580C",
  Pantry: "#7C3AED",
  "Oils & Condiments": "#CA8A04",
  Beverages: "#2563EB",
  "Frozen Foods": "#0EA5E9",
  "Cleaning & Household": "#0D9488",
  "Personal Care": "#DB2777",
};

function getCategoryColor(category: string): string {
  return CATEGORY_PALETTE[category] || "#64748B";
}

function getTimeframeCutoffMs(
  receipts: StatsReceipt[],
  timeframe: Timeframe
): number | null {
  if (timeframe === "All" || receipts.length === 0) return null;
  const maxDate = receipts.reduce((max, r) => {
    const ms = new Date(r.purchaseDate).getTime();
    return ms > max ? ms : max;
  }, 0);
  if (!maxDate) return null;
  const days = timeframe === "3M" ? 92 : timeframe === "6M" ? 184 : 366;
  return maxDate - days * 24 * 60 * 60 * 1000;
}

function topRoundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): string {
  const rad = Math.max(0, Math.min(r, w / 2, h));
  if (rad <= 0) {
    return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
  }
  return [
    `M ${x} ${y + h}`,
    `V ${y + rad}`,
    `Q ${x} ${y} ${x + rad} ${y}`,
    `H ${x + w - rad}`,
    `Q ${x + w} ${y} ${x + w} ${y + rad}`,
    `V ${y + h}`,
    `Z`,
  ].join(" ");
}

function niceCeil(maxVal: number): number {
  if (maxVal <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxVal)));
  const normalized = maxVal / magnitude;
  let step = 10;
  if (normalized <= 1.2) step = 1.2;
  else if (normalized <= 1.5) step = 1.5;
  else if (normalized <= 2) step = 2;
  else if (normalized <= 2.5) step = 2.5;
  else if (normalized <= 3) step = 3;
  else if (normalized <= 4) step = 4;
  else if (normalized <= 5) step = 5;
  else if (normalized <= 6) step = 6;
  else if (normalized <= 8) step = 8;
  return step * magnitude;
}

export function MyStatsClient({
  initialReceipts,
  initialItems,
  stapleSightings = [],
  shrinkflationIncidents = [],
  initialBudgets = [],
  untaggedFoodProductCount = 0,
}: MyStatsClientProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1Y");
  const [chartMode, setChartMode] = useState<ChartMode>("stacked");
  const [selectedStoreSlug, setSelectedStoreSlug] = useState<string>("all");
  const [hoveredMonthKey, setHoveredMonthKey] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const cutoffMs = useMemo(
    () => getTimeframeCutoffMs(initialReceipts, timeframe),
    [initialReceipts, timeframe]
  );

  const filteredReceipts = useMemo(() => {
    if (!cutoffMs) return initialReceipts;
    return initialReceipts.filter(
      (r) => new Date(r.purchaseDate).getTime() >= cutoffMs
    );
  }, [initialReceipts, cutoffMs]);

  const filteredItems = useMemo(() => {
    if (!cutoffMs) return initialItems;
    return initialItems.filter(
      (it) => new Date(it.purchaseDate).getTime() >= cutoffMs
    );
  }, [initialItems, cutoffMs]);

  const filteredShrinkflation = useMemo(() => {
    if (!cutoffMs) return shrinkflationIncidents;
    return shrinkflationIncidents.filter(
      (inc) => new Date(inc.date).getTime() >= cutoffMs
    );
  }, [shrinkflationIncidents, cutoffMs]);

  // Unique stores ranked by spend inside window
  const storeSummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        slug: string;
        name: string;
        brandHex: string;
        trips: number;
        total: number;
      }
    >();
    filteredReceipts.forEach((r) => {
      const existing = map.get(r.store.slug);
      if (existing) {
        existing.trips += 1;
        existing.total += r.totalAmount;
      } else {
        map.set(r.store.slug, {
          slug: r.store.slug,
          name: r.store.name,
          brandHex: r.store.brandHex,
          trips: 1,
          total: r.totalAmount,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredReceipts]);

  // Total & Average summary
  const spendMetrics = useMemo(() => {
    const total = filteredReceipts.reduce((s, r) => s + r.totalAmount, 0);
    const trips = filteredReceipts.length;
    const avgTrip = trips > 0 ? total / trips : 0;
    const monthKeys = new Set(
      filteredReceipts.map((r) => getUTCMonthKey(r.purchaseDate))
    );
    const monthCount = Math.max(1, monthKeys.size);
    const monthlyAvg = total / monthCount;
    return { total, trips, avgTrip, monthCount, monthlyAvg };
  }, [filteredReceipts]);

  // Monthly Spending Series for SVG Chart
  const monthlySeries = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        shortLabel: string;
        fullLabel: string;
        trips: number;
        total: number;
        byStore: Record<string, number>;
      }
    >();

    filteredReceipts.forEach((r) => {
      if (selectedStoreSlug !== "all" && r.store.slug !== selectedStoreSlug) {
        return;
      }
      const key = getUTCMonthKey(r.purchaseDate);
      let entry = map.get(key);
      if (!entry) {
        entry = {
          key,
          shortLabel: formatMonthShort(r.purchaseDate),
          fullLabel: formatMonthYear(r.purchaseDate),
          trips: 0,
          total: 0,
          byStore: {},
        };
        map.set(key, entry);
      }
      entry.trips += 1;
      entry.total += r.totalAmount;
      entry.byStore[r.store.slug] =
        (entry.byStore[r.store.slug] || 0) + r.totalAmount;
    });

    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [filteredReceipts, selectedStoreSlug]);

  // Personal inflation weighted across repeat purchases
  const personalInflation = useMemo(() => {
    const groups = new Map<
      string,
      Array<{ dateMs: number; normPrice: number; spend: number }>
    >();

    filteredItems.forEach((it) => {
      if (it.pricePerBaseUnit <= 0) return;
      const key =
        it.productSlug || it.productName || it.suggestedName || it.rawName;
      const arr = groups.get(key) || [];
      arr.push({
        dateMs: new Date(it.purchaseDate).getTime(),
        normPrice: it.pricePerBaseUnit,
        spend: Math.max(0.01, it.totalPrice),
      });
      groups.set(key, arr);
    });

    let baselineSpend = 0;
    let currentSpend = 0;
    let totalMonthlyImpact = 0;
    let analyzedCount = 0;

    groups.forEach((entries) => {
      if (entries.length < 2) return;
      const sorted = [...entries].sort((a, b) => a.dateMs - b.dateMs);
      const splitIdx = Math.max(1, Math.floor(sorted.length / 2));
      const early = sorted.slice(0, splitIdx);
      const late = sorted.slice(splitIdx);
      if (early.length === 0 || late.length === 0) return;

      const earlyAvg =
        early.reduce((s, e) => s + e.normPrice, 0) / early.length;
      const lateAvg = late.reduce((s, e) => s + e.normPrice, 0) / late.length;
      if (earlyAvg <= 0) return;

      const productSpend = sorted.reduce((s, e) => s + e.spend, 0);
      baselineSpend += productSpend;
      currentSpend += productSpend * (lateAvg / earlyAvg);
      analyzedCount += 1;
    });

    if (baselineSpend <= 0 || analyzedCount === 0) {
      return {
        hasData: false,
        rate: 0,
        monthlyImpact: 0,
        analyzedCount: 0,
      };
    }

    const rate = ((currentSpend - baselineSpend) / baselineSpend) * 100;
    const monthsSpan = Math.max(1, spendMetrics.monthCount);
    totalMonthlyImpact = (currentSpend - baselineSpend) / monthsSpan;

    return {
      hasData: true,
      rate,
      monthlyImpact: totalMonthlyImpact,
      analyzedCount,
    };
  }, [filteredItems, spendMetrics.monthCount]);

  // Store-wide staple inflation benchmark
  const storeWideStapleRate = useMemo(() => {
    if (!stapleSightings.length) return null;
    const scoped = cutoffMs
      ? stapleSightings.filter(
          (s) => new Date(s.purchaseDate).getTime() >= cutoffMs
        )
      : stapleSightings;

    const byProd = new Map<string, Array<{ ms: number; p: number }>>();
    scoped.forEach((s) => {
      if (!s.productId || s.pricePerBaseUnit <= 0) return;
      const arr = byProd.get(s.productId) || [];
      arr.push({
        ms: new Date(s.purchaseDate).getTime(),
        p: s.pricePerBaseUnit,
      });
      byProd.set(s.productId, arr);
    });

    let sumRates = 0;
    let count = 0;
    byProd.forEach((arr) => {
      if (arr.length < 2) return;
      const sorted = [...arr].sort((a, b) => a.ms - b.ms);
      const half = Math.max(1, Math.floor(sorted.length / 2));
      const p1 = sorted.slice(0, half).reduce((s, x) => s + x.p, 0) / half;
      const p2 =
        sorted.slice(half).reduce((s, x) => s + x.p, 0) /
        (sorted.length - half);
      if (p1 > 0) {
        sumRates += ((p2 - p1) / p1) * 100;
        count += 1;
      }
    });

    return count > 0 ? sumRates / count : null;
  }, [stapleSightings, cutoffMs]);

  // Category Breakdown + Drilldown Items
  const categoryBreakdown = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        total: number;
        itemCount: number;
        products: Map<
          string,
          {
            name: string;
            slug: string | null;
            spend: number;
            count: number;
            latestNormPrice: number;
            baseUnit: "KG" | "L" | "UNIT";
          }
        >;
      }
    >();

    let grandTotal = 0;

    filteredItems.forEach((it) => {
      const cat = it.category || "Other";
      const spend = Math.max(0, it.totalPrice);
      grandTotal += spend;

      let catEntry = map.get(cat);
      if (!catEntry) {
        catEntry = {
          name: cat,
          total: 0,
          itemCount: 0,
          products: new Map(),
        };
        map.set(cat, catEntry);
      }
      catEntry.total += spend;
      catEntry.itemCount += 1;

      const prodKey = it.productSlug || it.suggestedName || it.rawName;
      const prodTitle = it.productName || it.suggestedName || it.rawName;
      const existingProd = catEntry.products.get(prodKey);
      if (existingProd) {
        existingProd.spend += spend;
        existingProd.count += 1;
        existingProd.latestNormPrice = it.pricePerBaseUnit;
      } else {
        catEntry.products.set(prodKey, {
          name: prodTitle,
          slug: it.productSlug || null,
          spend,
          count: 1,
          latestNormPrice: it.pricePerBaseUnit,
          baseUnit: it.baseUnit,
        });
      }
    });

    return Array.from(map.values())
      .map((c) => ({
        name: c.name,
        total: c.total,
        sharePct: grandTotal > 0 ? (c.total / grandTotal) * 100 : 0,
        itemCount: c.itemCount,
        topProducts: Array.from(c.products.values())
          .sort((a, b) => b.spend - a.spend)
          .slice(0, 6),
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredItems]);

  // Most Purchased Groceries (Top Staples Grid)
  const topGroceries = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        name: string;
        slug: string | null;
        category: string;
        baseUnit: "KG" | "L" | "UNIT";
        totalSpend: number;
        entries: Array<{ dateMs: number; unitPrice: number }>;
      }
    >();

    filteredItems.forEach((it) => {
      const key = it.productSlug || it.suggestedName || it.rawName;
      const name = it.productName || it.suggestedName || it.rawName;
      let existing = map.get(key);
      if (!existing) {
        existing = {
          key,
          name,
          slug: it.productSlug || null,
          category: it.category || "Other",
          baseUnit: it.baseUnit,
          totalSpend: 0,
          entries: [],
        };
        map.set(key, existing);
      }
      existing.totalSpend += it.totalPrice;
      existing.entries.push({
        dateMs: new Date(it.purchaseDate).getTime(),
        unitPrice: it.pricePerBaseUnit,
      });
    });

    return Array.from(map.values())
      .map((p) => {
        const sorted = [...p.entries].sort((a, b) => a.dateMs - b.dateMs);
        const firstPrice = sorted[0]?.unitPrice ?? 0;
        const latestPrice = sorted[sorted.length - 1]?.unitPrice ?? 0;
        const deltaPct =
          sorted.length >= 2 && firstPrice > 0
            ? ((latestPrice - firstPrice) / firstPrice) * 100
            : null;
        return {
          ...p,
          buyCount: p.entries.length,
          latestPrice,
          deltaPct,
        };
      })
      .sort((a, b) => b.buyCount - a.buyCount || b.totalSpend - a.totalSpend)
      .slice(0, 9);
  }, [filteredItems]);

  // Spanish VAT Brackets Summary
  const vatBrackets = useMemo(() => {
    const byRate = new Map<
      number,
      { rate: number; baseAmount: number; taxAmount: number }
    >();

    filteredReceipts.forEach((r) => {
      if (!Array.isArray(r.taxBreakdown)) return;
      r.taxBreakdown.forEach((t) => {
        const rate = Number(t.rate);
        if (!Number.isFinite(rate)) return;
        const existing = byRate.get(rate);
        if (existing) {
          existing.baseAmount += t.baseAmount;
          existing.taxAmount += t.taxAmount;
        } else {
          byRate.set(rate, {
            rate,
            baseAmount: t.baseAmount,
            taxAmount: t.taxAmount,
          });
        }
      });
    });

    const rows = Array.from(byRate.values()).sort((a, b) => a.rate - b.rate);
    const totalVat = rows.reduce((s, r) => s + r.taxAmount, 0);
    const totalBase = rows.reduce((s, r) => s + r.baseAmount, 0);
    return { rows, totalVat, totalBase };
  }, [filteredReceipts]);

  // SVG Chart geometry
  const maxMonthTotal = useMemo(() => {
    const rawMax = monthlySeries.reduce((m, d) => Math.max(m, d.total), 0);
    return niceCeil(rawMax);
  }, [monthlySeries]);

  const activeHoverMonth = useMemo(() => {
    if (!monthlySeries.length) return null;
    if (hoveredMonthKey) {
      const found = monthlySeries.find((m) => m.key === hoveredMonthKey);
      if (found) return found;
    }
    return monthlySeries[monthlySeries.length - 1];
  }, [monthlySeries, hoveredMonthKey]);

  const chartSvgWidth = Math.max(640, monthlySeries.length * 64 + 80);
  const chartSvgHeight = 250;
  const padLeft = 64;
  const padRight = 20;
  const padTop = 18;
  const padBottom = 38;
  const plotW = chartSvgWidth - padLeft - padRight;
  const plotH = chartSvgHeight - padTop - padBottom;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    value: maxMonthTotal * ratio,
    y: padTop + plotH - ratio * plotH,
  }));

  const primaryStore = storeSummaries[0] || null;

  return (
    <div className="max-w-[1120px] mx-auto px-4 sm:px-6 py-7 sm:py-10 space-y-8">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="font-display font-bold text-[28px] sm:text-[34px] leading-tight text-[var(--text-primary)]">
            Your grocery spending
          </h1>
          <p className="text-[14px] text-[var(--text-muted)]">
            Monthly supermarket totals, household price changes, and category
            breakdowns across your confirmed receipts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div
            className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-card)] p-0.5"
            role="group"
            aria-label="Spending timeframe"
          >
            {(["3M", "6M", "1Y", "All"] as Timeframe[]).map((tf) => {
              const active = timeframe === tf;
              return (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={`h-8 px-3 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? "bg-[var(--text-primary)] text-[var(--bg-page)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {tf}
                </button>
              );
            })}
          </div>

          <ExportDataMenu range={timeframe.toLowerCase()} label="Export CSV" />
        </div>
      </div>

      {/* 3-Column Summary Strip (Zero Nested Boxes) */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[var(--border)]">
        <div className="p-5 sm:p-6 space-y-1">
          <div className="text-[13px] text-[var(--text-muted)] flex items-center gap-1.5">
            <ReceiptText className="w-4 h-4 text-[var(--primary)]" />
            Total spent
          </div>
          <div className="font-display font-bold text-[28px] tabular-nums text-[var(--text-primary)]">
            {formatCurrency(spendMetrics.total)}
          </div>
          <p className="text-[13px] text-[var(--text-muted)] tabular-nums">
            {spendMetrics.trips}{" "}
            {spendMetrics.trips === 1 ? "receipt" : "receipts"} · avg{" "}
            {formatCurrency(spendMetrics.avgTrip)}/trip ·{" "}
            {formatCurrency(spendMetrics.monthlyAvg)}/mo
          </p>
        </div>

        <div className="p-5 sm:p-6 space-y-1">
          <div className="text-[13px] text-[var(--text-muted)] flex items-center gap-1.5">
            {personalInflation.hasData && personalInflation.rate > 0 ? (
              <TrendingUp className="w-4 h-4 text-[var(--negative)]" />
            ) : (
              <TrendingDown className="w-4 h-4 text-[var(--positive)]" />
            )}
            Your basket price change
          </div>
          <div
            className={`font-display font-bold text-[28px] tabular-nums ${
              !personalInflation.hasData
                ? "text-[var(--text-primary)]"
                : personalInflation.rate > 0.2
                ? "text-[var(--negative)]"
                : personalInflation.rate < -0.2
                ? "text-[var(--positive)]"
                : "text-[var(--text-primary)]"
            }`}
          >
            {personalInflation.hasData
              ? formatPercent(personalInflation.rate)
              : "Needs more trips"}
          </div>
          <p className="text-[13px] text-[var(--text-muted)] tabular-nums">
            {personalInflation.hasData ? (
              <>
                {personalInflation.monthlyImpact >= 0 ? "+" : ""}
                {formatCurrency(personalInflation.monthlyImpact)}/mo across{" "}
                {personalInflation.analyzedCount} repeat items
                {storeWideStapleRate !== null
                  ? ` (staples avg ${formatPercent(storeWideStapleRate)})`
                  : ""}
              </>
            ) : (
              "Buy repeat products over time to track personal price shifts."
            )}
          </p>
        </div>

        <div className="p-5 sm:p-6 space-y-1">
          <div className="text-[13px] text-[var(--text-muted)] flex items-center gap-1.5">
            <StoreIcon className="w-4 h-4 text-[var(--accent)]" />
            Main supermarket
          </div>
          <div className="font-display font-bold text-[28px] text-[var(--text-primary)] truncate">
            {primaryStore ? primaryStore.name : "—"}
          </div>
          <p className="text-[13px] text-[var(--text-muted)] tabular-nums">
            {primaryStore
              ? `${formatCurrency(primaryStore.total)} across ${
                  primaryStore.trips
                } ${primaryStore.trips === 1 ? "trip" : "trips"} (${Math.round(
                  (primaryStore.total / Math.max(0.01, spendMetrics.total)) *
                    100
                )}% of spend)`
              : "No store trips recorded"}
          </p>
        </div>
      </section>

      {/* Monthly Category Budgets & Pacing */}
      <MonthlyBudgetsSection
        receipts={initialReceipts}
        items={initialItems}
        initialBudgets={initialBudgets}
        categoryColors={CATEGORY_PALETTE}
      />

      {/* P0 Interactive SVG Monthly Spending Chart */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-semibold text-[20px] text-[var(--text-primary)]">
              Monthly spending
            </h2>
            <p className="text-[13px] text-[var(--text-muted)]">
              Click or hover any month bar to inspect supermarket totals.
            </p>
          </div>

          <div
            className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] p-0.5 self-start sm:self-auto"
            role="group"
            aria-label="Chart display mode"
          >
            <button
              type="button"
              onClick={() => setChartMode("stacked")}
              className={`h-8 px-3 rounded-full text-[13px] font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                chartMode === "stacked"
                  ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              By store
            </button>
            <button
              type="button"
              onClick={() => setChartMode("total")}
              className={`h-8 px-3 rounded-full text-[13px] font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                chartMode === "total"
                  ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              Total only
            </button>
          </div>
        </div>

        {/* Store Filter & Color Legend */}
        {storeSummaries.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedStoreSlug("all")}
              className={`h-8 px-3 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedStoreSlug === "all"
                  ? "bg-[var(--text-primary)] text-[var(--bg-page)]"
                  : "border border-[var(--border)] bg-[var(--bg-page)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              All stores
            </button>
            {storeSummaries.map((st) => {
              const brand = getStoreBrand(st.slug || st.name, st.brandHex);
              const active = selectedStoreSlug === st.slug;
              return (
                <button
                  key={st.slug}
                  type="button"
                  onClick={() =>
                    setSelectedStoreSlug(active ? "all" : st.slug)
                  }
                  className={`inline-flex items-center gap-2 h-8 px-3 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? "bg-[var(--text-primary)] text-[var(--bg-page)]"
                      : "border border-[var(--border)] bg-[var(--bg-page)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: brand.color }}
                  />
                  <span>{st.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {monthlySeries.length === 0 ? (
          <div className="py-12 text-center text-[14px] text-[var(--text-muted)]">
            No confirmed spending data in this period.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Active / Hovered Month Summary Strip */}
            {activeHoverMonth && (
              <div className="rounded-xl bg-[var(--bg-subtle)] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="font-semibold text-[var(--text-primary)]">
                    {activeHoverMonth.fullLabel}
                  </span>
                  <span className="text-[var(--text-muted)] tabular-nums">
                    · {activeHoverMonth.trips}{" "}
                    {activeHoverMonth.trips === 1 ? "receipt" : "receipts"}
                  </span>
                  <span className="font-bold text-[var(--text-primary)] tabular-nums">
                    {formatCurrency(activeHoverMonth.total)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
                  {Object.entries(activeHoverMonth.byStore)
                    .sort((a, b) => b[1] - a[1])
                    .map(([slug, amount]) => {
                      const storeObj = storeSummaries.find(
                        (s) => s.slug === slug
                      );
                      const brand = getStoreBrand(
                        slug,
                        storeObj?.brandHex
                      );
                      return (
                        <span
                          key={slug}
                          className="inline-flex items-center gap-1.5 text-[var(--text-muted)]"
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: brand.color }}
                          />
                          {storeObj?.name || slug}:{" "}
                          <strong className="text-[var(--text-primary)] font-medium">
                            {formatCurrency(amount)}
                          </strong>
                        </span>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Pure Responsive SVG Chart (Always Renders Immediately) */}
            <div className="w-full overflow-x-auto no-scrollbar">
              <svg
                viewBox={`0 0 ${chartSvgWidth} ${chartSvgHeight}`}
                className="w-full min-w-[460px] h-[250px] block select-none"
                role="img"
                aria-label="Monthly grocery spending bar chart"
              >
                {/* Horizontal Y Grid Lines */}
                {yTicks.map((tick, idx) => (
                  <g key={idx}>
                    <line
                      x1={padLeft}
                      x2={chartSvgWidth - padRight}
                      y1={tick.y}
                      y2={tick.y}
                      stroke="var(--border)"
                      strokeDasharray={idx === 0 ? undefined : "3 3"}
                      strokeWidth={1}
                    />
                    <text
                      x={padLeft - 8}
                      y={tick.y + 4}
                      textAnchor="end"
                      fill="var(--text-muted)"
                      fontSize="13"
                      className="tabular-nums"
                    >
                      {formatWholeCurrency(tick.value)}
                    </text>
                  </g>
                ))}

                {/* Month Bars */}
                {monthlySeries.map((month, idx) => {
                  const slotW = plotW / monthlySeries.length;
                  const barW = Math.min(36, Math.max(18, slotW * 0.56));
                  const barX = padLeft + idx * slotW + (slotW - barW) / 2;
                  const isActive = activeHoverMonth?.key === month.key;

                  const orderedStores =
                    chartMode === "stacked"
                      ? storeSummaries
                          .filter((s) => (month.byStore[s.slug] || 0) > 0)
                          .map((s) => ({
                            slug: s.slug,
                            amount: month.byStore[s.slug] || 0,
                            color: getStoreBrand(
                              s.slug || s.name,
                              s.brandHex
                            ).color,
                          }))
                      : [
                          {
                            slug: "total",
                            amount: month.total,
                            color:
                              selectedStoreSlug !== "all"
                                ? getStoreBrand(
                                    selectedStoreSlug,
                                    storeSummaries.find(
                                      (s) => s.slug === selectedStoreSlug
                                    )?.brandHex
                                  ).color
                                : "var(--primary)",
                          },
                        ];

                  let currentBottomY = padTop + plotH;

                  return (
                    <g
                      key={month.key}
                      tabIndex={0}
                      role="button"
                      aria-label={`${month.fullLabel}: ${formatCurrency(
                        month.total
                      )}`}
                      onMouseEnter={() => setHoveredMonthKey(month.key)}
                      onFocus={() => setHoveredMonthKey(month.key)}
                      onClick={() => setHoveredMonthKey(month.key)}
                      className="cursor-pointer outline-none"
                    >
                      {/* Hover Target Column Highlight */}
                      <rect
                        x={padLeft + idx * slotW + 2}
                        y={padTop}
                        width={Math.max(20, slotW - 4)}
                        height={plotH}
                        rx={8}
                        fill={isActive ? "var(--bg-subtle)" : "transparent"}
                        opacity={isActive ? 0.6 : 0}
                      />

                      {orderedStores.map((seg, sIdx) => {
                        const segH =
                          maxMonthTotal > 0
                            ? (seg.amount / maxMonthTotal) * plotH
                            : 0;
                        const y = currentBottomY - segH;
                        currentBottomY = y;
                        const isTop = sIdx === orderedStores.length - 1;
                        const rectY = Math.max(padTop, y);
                        const rectH = Math.max(segH > 0 ? 2 : 0, segH);

                        return isTop ? (
                          <path
                            key={seg.slug}
                            d={topRoundedRectPath(barX, rectY, barW, rectH, 5)}
                            fill={seg.color}
                            opacity={isActive ? 1 : 0.88}
                          />
                        ) : (
                          <rect
                            key={seg.slug}
                            x={barX}
                            y={rectY}
                            width={barW}
                            height={rectH}
                            fill={seg.color}
                            opacity={isActive ? 1 : 0.88}
                          />
                        );
                      })}

                      <text
                        x={barX + barW / 2}
                        y={padTop + plotH + 20}
                        textAnchor="middle"
                        fill={
                          isActive
                            ? "var(--text-primary)"
                            : "var(--text-muted)"
                        }
                        fontWeight={isActive ? "600" : "400"}
                        fontSize="13"
                      >
                        {month.shortLabel}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        )}
      </section>

      {/* Category Breakdown with Expandable Drilldown */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-baseline justify-between gap-3">
          <div>
            <h2 className="font-display font-semibold text-[20px] text-[var(--text-primary)]">
              Spending by category
            </h2>
            <p className="text-[13px] text-[var(--text-muted)]">
              Select a category to see which groceries make up most of its cost.
            </p>
          </div>
          <span className="text-[13px] text-[var(--text-muted)] tabular-nums shrink-0">
            {categoryBreakdown.length} categories
          </span>
        </div>

        {categoryBreakdown.length === 0 ? (
          <div className="px-5 py-10 text-center text-[14px] text-[var(--text-muted)]">
            No categorized items in this period.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {categoryBreakdown.map((cat) => {
              const expanded = expandedCategory === cat.name;
              const catColor = getCategoryColor(cat.name);

              return (
                <div key={cat.name}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedCategory(expanded ? null : cat.name)
                    }
                    aria-expanded={expanded}
                    className="w-full px-5 py-3.5 text-left hover:bg-[var(--bg-subtle)]/60 transition-colors cursor-pointer space-y-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: catColor }}
                        />
                        <span className="font-medium text-[15px] text-[var(--text-primary)] truncate">
                          {cat.name}
                        </span>
                        <span className="text-[13px] text-[var(--text-muted)] tabular-nums shrink-0">
                          {cat.itemCount}{" "}
                          {cat.itemCount === 1 ? "item" : "items"}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 tabular-nums">
                        <span className="text-[13px] text-[var(--text-muted)]">
                          {formatPercent(cat.sharePct, { showPlus: false })}
                        </span>
                        <span className="font-semibold text-[15px] text-[var(--text-primary)] w-20 text-right">
                          {formatCurrency(cat.total)}
                        </span>
                        {expanded ? (
                          <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
                        )}
                      </div>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-[width] duration-200"
                        style={{
                          width: `${Math.max(2, cat.sharePct)}%`,
                          backgroundColor: catColor,
                        }}
                      />
                    </div>
                  </button>

                  {expanded && (
                    <div className="px-5 py-3.5 bg-[var(--bg-subtle)]/50 border-t border-[var(--border)] space-y-2">
                      <div className="text-[13px] font-medium text-[var(--text-muted)]">
                        Top items in {cat.name}
                      </div>
                      <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                        {cat.topProducts.map((prod, idx) => (
                          <div
                            key={`${prod.name}-${idx}`}
                            className="py-2.5 flex items-center justify-between gap-3 text-[13px]"
                          >
                            <div className="min-w-0">
                              {prod.slug ? (
                                <Link
                                  href={`/products/${prod.slug}`}
                                  className="font-medium text-[var(--text-primary)] hover:text-[var(--primary)] hover:underline truncate block"
                                >
                                  {prod.name}
                                </Link>
                              ) : (
                                <span className="font-medium text-[var(--text-primary)] truncate block">
                                  {prod.name}
                                </span>
                              )}
                              <span className="text-[var(--text-muted)] tabular-nums">
                                Bought {prod.count}{" "}
                                {prod.count === 1 ? "time" : "times"} · latest{" "}
                                {formatUnitPrice(
                                  prod.latestNormPrice,
                                  prod.baseUnit
                                )}
                              </span>
                            </div>
                            <span className="font-semibold text-[var(--text-primary)] tabular-nums shrink-0">
                              {formatCurrency(prod.spend)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Nutrition & Protein Value Metrics */}
      <NutritionValueSection
        items={filteredItems.map((i) => ({
          productId: i.productId,
          productSlug: i.productSlug,
          productName: i.productName || i.suggestedName || i.rawName,
          category: i.category,
          purchaseDate: i.purchaseDate,
          storeName: i.storeName,
          storeBrandHex: i.storeBrandHex,
          totalPrice: i.totalPrice,
          baseUnit: i.baseUnit,
          pricePerBaseUnit: i.pricePerBaseUnit,
          nutriScore: i.nutriScore,
          novaGroup: i.novaGroup,
          proteinPer100g: i.proteinPer100g,
          kcalPer100g: i.kcalPer100g,
        }))}
        untaggedFoodProductCount={untaggedFoodProductCount}
      />

      {/* Most Purchased Groceries (Spacious 3-Column Grid) */}
      {topGroceries.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h2 className="font-display font-semibold text-[20px] text-[var(--text-primary)]">
                Most bought groceries
              </h2>
              <p className="text-[13px] text-[var(--text-muted)]">
                Items you replenish most frequently during this period.
              </p>
            </div>
            <Link
              href="/products"
              className="text-[13px] font-semibold text-[var(--primary)] hover:underline inline-flex items-center gap-1 shrink-0"
            >
              All groceries
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {topGroceries.map((item) => {
              const cardInner = (
                <div className="h-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-strong)] p-5 flex flex-col justify-between gap-4 transition-colors">
                  <div className="space-y-1">
                    <div className="font-semibold text-[15px] text-[var(--text-primary)] leading-snug line-clamp-2">
                      {item.name}
                    </div>
                    <div className="text-[13px] text-[var(--text-muted)]">
                      {item.category} · {item.buyCount}{" "}
                      {item.buyCount === 1 ? "purchase" : "purchases"}
                    </div>
                  </div>

                  <div className="flex items-end justify-between gap-2 pt-2 border-t border-[var(--border)]">
                    <div className="tabular-nums">
                      <div className="text-[13px] text-[var(--text-muted)]">
                        Total spent
                      </div>
                      <div className="font-semibold text-[16px] text-[var(--text-primary)]">
                        {formatCurrency(item.totalSpend)}
                      </div>
                    </div>

                    <div className="text-right tabular-nums">
                      <div className="text-[13px] text-[var(--text-muted)]">
                        {formatUnitPrice(item.latestPrice, item.baseUnit)}
                      </div>
                      {item.deltaPct !== null && (
                        <div
                          className={`text-[13px] font-semibold ${
                            item.deltaPct > 1
                              ? "text-[var(--negative)]"
                              : item.deltaPct < -1
                              ? "text-[var(--positive)]"
                              : "text-[var(--text-muted)]"
                          }`}
                        >
                          {formatPercent(item.deltaPct)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );

              return item.slug ? (
                <Link key={item.key} href={`/products/${item.slug}`}>
                  {cardInner}
                </Link>
              ) : (
                <div key={item.key}>{cardInner}</div>
              );
            })}
          </div>
        </section>
      )}

      {/* Pack Size Watch (Shrinkflation) */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-2.5">
          <Package className="w-5 h-5 text-[var(--accent)] shrink-0" />
          <div>
            <h2 className="font-display font-semibold text-[20px] text-[var(--text-primary)]">
              Smaller packs at higher unit prices
            </h2>
            <p className="text-[13px] text-[var(--text-muted)]">
              Purchases where net weight or volume dropped while cost per kg
              or litre rose.
            </p>
          </div>
        </div>

        {filteredShrinkflation.length === 0 ? (
          <div className="px-5 py-6 text-[14px] text-[var(--text-muted)]">
            No pack-size reductions detected across your confirmed purchases in
            this period.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {filteredShrinkflation.map((inc) => {
              const brand = getStoreBrand(
                inc.storeSlug || inc.storeName,
                inc.storeHex
              );
              return (
                <div
                  key={inc.id}
                  className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: brand.color }}
                      />
                      <Link
                        href={`/products/${inc.productSlug}`}
                        className="font-semibold text-[15px] text-[var(--text-primary)] hover:text-[var(--primary)] hover:underline truncate"
                      >
                        {inc.productName}
                      </Link>
                      <span className="text-[13px] text-[var(--text-muted)]">
                        at {inc.storeName} · {formatDate(inc.date)}
                      </span>
                    </div>

                    <p className="text-[13px] text-[var(--text-muted)] tabular-nums">
                      Pack size dropped from{" "}
                      <strong className="text-[var(--text-primary)] font-medium">
                        {formatMeasureText(inc.oldMeasure, inc.baseUnit)}
                      </strong>{" "}
                      to{" "}
                      <strong className="text-[var(--text-primary)] font-medium">
                        {formatMeasureText(inc.newMeasure, inc.baseUnit)}
                      </strong>{" "}
                      · unit price rose from{" "}
                      {formatUnitPrice(inc.oldNormPrice, inc.baseUnit)} to{" "}
                      {formatUnitPrice(inc.newNormPrice, inc.baseUnit)}
                    </p>
                  </div>

                  <div className="shrink-0 text-left sm:text-right tabular-nums">
                    <span className="text-[15px] font-bold text-[var(--negative)]">
                      {formatPercent(inc.percentNormIncrease)} per{" "}
                      {inc.baseUnit === "KG"
                        ? "kg"
                        : inc.baseUnit === "L"
                        ? "L"
                        : "unit"}
                    </span>
                    <div className="text-[13px] text-[var(--text-muted)]">
                      {formatPercent(-inc.percentMeasureReduction, {
                        decimals: 0,
                      })}{" "}
                      pack weight
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Spanish VAT Tax Summary */}
      {vatBrackets.rows.length > 0 && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)] flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="font-display font-semibold text-[20px] text-[var(--text-primary)]">
                VAT summary
              </h2>
              <p className="text-[13px] text-[var(--text-muted)]">
                Breakdown by Spanish VAT bracket (0%–4% essentials, 10%
                standard food, 21% household & drinks).
              </p>
            </div>
            <span className="text-[14px] font-semibold text-[var(--text-primary)] tabular-nums">
              Total VAT: {formatCurrency(vatBrackets.totalVat)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-[13px] text-[var(--text-muted)]">
                  <th className="py-3 px-5 font-medium">VAT rate</th>
                  <th className="py-3 px-5 font-medium text-right">
                    Taxable base
                  </th>
                  <th className="py-3 px-5 font-medium text-right">VAT paid</th>
                  <th className="py-3 px-5 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] tabular-nums">
                {vatBrackets.rows.map((row) => (
                  <tr key={row.rate}>
                    <td className="py-3 px-5 font-medium text-[var(--text-primary)]">
                      {row.rate}%
                    </td>
                    <td className="py-3 px-5 text-right text-[var(--text-muted)]">
                      {formatCurrency(row.baseAmount)}
                    </td>
                    <td className="py-3 px-5 text-right text-[var(--text-primary)]">
                      {formatCurrency(row.taxAmount)}
                    </td>
                    <td className="py-3 px-5 text-right font-semibold text-[var(--text-primary)]">
                      {formatCurrency(row.baseAmount + row.taxAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
