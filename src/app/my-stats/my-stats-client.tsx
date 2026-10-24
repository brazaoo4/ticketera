"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  type TooltipContentProps,
} from "recharts";
import {
  TrendingUp,
  ShoppingBag,
  PieChart as PieChartIcon,
  Layers,
  Sparkles,
  Camera,
  X,
  ShieldAlert,
  Percent,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  Scale,
  Receipt,
  CheckCircle2,
} from "lucide-react";
import { ExportDataMenu } from "@/components/common/export-data-menu";
import { ShrinkflationIncident, formatMeasure } from "@/lib/analytics/shrinkflation";

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
  productSlug?: string | null;
  productName?: string | null;
  isStaple?: boolean;
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
}

const CATEGORY_COLORS: Record<string, string> = {
  "Dairy & Eggs": "#f59e0b",
  "Meat & Poultry": "#f43f5e",
  "Fish & Seafood": "#06b6d4",
  "Fruits & Vegetables": "#10b981",
  Bakery: "#d97706",
  Pantry: "#8b5cf6",
  "Oils & Condiments": "#eab308",
  Beverages: "#3b82f6",
  "Frozen Foods": "#38bdf8",
  "Cleaning & Household": "#14b8a6",
  "Personal Care": "#ec4899",
  Other: "#71717a",
};

export function MyStatsClient({
  initialReceipts,
  initialItems,
  stapleSightings = [],
  shrinkflationIncidents = [],
}: MyStatsClientProps) {
  const [timeframe, setTimeframe] = useState<"3M" | "6M" | "1Y" | "2Y" | "All">("1Y");
  const [chartView, setChartView] = useState<"stacked" | "total">("stacked");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Filter receipts by timeframe
  const filteredReceipts = useMemo(() => {
    if (!initialReceipts.length || timeframe === "All") return initialReceipts;

    const dates = initialReceipts.map((r) => new Date(r.purchaseDate).getTime());
    const latestTimestamp = Math.max(...dates);

    let days = 90;
    if (timeframe === "6M") days = 180;
    if (timeframe === "1Y") days = 365;
    if (timeframe === "2Y") days = 730;

    const cutoff = latestTimestamp - days * 24 * 60 * 60 * 1000;
    return initialReceipts.filter((r) => new Date(r.purchaseDate).getTime() >= cutoff);
  }, [initialReceipts, timeframe]);

  // Filter items by timeframe
  const filteredItems = useMemo(() => {
    const validReceiptIds = new Set(filteredReceipts.map((r) => r.id));
    return initialItems.filter((i) => validReceiptIds.has(i.receiptId));
  }, [filteredReceipts, initialItems]);

  // Filter benchmark staple sightings by same timeframe
  const filteredStapleSightings = useMemo(() => {
    if (!stapleSightings.length || timeframe === "All") return stapleSightings;
    if (!initialReceipts.length) return stapleSightings;

    const dates = initialReceipts.map((r) => new Date(r.purchaseDate).getTime());
    const latestTimestamp = Math.max(...dates);

    let days = 90;
    if (timeframe === "6M") days = 180;
    if (timeframe === "1Y") days = 365;
    if (timeframe === "2Y") days = 730;

    const cutoff = latestTimestamp - days * 24 * 60 * 60 * 1000;
    return stapleSightings.filter((s) => new Date(s.purchaseDate).getTime() >= cutoff);
  }, [stapleSightings, initialReceipts, timeframe]);

  // Filter shrinkflation incidents by timeframe
  const filteredShrinkflationIncidents = useMemo(() => {
    if (!shrinkflationIncidents.length || timeframe === "All") return shrinkflationIncidents;
    if (!initialReceipts.length) return shrinkflationIncidents;

    const dates = initialReceipts.map((r) => new Date(r.purchaseDate).getTime());
    const latestTimestamp = Math.max(...dates);

    let days = 90;
    if (timeframe === "6M") days = 180;
    if (timeframe === "1Y") days = 365;
    if (timeframe === "2Y") days = 730;

    const cutoff = latestTimestamp - days * 24 * 60 * 60 * 1000;
    return shrinkflationIncidents.filter((inc) => new Date(inc.date).getTime() >= cutoff);
  }, [shrinkflationIncidents, initialReceipts, timeframe]);

  // Spanish Grocery Tax & IVA Breakdown Statistics
  const ivaStats = useMemo(() => {
    let totalIvaPaid = 0;
    let totalBaseAmount = 0;
    let receiptsWithTaxCount = 0;

    let superreducidoBase = 0;
    let superreducidoIva = 0;
    let reducidoBase = 0;
    let reducidoIva = 0;
    let generalBase = 0;
    let generalIva = 0;

    filteredReceipts.forEach((r) => {
      if (Array.isArray(r.taxBreakdown) && r.taxBreakdown.length > 0) {
        receiptsWithTaxCount++;
        r.taxBreakdown.forEach((t) => {
          const rate = Number(t.rate) || 0;
          const base = Number(t.baseAmount) || 0;
          const tax = Number(t.taxAmount) || 0;

          totalIvaPaid += tax;
          totalBaseAmount += base;

          if (rate <= 4.5) {
            superreducidoBase += base;
            superreducidoIva += tax;
          } else if (rate <= 10.5) {
            reducidoBase += base;
            reducidoIva += tax;
          } else {
            generalBase += base;
            generalIva += tax;
          }
        });
      }
    });

    const effectiveTaxRate = totalBaseAmount > 0 ? (totalIvaPaid / totalBaseAmount) * 100 : 0;

    return {
      hasData: receiptsWithTaxCount > 0,
      receiptsWithTaxCount,
      totalIvaPaid: Number(totalIvaPaid.toFixed(2)),
      totalBaseAmount: Number(totalBaseAmount.toFixed(2)),
      effectiveTaxRate: Number(effectiveTaxRate.toFixed(1)),
      brackets: [
        {
          name: "Super-reduced (0% - 4%)",
          desc: "Bread, eggs, milk, fruits, vegetables, and olive oil",
          base: Number(superreducidoBase.toFixed(2)),
          iva: Number(superreducidoIva.toFixed(2)),
          percentOfIva: totalIvaPaid > 0 ? Number(((superreducidoIva / totalIvaPaid) * 100).toFixed(1)) : 0,
          color: "#10b981", // emerald
        },
        {
          name: "Reduced (5% - 10%)",
          desc: "Meat, fish, pasta, canned goods, and general groceries",
          base: Number(reducidoBase.toFixed(2)),
          iva: Number(reducidoIva.toFixed(2)),
          percentOfIva: totalIvaPaid > 0 ? Number(((reducidoIva / totalIvaPaid) * 100).toFixed(1)) : 0,
          color: "#f59e0b", // amber
        },
        {
          name: "Standard (21%)",
          desc: "Household cleaning, drugstore, and non-essential items",
          base: Number(generalBase.toFixed(2)),
          iva: Number(generalIva.toFixed(2)),
          percentOfIva: totalIvaPaid > 0 ? Number(((generalIva / totalIvaPaid) * 100).toFixed(1)) : 0,
          color: "#f43f5e", // rose
        },
      ],
    };
  }, [filteredReceipts]);

  // Overall KPI Computations
  const totalSpend = useMemo(() => {
    return filteredReceipts.reduce((sum, r) => sum + r.totalAmount, 0);
  }, [filteredReceipts]);

  // Monthly Spending Aggregation
  const monthlyChartData = useMemo(() => {
    const monthGroups = new Map<
      string,
      { monthKey: string; monthLabel: string; total: number; [key: string]: number | string }
    >();

    filteredReceipts.forEach((r) => {
      const d = new Date(r.purchaseDate);
      const year = d.getFullYear();
      const monthNum = String(d.getMonth() + 1).padStart(2, "0");
      const monthKey = `${year}-${monthNum}`;
      const monthLabel = d.toLocaleDateString("es-ES", { month: "short", year: "2-digit" });

      if (!monthGroups.has(monthKey)) {
        monthGroups.set(monthKey, {
          monthKey,
          monthLabel,
          total: 0,
        });
      }

      const entry = monthGroups.get(monthKey)!;
      entry.total = Number(((entry.total as number) + r.totalAmount).toFixed(2));
      const prevStoreVal = (entry[r.store.name] as number) || 0;
      entry[r.store.name] = Number((prevStoreVal + r.totalAmount).toFixed(2));
    });

    return Array.from(monthGroups.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [filteredReceipts]);

  // Average Monthly Spend
  const monthlyAverage = useMemo(() => {
    if (!monthlyChartData.length) return 0;
    return totalSpend / monthlyChartData.length;
  }, [totalSpend, monthlyChartData]);

  // Unique stores present in filtered data
  const storeMap = useMemo(() => {
    const map = new Map<
      string,
      { name: string; slug: string; brandHex: string; spend: number; count: number }
    >();
    filteredReceipts.forEach((r) => {
      const prev = map.get(r.store.name) || {
        name: r.store.name,
        slug: r.store.slug,
        brandHex: r.store.brandHex,
        spend: 0,
        count: 0,
      };
      map.set(r.store.name, {
        ...prev,
        spend: prev.spend + r.totalAmount,
        count: prev.count + 1,
      });
    });
    return map;
  }, [filteredReceipts]);

  const uniqueStores = useMemo(() => {
    return Array.from(storeMap.values()).sort((a, b) => b.spend - a.spend);
  }, [storeMap]);

  // ---------------------------------------------------------------------------
  // PERSONAL INFLATION ENGINE ("TU IPC REAL PONDERADO")
  // ---------------------------------------------------------------------------
  const productTrends = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        name: string;
        category: string;
        slug: string | null;
        baseUnit: "KG" | "L" | "UNIT";
        sightings: {
          date: number;
          pricePerBaseUnit: number;
          unitPrice: number;
          unitMeasure: number;
          storeName: string;
        }[];
        totalSpend: number;
        totalQuantity: number;
        count: number;
      }
    >();

    filteredItems.forEach((item) => {
      const key = item.productSlug || item.productName || item.rawName;
      const prev = map.get(key) || {
        key,
        name: item.productName || item.suggestedName || item.rawName,
        category: item.category || "Other",
        slug: item.productSlug || null,
        baseUnit: item.baseUnit,
        sightings: [],
        totalSpend: 0,
        totalQuantity: 0,
        count: 0,
      };

      const effectivePpu =
        item.pricePerBaseUnit > 0
          ? item.pricePerBaseUnit
          : item.unitMeasure > 0
          ? item.unitPrice / item.unitMeasure
          : item.unitPrice;

      prev.sightings.push({
        date: new Date(item.purchaseDate).getTime(),
        pricePerBaseUnit: effectivePpu,
        unitPrice: item.unitPrice,
        unitMeasure: item.unitMeasure,
        storeName: item.storeName,
      });

      prev.totalSpend += item.totalPrice;
      prev.totalQuantity += item.unitMeasure * item.quantity;
      prev.count += 1;

      map.set(key, prev);
    });

    return Array.from(map.values()).map((p) => {
      p.sightings.sort((a, b) => a.date - b.date);
      const earliest = p.sightings[0];
      const latest = p.sightings[p.sightings.length - 1];

      const baselinePrice = earliest ? earliest.pricePerBaseUnit : 0;
      const currentPrice = latest ? latest.pricePerBaseUnit : 0;
      const priceDeltaPercent =
        p.count >= 2 && baselinePrice > 0
          ? ((currentPrice - baselinePrice) / baselinePrice) * 100
          : 0;

      // Shrinkflation detection: pack size decreased while pack price stayed flat or grew
      const shrinkflationDetected =
        p.count >= 2 &&
        latest.unitMeasure < earliest.unitMeasure * 0.95 &&
        latest.unitPrice >= earliest.unitPrice * 0.98;

      return {
        ...p,
        baselinePrice,
        currentPrice,
        priceDeltaPercent,
        shrinkflationDetected,
        isRepeat: p.count >= 2,
      };
    });
  }, [filteredItems]);

  // Consumption-Weighted Personal Inflation Rate
  const personalInflationMetrics = useMemo(() => {
    const repeatProducts = productTrends.filter((p) => p.isRepeat && p.baselinePrice > 0);

    if (repeatProducts.length === 0) {
      return {
        hasData: false,
        rate: 0,
        monthlyImpact: 0,
        analyzedCount: 0,
        repeatSpend: 0,
      };
    }

    const totalRepeatSpend = repeatProducts.reduce((sum, p) => sum + p.totalSpend, 0);

    const weightedRate =
      totalRepeatSpend > 0
        ? repeatProducts.reduce((sum, p) => sum + (p.totalSpend / totalRepeatSpend) * p.priceDeltaPercent, 0)
        : 0;

    const monthlyImpact = (monthlyAverage * weightedRate) / 100;

    return {
      hasData: true,
      rate: weightedRate,
      monthlyImpact,
      analyzedCount: repeatProducts.length,
      repeatSpend: totalRepeatSpend,
    };
  }, [productTrends, monthlyAverage]);

  // Store-wide General Staple Index (Benchmark)
  const generalStapleInflation = useMemo(() => {
    if (!filteredStapleSightings.length) return null;

    const stapleMap = new Map<string, { date: number; ppu: number }[]>();
    filteredStapleSightings.forEach((s) => {
      if (!s.productId) return;
      const prev = stapleMap.get(s.productId) || [];
      prev.push({
        date: new Date(s.purchaseDate).getTime(),
        ppu: s.pricePerBaseUnit,
      });
      stapleMap.set(s.productId, prev);
    });

    const rates: number[] = [];
    stapleMap.forEach((sightings) => {
      if (sightings.length < 2) return;
      sightings.sort((a, b) => a.date - b.date);
      const first = sightings[0].ppu;
      const last = sightings[sightings.length - 1].ppu;
      if (first > 0) {
        rates.push(((last - first) / first) * 100);
      }
    });

    if (rates.length === 0) return null;
    const avg = rates.reduce((sum, r) => sum + r, 0) / rates.length;
    return avg;
  }, [filteredStapleSightings]);

  // Tu Supermercado Más Rentable Ranking (based on user's top habitual staples)
  const mostCostEffectiveStore = useMemo(() => {
    const topStaples = [...productTrends]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    if (topStaples.length === 0) return null;

    const storeScores = new Map<string, { storeName: string; lowestPriceCount: number; brandHex: string }>();

    topStaples.forEach((p) => {
      // Group prices by store for this product
      const pricesByStore = new Map<string, number[]>();
      p.sightings.forEach((s) => {
        const prev = pricesByStore.get(s.storeName) || [];
        prev.push(s.pricePerBaseUnit);
        pricesByStore.set(s.storeName, prev);
      });

      if (pricesByStore.size === 0) return;

      // Find store with lowest average price for this item
      let minStore: string | null = null;
      let minPrice = Infinity;

      pricesByStore.forEach((prices, sName) => {
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        if (avg < minPrice) {
          minPrice = avg;
          minStore = sName;
        }
      });

      if (minStore) {
        const storeObj = uniqueStores.find((s) => s.name === minStore);
        const prevScore = storeScores.get(minStore) || {
          storeName: minStore,
          lowestPriceCount: 0,
          brandHex: storeObj?.brandHex || "#10b981",
        };
        prevScore.lowestPriceCount += 1;
        storeScores.set(minStore, prevScore);
      }
    });

    const ranked = Array.from(storeScores.values()).sort(
      (a, b) => b.lowestPriceCount - a.lowestPriceCount
    );

    return {
      topStore: ranked[0] || null,
      topCount: ranked[0]?.lowestPriceCount || 0,
      totalAnalyzed: topStaples.length,
    };
  }, [productTrends, uniqueStores]);

  // ---------------------------------------------------------------------------
  // CATEGORY INFLATION & EXPENDITURE BREAKDOWN
  // ---------------------------------------------------------------------------
  const categoryInflationData = useMemo(() => {
    const catMap = new Map<
      string,
      {
        spend: number;
        itemsCount: number;
        products: typeof productTrends;
      }
    >();

    productTrends.forEach((p) => {
      const prev = catMap.get(p.category) || {
        spend: 0,
        itemsCount: 0,
        products: [],
      };
      prev.spend += p.totalSpend;
      prev.itemsCount += p.count;
      prev.products.push(p);
      catMap.set(p.category, prev);
    });

    const totalBudget = Array.from(catMap.values()).reduce((sum, c) => sum + c.spend, 0);

    return Array.from(catMap.entries())
      .map(([name, data]) => {
        const repeatProds = data.products.filter((p) => p.isRepeat && p.baselinePrice > 0);
        const repeatSpend = repeatProds.reduce((sum, p) => sum + p.totalSpend, 0);

        const categoryInflation =
          repeatSpend > 0
            ? repeatProds.reduce((sum, p) => sum + (p.totalSpend / repeatSpend) * p.priceDeltaPercent, 0)
            : 0;

        // Top price mover inside category
        const sortedMovers = [...repeatProds].sort(
          (a, b) => Math.abs(b.priceDeltaPercent) - Math.abs(a.priceDeltaPercent)
        );
        const topMover = sortedMovers[0] || null;

        return {
          name,
          spend: data.spend,
          percent: totalBudget > 0 ? (data.spend / totalBudget) * 100 : 0,
          inflation: categoryInflation,
          hasRepeat: repeatProds.length > 0,
          topMover,
          color: CATEGORY_COLORS[name] || "#71717a",
        };
      })
      .sort((a, b) => b.spend - a.spend);
  }, [productTrends]);

  // ---------------------------------------------------------------------------
  // TOP 5 MOST PURCHASED PRODUCTS & SHRINKFLATION WATCH
  // ---------------------------------------------------------------------------
  const topStapleWatch = useMemo(() => {
    return [...productTrends]
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.totalSpend - a.totalSpend;
      })
      .slice(0, 5);
  }, [productTrends]);

  // Drilldown items for the selected category (if clicked)
  const categoryDrilldownItems = useMemo(() => {
    if (!selectedCategory) return [];
    return filteredItems
      .filter((i) => i.category === selectedCategory)
      .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())
      .slice(0, 8);
  }, [filteredItems, selectedCategory]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* 1. Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
            <span>ANALYTICS</span>
            <span>/</span>
            <span className="text-emerald-400 font-semibold">YOUR REAL CPI</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <TrendingUp className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-400 shrink-0" />
            <span>Your Real CPI & Spending Intelligence</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Consumption-weighted personal inflation, comparison against the general staple benchmark, and data portability.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          {/* One-Click Data Portability Menu */}
          <ExportDataMenu range={timeframe} />

          {/* Timeframe selector (3M, 6M, 1Y, 2Y, All) */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-900 border border-zinc-800 shrink-0">
            {(["3M", "6M", "1Y", "2Y", "All"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTimeframe(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all whitespace-nowrap shrink-0 ${
                  timeframe === t
                    ? "bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Empty State */}
      {initialReceipts.length === 0 ? (
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-12 text-center text-xs text-zinc-400 max-w-xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white">No confirmed receipts yet</h2>
            <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed">
              Upload your grocery tickets to reveal personal inflation metrics, consumption-weighted price trends, and supermarket rankings.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs whitespace-nowrap shrink-0 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Camera className="w-4 h-4 stroke-[2.4] shrink-0" />
              <span>Upload First Ticket</span>
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* 2. THREE-CARD HERO STRIP: TU IPC PERSONAL, CESTA BÁSICA GENERAL & SUPERMERCADO MÁS RENTABLE */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* CARD 1: Tu IPC Personal (Ponderado) */}
            <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900/90 to-zinc-950/70 p-5 space-y-3 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                <span className="uppercase tracking-wider font-semibold flex items-center gap-1.5">
                  <Percent className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Your Personal CPI (Weighted)</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300">
                  {timeframe}
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <div
                  className={`text-3xl sm:text-4xl font-extrabold font-mono tracking-tight tabular-nums ${
                    personalInflationMetrics.hasData
                      ? personalInflationMetrics.rate > 0
                        ? "text-rose-400"
                        : personalInflationMetrics.rate < 0
                        ? "text-emerald-400"
                        : "text-zinc-200"
                      : "text-zinc-400"
                  }`}
                >
                  {personalInflationMetrics.hasData
                    ? `${personalInflationMetrics.rate > 0 ? "+" : ""}${personalInflationMetrics.rate.toFixed(1)}%`
                    : "0.0%"}
                </div>
                <span className="text-xs text-zinc-500 font-mono">
                  {personalInflationMetrics.hasData ? "vs baseline window" : "needs more purchases"}
                </span>
              </div>

              {/* Monthly Euro Impact */}
              <div className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs font-mono flex items-center justify-between">
                <span className="text-zinc-400">Monthly Basket Impact:</span>
                <span
                  className={`font-bold tabular-nums ${
                    personalInflationMetrics.monthlyImpact > 0
                      ? "text-rose-400"
                      : personalInflationMetrics.monthlyImpact < 0
                      ? "text-emerald-400"
                      : "text-zinc-300"
                  }`}
                >
                  {personalInflationMetrics.monthlyImpact > 0 ? "+" : ""}
                  €{personalInflationMetrics.monthlyImpact.toFixed(2)} / mo
                </span>
              </div>

              <p className="text-[11px] text-zinc-500 leading-relaxed font-mono">
                Weighted by your actual purchased quantities across {personalInflationMetrics.analyzedCount} repeat products.
              </p>
            </div>

            {/* CARD 2: General Staple Benchmark */}
            <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900/90 to-zinc-950/70 p-5 space-y-3 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                <span className="uppercase tracking-wider font-semibold flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>General Staple Benchmark</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300">
                  Shelf Price
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <div
                  className={`text-3xl sm:text-4xl font-extrabold font-mono tracking-tight tabular-nums ${
                    generalStapleInflation !== null
                      ? generalStapleInflation > 0
                        ? "text-rose-400"
                        : "text-emerald-400"
                      : "text-zinc-400"
                  }`}
                >
                  {generalStapleInflation !== null
                    ? `${generalStapleInflation > 0 ? "+" : ""}${generalStapleInflation.toFixed(1)}%`
                    : "—"}
                </div>
                <span className="text-xs text-zinc-500 font-mono">market average</span>
              </div>

              {/* Delta comparison */}
              <div className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs font-mono">
                {generalStapleInflation !== null && personalInflationMetrics.hasData ? (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Vs. General Market:</span>
                    <span
                      className={`font-bold tabular-nums ${
                        personalInflationMetrics.rate <= generalStapleInflation
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {personalInflationMetrics.rate <= generalStapleInflation
                        ? `↓ ${(generalStapleInflation - personalInflationMetrics.rate).toFixed(1)}% more efficient`
                        : `↑ ${(personalInflationMetrics.rate - generalStapleInflation).toFixed(1)}% above average`}
                    </span>
                  </div>
                ) : (
                  <span className="text-zinc-500">Comparison with staple benchmark</span>
                )}
              </div>

              <p className="text-[11px] text-zinc-500 leading-relaxed font-mono">
                Average price trajectory of essential staple foods across all tracked supermarket chains.
              </p>
            </div>

            {/* CARD 3: Most Efficient Supermarket */}
            <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900/90 to-zinc-950/70 p-5 space-y-3 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                <span className="uppercase tracking-wider font-semibold flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Most Efficient Supermarket</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300">
                  Personal Ranking
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                {mostCostEffectiveStore?.topStore && (
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: mostCostEffectiveStore.topStore.brandHex }}
                  />
                )}
                <div className="text-2xl sm:text-3xl font-bold text-white truncate">
                  {mostCostEffectiveStore?.topStore?.storeName || "—"}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs font-mono flex items-center justify-between">
                <span className="text-zinc-400">Basket efficiency:</span>
                <span className="font-bold text-emerald-400">
                  {mostCostEffectiveStore?.topStore
                    ? `${mostCostEffectiveStore.topCount} of ${mostCostEffectiveStore.totalAnalyzed} lowest price items`
                    : "Analyzing..."}
                </span>
              </div>

              <p className="text-[11px] text-zinc-500 leading-relaxed font-mono">
                Supermarket chain offering the lowest normalized unit prices (€/kg, €/L) for your habitual groceries.
              </p>
            </div>
          </div>

          {/* 3. MONTHLY EXPENDITURE CHART (RECHARTS STACKED BAR) */}
          <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-6 sm:p-8 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>Monthly Spending Trajectory</span>
                </h2>
                <p className="text-xs text-zinc-400">
                  Total spending per month broken down by supermarket chain.
                </p>
              </div>

              {/* View toggle */}
              <div className="inline-flex rounded-xl p-1 bg-zinc-950 border border-zinc-800 shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setChartView("stacked")}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                    chartView === "stacked"
                      ? "bg-emerald-500 text-zinc-950 shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  By Supermarket (Stacked)
                </button>
                <button
                  type="button"
                  onClick={() => setChartView("total")}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                    chartView === "total"
                      ? "bg-emerald-500 text-zinc-950 shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Total Spend
                </button>
              </div>
            </div>

            {/* Bar Chart Container */}
            <div className="h-72 sm:h-80 w-full pt-2">
              {isMounted ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyChartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis
                      dataKey="monthLabel"
                      stroke="#71717a"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "#3f3f46" }}
                    />
                    <YAxis
                      stroke="#71717a"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "#3f3f46" }}
                      tickFormatter={(val: number | string) => `€${Number(val).toFixed(0)}`}
                    />
                    <Tooltip
                      content={({ active, payload, label }: TooltipContentProps) => {
                        if (!active || !payload || !payload.length) return null;
                        const monthTotal = payload.reduce(
                          (sum, entry) => (entry.dataKey === "total" ? Number(entry.value) : sum + Number(entry.value || 0)),
                          0
                        );
                        return (
                          <div className="rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-md p-3.5 shadow-2xl space-y-2 text-xs min-w-[180px]">
                            <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 font-semibold text-zinc-200">
                              <span>{label}</span>
                              <span className="font-mono text-emerald-400 tabular-nums">
                                €{monthTotal.toFixed(2)}
                              </span>
                            </div>
                            <div className="space-y-1">
                              {payload.map((entry) => {
                                if (entry.dataKey === "total" && chartView === "stacked") return null;
                                return (
                                  <div
                                    key={String(entry.dataKey || entry.name)}
                                    className="flex items-center justify-between gap-4 font-mono text-xs"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className="w-2.5 h-2.5 rounded-full shrink-0"
                                        style={{ backgroundColor: entry.color }}
                                      />
                                      <span className="text-zinc-300">{entry.name}</span>
                                    </div>
                                    <span className="font-bold text-white tabular-nums">
                                      €{Number(entry.value).toFixed(2)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }}
                    />
                    {chartView === "stacked" ? (
                      uniqueStores.map((store) => (
                        <Bar
                          key={store.name}
                          dataKey={store.name}
                          name={store.name}
                          stackId="monthly"
                          fill={store.brandHex}
                          radius={[0, 0, 0, 0]}
                        />
                      ))
                    ) : (
                      <Bar
                        dataKey="total"
                        name="Total"
                        fill="#10b981"
                        radius={[6, 6, 0, 0]}
                      />
                    )}
                    {chartView === "stacked" && (
                      <Legend
                        wrapperStyle={{ paddingTop: "14px", fontSize: "12px" }}
                        iconType="circle"
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xs text-zinc-500 font-mono animate-pulse">
                  Rendering monthly expenditure chart...
                </div>
              )}
            </div>
          </div>

          {/* 4. CATEGORY INFLATION & EXPENDITURE BREAKDOWN ("¿QUÉ ENCARECE TU COMPRA?") */}
          <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
              <div className="space-y-1">
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <PieChartIcon className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>Where Does Your Money Go? Category Breakdown & Inflation</span>
                </h2>
                <p className="text-xs text-zinc-400">
                  Cumulative spend, budget share, and weighted price variation per category.
                </p>
              </div>
              {selectedCategory && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 font-medium whitespace-nowrap shrink-0 transition-colors"
                >
                  <span>View all categories</span>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Table + Progress Bars */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-800 text-[11px] text-zinc-400 uppercase tracking-wider">
                    <th className="pb-3 font-semibold">Category</th>
                    <th className="pb-3 font-semibold">Spend (€)</th>
                    <th className="pb-3 font-semibold">% Budget</th>
                    <th className="pb-3 font-semibold">Price Trend</th>
                    <th className="pb-3 font-semibold">Biggest Price Mover</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {categoryInflationData.map((cat) => (
                    <tr
                      key={cat.name}
                      onClick={() =>
                        setSelectedCategory(selectedCategory === cat.name ? null : cat.name)
                      }
                      className={`hover:bg-zinc-800/40 transition-colors cursor-pointer ${
                        selectedCategory === cat.name ? "bg-zinc-800/60" : ""
                      }`}
                    >
                      <td className="py-3 pr-4 font-medium text-white flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="font-sans font-semibold text-zinc-200">{cat.name}</span>
                      </td>

                      <td className="py-3 pr-4 font-bold text-white tabular-nums">
                        €{cat.spend.toFixed(2)}
                      </td>

                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="w-12 tabular-nums text-zinc-300">
                            {cat.percent.toFixed(1)}%
                          </span>
                          <div className="w-20 bg-zinc-800 h-1.5 rounded-full overflow-hidden shrink-0 hidden sm:block">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, cat.percent)}%`,
                                backgroundColor: cat.color,
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="py-3 pr-4">
                        {cat.hasRepeat ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] whitespace-nowrap shrink-0 ${
                              cat.inflation > 0
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : cat.inflation < 0
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            {cat.inflation > 0 ? (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowDownRight className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {cat.inflation > 0 ? "+" : ""}
                              {cat.inflation.toFixed(1)}%
                            </span>
                          </span>
                        ) : (
                          <span className="text-zinc-600 text-[11px]">Stable</span>
                        )}
                      </td>

                      <td className="py-3 text-zinc-400 font-sans truncate max-w-xs">
                        {cat.topMover ? (
                          <div className="flex items-center gap-1.5 text-xs truncate">
                            <span className="text-zinc-200 font-medium truncate">
                              {cat.topMover.name}
                            </span>
                            <span
                              className={`text-[11px] font-mono font-bold shrink-0 ${
                                cat.topMover.priceDeltaPercent > 0
                                  ? "text-rose-400"
                                  : "text-emerald-400"
                              }`}
                            >
                              ({cat.topMover.priceDeltaPercent > 0 ? "+" : ""}
                              {cat.topMover.priceDeltaPercent.toFixed(1)}%)
                            </span>
                          </div>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Category Drilldown Items (if clicked) */}
            {selectedCategory && (
              <div className="border-t border-zinc-800 pt-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-zinc-200 font-mono uppercase tracking-wider">
                    Recent purchases in {selectedCategory}
                  </h3>
                  <span className="text-[11px] text-zinc-400 font-mono">
                    {categoryDrilldownItems.length} records
                  </span>
                </div>

                <div className="divide-y divide-zinc-800/60 rounded-xl border border-zinc-800 bg-zinc-950/60 overflow-hidden">
                  {categoryDrilldownItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-zinc-200 truncate">
                          {item.productName}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: item.storeBrandHex }}
                          />
                          <span>{item.storeName}</span>
                          <span>•</span>
                          <span>{new Date(item.purchaseDate).toLocaleDateString("en-GB")}</span>
                        </div>
                      </div>

                      <div className="text-right font-mono whitespace-nowrap shrink-0">
                        <span className="font-bold text-white tabular-nums">
                          €{item.totalPrice.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-zinc-500 block">
                          €{item.unitPrice.toFixed(2)} / unit
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 5. TOP 5 MOST PURCHASED PRODUCTS & SHRINKFLATION WATCH */}
          <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-6 sm:p-8 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
              <div className="space-y-1">
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>Top 5 Habitual Staples & Shrinkflation Watch</span>
                </h2>
                <p className="text-xs text-zinc-400">
                  Normalized unit price tracking and package reduction alerts.
                </p>
              </div>
              <span className="text-xs font-mono text-zinc-500">Sorted by frequency</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              {topStapleWatch.map((p, idx) => (
                <div
                  key={p.key + idx}
                  className="p-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 flex flex-col justify-between space-y-3 relative group"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                      <span>#{idx + 1} MOST PURCHASED</span>
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-bold">
                        {p.count}x
                      </span>
                    </div>

                    {p.slug ? (
                      <Link
                        href={`/products/${p.slug}`}
                        className="text-xs font-bold text-zinc-200 hover:text-emerald-400 transition-colors line-clamp-2"
                      >
                        {p.name}
                      </Link>
                    ) : (
                      <span className="text-xs font-bold text-zinc-200 line-clamp-2">
                        {p.name}
                      </span>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800/80 text-zinc-400 border border-zinc-700/50">
                        {p.category}
                      </span>
                      {p.shrinkflationDetected && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1 font-semibold">
                          <ShieldAlert className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>Shrinkflation</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Price comparison & Spend */}
                  <div className="border-t border-zinc-800/80 pt-2.5 space-y-1.5 text-xs font-mono">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span className="text-[10px]">Unit Price:</span>
                      <span className="font-bold text-white tabular-nums">
                        €{p.currentPrice.toFixed(2)} / {p.baseUnit.toLowerCase()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-zinc-500">Trend:</span>
                      {p.isRepeat ? (
                        <span
                          className={`font-bold tabular-nums text-[11px] ${
                            p.priceDeltaPercent > 0
                              ? "text-rose-400"
                              : p.priceDeltaPercent < 0
                              ? "text-emerald-400"
                              : "text-zinc-400"
                          }`}
                        >
                          {p.priceDeltaPercent > 0 ? "+" : ""}
                          {p.priceDeltaPercent.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-zinc-500 text-[10px]">1 purchase</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between border-t border-zinc-800/60 pt-1 text-zinc-400">
                      <span className="text-[10px]">Total spend:</span>
                      <span className="font-bold text-emerald-400 tabular-nums">
                        €{p.totalSpend.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 6. RADAR DE REDUFLACIÓN ("SHRINKFLATION RADAR") */}
          <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-6 sm:p-8 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
              <div className="space-y-1">
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                  <span>Shrinkflation Radar</span>
                </h2>
                <p className="text-xs text-zinc-400">
                  Algorithmic detection of net quantity reductions (grams/litres) where shelf pack prices remained roughly identical.
                </p>
              </div>
              <span className="text-xs font-mono text-zinc-500 whitespace-nowrap shrink-0">
                {filteredShrinkflationIncidents.length} {filteredShrinkflationIncidents.length === 1 ? "incident detected" : "incidents detected"}
              </span>
            </div>

            {filteredShrinkflationIncidents.length === 0 ? (
              <div className="rounded-2xl border border-zinc-800/60 bg-zinc-950/40 p-6 text-center text-xs font-mono text-zinc-400 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>No shrinkflation cases detected in your confirmed purchases.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredShrinkflationIncidents.map((inc) => (
                  <div
                    key={inc.id}
                    className="p-4 sm:p-5 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-zinc-950/90 via-zinc-950/70 to-amber-950/20 space-y-3.5 shadow-lg relative overflow-hidden"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="px-2.5 py-0.5 rounded text-[11px] font-bold text-white shadow-sm whitespace-nowrap shrink-0"
                          style={{ backgroundColor: inc.storeHex }}
                        >
                          {inc.storeName}
                        </span>
                        <Link
                          href={`/products/${inc.productSlug}`}
                          className="text-xs sm:text-sm font-bold text-zinc-100 hover:text-emerald-400 transition-colors truncate"
                        >
                          {inc.productName}
                        </Link>
                      </div>
                      <span className="text-[11px] font-mono text-zinc-400 whitespace-nowrap shrink-0">
                        {new Date(inc.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })}
                      </span>
                    </div>

                    {/* Before & After Measures */}
                    <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                      <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 line-through whitespace-nowrap shrink-0">
                        {formatMeasure(inc.oldMeasure, inc.baseUnit)}
                      </span>
                      <span className="text-zinc-600">→</span>
                      <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold whitespace-nowrap shrink-0">
                        {formatMeasure(inc.newMeasure, inc.baseUnit)} (-{inc.percentMeasureReduction}%)
                      </span>
                    </div>

                    {/* Price Reality */}
                    <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2 text-xs font-mono">
                      <div className="flex items-center justify-between text-zinc-400">
                        <span className="text-[11px]">Pack price:</span>
                        <span className="text-zinc-200">
                          €{inc.oldUnitPrice.toFixed(2)} → €{inc.newUnitPrice.toFixed(2)} (similar)
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-zinc-800/60 pt-1.5">
                        <span className="text-[11px] text-zinc-400">Normalized price:</span>
                        <span className="font-bold text-rose-400">
                          €{inc.oldNormPrice.toFixed(2)} → €{inc.newNormPrice.toFixed(2)}/{inc.baseUnit.toLowerCase()}{" "}
                          <span className="text-[11px] text-rose-300">
                            (+{inc.percentNormIncrease}% hidden)
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-0.5">
                      <span className="text-[10px] text-zinc-500 font-mono">
                        Detected between {new Date(inc.oldDate).toLocaleDateString("en-GB")} and {new Date(inc.date).toLocaleDateString("en-GB")}
                      </span>
                      <Link
                        href={`/products/${inc.productSlug}`}
                        className="text-[11px] font-mono font-semibold text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
                      >
                        <span>View chart</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 7. SPANISH GROCERY TAX & IVA TRACKER ("EL IMPACTO DEL IVA") */}
          <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
              <div className="space-y-1">
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>Supermarket Tax Impact (VAT)</span>
                </h2>
                <p className="text-xs text-zinc-400">
                  Real breakdown of indirect taxes paid at checkout extracted from official receipt fiscal tables.
                </p>
              </div>
              {ivaStats.hasData && (
                <span className="text-xs font-mono text-zinc-400 whitespace-nowrap shrink-0">
                  Based on {ivaStats.receiptsWithTaxCount} {ivaStats.receiptsWithTaxCount === 1 ? "receipt" : "receipts"} with tax breakdown
                </span>
              )}
            </div>

            {ivaStats.hasData ? (
              <div className="space-y-6">
                {/* 3-Card KPI Strip */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* KPI 1: Total VAT Paid */}
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-1.5">
                    <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Percent className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Total VAT Paid</span>
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400 tabular-nums">
                      €{ivaStats.totalIvaPaid.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono">
                      Cumulative indirect taxes ({timeframe})
                    </div>
                  </div>

                  {/* KPI 2: Effective Tax Rate */}
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-1.5">
                    <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Effective Tax Rate</span>
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white tabular-nums">
                      {ivaStats.effectiveTaxRate.toFixed(1)}%
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono">
                      Overall ratio VAT / Tax base
                    </div>
                  </div>

                  {/* KPI 3: Net Food Spend */}
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-1.5">
                    <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Net Food Spend</span>
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold font-mono text-zinc-200 tabular-nums">
                      €{ivaStats.totalBaseAmount.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono">
                      Net tax base before taxes
                    </div>
                  </div>
                </div>

                {/* IVA Bracket Breakdown Table & Progress Bars */}
                <div className="space-y-4 pt-2">
                  <h3 className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider">
                    Breakdown by Spanish VAT Bracket
                  </h3>

                  <div className="space-y-3">
                    {ivaStats.brackets.map((b) => (
                      <div
                        key={b.name}
                        className="p-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 space-y-2.5"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                          <div>
                            <span className="font-bold text-white font-mono">{b.name}</span>
                            <p className="text-[11px] text-zinc-400">{b.desc}</p>
                          </div>
                          <div className="text-right font-mono flex items-center gap-3">
                            <span className="text-zinc-400 text-[11px]">
                              Base: <strong className="text-zinc-200">€{b.base.toFixed(2)}</strong>
                            </span>
                            <span className="font-bold text-emerald-400">
                              VAT: €{b.iva.toFixed(2)}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 font-bold whitespace-nowrap shrink-0">
                              {b.percentOfIva}% of VAT
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="h-2 w-full rounded-full bg-zinc-900 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.max(b.percentOfIva, 0)}%`,
                              backgroundColor: b.color,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-2xl border border-zinc-800/60 bg-zinc-950/40 text-center text-xs font-mono text-zinc-500">
                No confirmed receipts with printed tax breakdown recorded yet. New receipts analyzed will automatically store their VAT bases and amounts.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
