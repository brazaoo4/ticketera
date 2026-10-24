"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
  type TooltipContentProps,
} from "recharts";
import {
  TrendingDown,
  TrendingUp,
  Store as StoreIcon,
  ArrowLeft,
  Scale,
  Sparkles,
  Receipt as ReceiptIcon,
  Trash2,
  Loader2,
  AlertCircle,
  X,
  Pencil,
  Star,
} from "lucide-react";
import {
  deleteSightingAction,
  updateProductDetailsAction,
  normalizeProductHistoryAction,
  updateSightingAction,
} from "./actions";
import { CANONICAL_CATEGORIES } from "@/lib/ai/schema";
import { useRouter } from "next/navigation";
import { ShrinkflationIncident, formatMeasure } from "@/lib/analytics/shrinkflation";

export function formatPackBadge(
  packSize: number,
  baseUnit: "KG" | "L" | "UNIT",
  isVariableWeight?: boolean
): string {
  if (isVariableWeight) return "Loose / Counter";
  if (baseUnit === "L") {
    if (packSize < 1) return `Pack ${Math.round(packSize * 1000)}ml`;
    return `Pack ${packSize % 1 === 0 ? packSize.toFixed(0) : packSize.toFixed(1)}L`;
  }
  if (baseUnit === "KG") {
    if (packSize < 1) return `Pack ${Math.round(packSize * 1000)}g`;
    return `Pack ${packSize % 1 === 0 ? packSize.toFixed(0) : packSize.toFixed(2)}kg`;
  }
  return packSize === 1 ? "1 unit" : `Pack ${packSize} units`;
}

export interface SightingObservation {
  id: string;
  receiptId: string;
  purchaseDate: string; // ISO
  storeName: string;
  storeSlug: string;
  storeBrandHex: string;
  rawName: string;
  unitPrice: number; // pack price
  pricePerBaseUnit: number;
  baseUnit: "KG" | "L" | "UNIT";
  unitMeasure: number;
  quantity?: number;
}

export interface ProductTrackerClientProps {
  product: {
    id: string;
    slug: string;
    displayName: string;
    category: string;
    baseUnit: "KG" | "L" | "UNIT";
    isStaple: boolean;
  };
  sightings: SightingObservation[];
  aliases: Array<{
    id?: string;
    storeId?: string;
    storeName: string;
    storeBrandHex: string;
    rawAlias: string;
    unitMeasurePerPack?: number | null;
    isVariableWeight?: boolean;
  }>;
  canDelete?: boolean;
  isAdmin?: boolean;
  shrinkflationIncidents?: ShrinkflationIncident[];
}

interface StoreMeta {
  packPrice: number;
  format: string;
}

interface ChartPoint {
  date: string;
  displayDate: string;
  _meta?: Record<string, StoreMeta>;
  [storeKey: string]: string | number | Record<string, StoreMeta> | undefined;
}

type Timeframe = "1M" | "3M" | "6M" | "1Y" | "2Y" | "All";
type PriceMode = "unit" | "pack";
type ChartCurve = "step" | "smooth";

export function ProductTrackerClient({
  product,
  sightings,
  aliases,
  shrinkflationIncidents = [],
  canDelete = false,
  isAdmin = false,
}: ProductTrackerClientProps) {
  const router = useRouter();
  const [productData, setProductData] = useState(product);
  const [currentSightings, setCurrentSightings] = useState<SightingObservation[]>(sightings);
  const [timeframe, setTimeframe] = useState<Timeframe>("2Y");
  const [priceMode, setPriceMode] = useState<PriceMode>("unit");
  const [chartCurve, setChartCurve] = useState<ChartCurve>("step");
  const [mounted, setMounted] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Edit individual sighting modal state
  const [editingSighting, setEditingSighting] = useState<SightingObservation | null>(null);
  const [editSightingPrice, setEditSightingPrice] = useState<string>("");
  const [editSightingQty, setEditSightingQty] = useState<string>("1");
  const [editSightingMeasure, setEditSightingMeasure] = useState<string>("");
  const [editSightingRawName, setEditSightingRawName] = useState<string>("");
  const [editSightingDate, setEditSightingDate] = useState<string>("");
  const [isSavingSighting, setIsSavingSighting] = useState(false);
  const [sightingSaveError, setSightingSaveError] = useState<string | null>(null);

  // Edit product modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState(product.displayName);
  const [editCategory, setEditCategory] = useState(product.category);
  const [editBaseUnit, setEditBaseUnit] = useState<"KG" | "L" | "UNIT">(product.baseUnit);
  const [editIsStaple, setEditIsStaple] = useState(product.isStaple);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Normalize product history modal state
  const [isNormalizeModalOpen, setIsNormalizeModalOpen] = useState(false);
  const [normalizeBaseUnit, setNormalizeBaseUnit] = useState<"KG" | "L" | "UNIT">(product.baseUnit);
  const [aliasFormats, setAliasFormats] = useState(() => {
    return aliases.map((a) => ({
      aliasId: a.id || "",
      storeName: a.storeName,
      storeBrandHex: a.storeBrandHex,
      rawAlias: a.rawAlias,
      unitMeasurePerPack: a.unitMeasurePerPack ?? null,
      isVariableWeight: !!a.isVariableWeight,
    }));
  });
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [normalizeError, setNormalizeError] = useState<string | null>(null);

  // Distinct pack formats across observations
  const availableFormats = useMemo(() => {
    const formatCountMap = new Map<string, number>();
    currentSightings.forEach((s) => {
      const q = Math.max(Number(s.quantity) || 1, 1);
      const single = Number((Number(s.unitMeasure) / q).toFixed(3));
      const badge = formatPackBadge(single, s.baseUnit);
      formatCountMap.set(badge, (formatCountMap.get(badge) || 0) + 1);
    });

    const entries = Array.from(formatCountMap.entries()).map(([label, count]) => ({
      label,
      count,
    }));
    entries.sort((a, b) => b.count - a.count);
    return entries;
  }, [currentSightings]);

  const [selectedFormat, setSelectedFormat] = useState<string>("all");

  // Smart Pack Price Protection: if switched to pack mode with multiple sizes and all selected, auto-select most common
  useEffect(() => {
    if (priceMode === "pack" && availableFormats.length >= 2 && selectedFormat === "all") {
      if (availableFormats[0]) {
        setSelectedFormat(availableFormats[0].label);
      }
    }
  }, [priceMode, availableFormats, selectedFormat]);

  useEffect(() => {
    setProductData(product);
    setEditName(product.displayName);
    setEditCategory(product.category);
    setEditBaseUnit(product.baseUnit);
    setEditIsStaple(product.isStaple);
    setNormalizeBaseUnit(product.baseUnit);
    setAliasFormats(
      aliases.map((a) => ({
        aliasId: a.id || "",
        storeName: a.storeName,
        storeBrandHex: a.storeBrandHex,
        rawAlias: a.rawAlias,
        unitMeasurePerPack: a.unitMeasurePerPack ?? null,
        isVariableWeight: !!a.isVariableWeight,
      }))
    );
  }, [product, aliases]);

  useEffect(() => {
    setCurrentSightings(sightings);
  }, [sightings]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleDeleteSighting = async (sightingId: string) => {
    setDeletingId(sightingId);
    setDeleteError(null);
    try {
      const res = await deleteSightingAction(sightingId, product.slug);
      if (res.success) {
        setCurrentSightings((prev) => prev.filter((s) => s.id !== sightingId));
        setConfirmDeleteId(null);
      } else {
        setDeleteError(res.error || "Failed to remove observation.");
      }
    } catch (err: unknown) {
      setDeleteError(
        err instanceof Error ? err.message : "Error deleting observation."
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenEditSighting = (s: SightingObservation) => {
    setEditingSighting(s);
    setEditSightingPrice(s.unitPrice.toString());
    setEditSightingQty((s.quantity || 1).toString());
    setEditSightingMeasure(s.unitMeasure.toString());
    setEditSightingRawName(s.rawName);
    setEditSightingDate(s.purchaseDate.slice(0, 10));
    setSightingSaveError(null);
  };

  const handleSaveSighting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSighting) return;

    const priceNum = parseFloat(editSightingPrice);
    const qtyNum = parseFloat(editSightingQty);
    const measureNum = parseFloat(editSightingMeasure);

    if (isNaN(priceNum) || priceNum < 0) {
      setSightingSaveError("Please enter a valid pack price (≥ 0).");
      return;
    }
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setSightingSaveError("Please enter a valid quantity (> 0).");
      return;
    }
    if (isNaN(measureNum) || measureNum <= 0) {
      setSightingSaveError("Please enter a valid package measure / weight (> 0).");
      return;
    }

    setIsSavingSighting(true);
    setSightingSaveError(null);

    try {
      const res = await updateSightingAction(editingSighting.id, product.slug, {
        unitPrice: priceNum,
        quantity: qtyNum,
        unitMeasure: measureNum,
        rawName: editSightingRawName.trim(),
        purchaseDate: editSightingDate || undefined,
      });

      if (res.success && res.updated) {
        const updated = res.updated;
        setCurrentSightings((prev) =>
          prev.map((s) =>
            s.id === updated.id
              ? {
                  ...s,
                  unitPrice: updated.unitPrice,
                  quantity: updated.quantity,
                  unitMeasure: updated.unitMeasure,
                  pricePerBaseUnit: updated.pricePerBaseUnit,
                  rawName: updated.rawName,
                  purchaseDate: updated.purchaseDate,
                }
              : s
          )
        );
        setEditingSighting(null);
      } else {
        setSightingSaveError(res.error || "Failed to update observation.");
      }
    } catch (err: unknown) {
      setSightingSaveError(
        err instanceof Error ? err.message : "Error updating observation."
      );
    } finally {
      setIsSavingSighting(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProduct(true);
    setEditError(null);
    try {
      const res = await updateProductDetailsAction(productData.id, {
        displayName: editName,
        category: editCategory,
        baseUnit: editBaseUnit,
        isStaple: editIsStaple,
      });
      if (res.success) {
        setProductData((prev) => ({
          ...prev,
          displayName: editName.trim(),
          category: editCategory,
          baseUnit: editBaseUnit,
          isStaple: editIsStaple,
        }));
        setIsEditModalOpen(false);
        router.refresh();
      } else {
        setEditError(res.error || "Failed to update product.");
      }
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Error saving product.");
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleNormalizeHistory = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsNormalizing(true);
    setNormalizeError(null);
    try {
      const res = await normalizeProductHistoryAction(productData.id, {
        baseUnit: normalizeBaseUnit,
        aliases: aliasFormats.map((a) => ({
          aliasId: a.aliasId,
          unitMeasurePerPack: a.unitMeasurePerPack,
          isVariableWeight: a.isVariableWeight,
        })),
      });

      if (res.success) {
        setProductData((prev) => ({
          ...prev,
          baseUnit: normalizeBaseUnit,
        }));
        setIsNormalizeModalOpen(false);
        router.refresh();
      } else {
        setNormalizeError(res.error || "Failed to normalize product history.");
      }
    } catch (err: unknown) {
      setNormalizeError(err instanceof Error ? err.message : "Error normalizing product history.");
    } finally {
      setIsNormalizing(false);
    }
  };

  const unitLabel =
    productData.baseUnit === "KG"
      ? "€/kg"
      : productData.baseUnit === "L"
      ? "€/L"
      : "€/unit";

  // Reference date: the latest date in the sightings dataset
  const latestDateMs = useMemo(() => {
    if (currentSightings.length === 0) return Date.now();
    return Math.max(...currentSightings.map((s) => new Date(s.purchaseDate).getTime()));
  }, [currentSightings]);

  // Filter sightings by timeframe and selected pack format
  const filteredSightings = useMemo(() => {
    let list = currentSightings;

    if (selectedFormat !== "all") {
      list = list.filter((s) => {
        const q = Math.max(Number(s.quantity) || 1, 1);
        const single = Number((Number(s.unitMeasure) / q).toFixed(3));
        return formatPackBadge(single, s.baseUnit) === selectedFormat;
      });
    }

    if (timeframe === "All") return list;

    const daysMap: Record<Timeframe, number> = {
      "1M": 31,
      "3M": 92,
      "6M": 183,
      "1Y": 366,
      "2Y": 732,
      All: Infinity,
    };

    const cutoff = latestDateMs - daysMap[timeframe] * 24 * 60 * 60 * 1000;
    return list.filter((s) => new Date(s.purchaseDate).getTime() >= cutoff);
  }, [currentSightings, timeframe, selectedFormat, latestDateMs]);

  // Sightings displayed in historical table, filtered by selected format if active
  const displayedTableSightings = useMemo(() => {
    if (selectedFormat === "all") return currentSightings;
    return currentSightings.filter((s) => {
      const q = Math.max(Number(s.quantity) || 1, 1);
      const single = Number((Number(s.unitMeasure) / q).toFixed(3));
      return formatPackBadge(single, s.baseUnit) === selectedFormat;
    });
  }, [currentSightings, selectedFormat]);

  // Unique stores present in sightings
  const uniqueStores = useMemo(() => {
    const map = new Map<string, { name: string; brandHex: string }>();
    currentSightings.forEach((s) => {
      if (!map.has(s.storeName)) {
        map.set(s.storeName, { name: s.storeName, brandHex: s.storeBrandHex });
      }
    });
    return Array.from(map.values());
  }, [currentSightings]);

  // Current ranking: latest price per store
  const storeRankings = useMemo(() => {
    const storeLatest = new Map<string, SightingObservation>();
    const storeOld1Y = new Map<string, SightingObservation>();

    const oneYearAgoMs = latestDateMs - 365 * 24 * 60 * 60 * 1000;

    // Sightings are ordered asc by date
    currentSightings.forEach((s) => {
      storeLatest.set(s.storeName, s);

      const dMs = new Date(s.purchaseDate).getTime();
      if (dMs <= oneYearAgoMs) {
        storeOld1Y.set(s.storeName, s);
      }
    });

    const rankingList = Array.from(storeLatest.values()).map((latest) => {
      const currentPrice =
        priceMode === "unit" ? latest.pricePerBaseUnit : latest.unitPrice;
      const old1Y = storeOld1Y.get(latest.storeName);
      let diff1Y: number | null = null;
      let diffPercent1Y: number | null = null;

      if (old1Y) {
        const oldP =
          priceMode === "unit" ? old1Y.pricePerBaseUnit : old1Y.unitPrice;
        diff1Y = currentPrice - oldP;
        diffPercent1Y = oldP > 0 ? (diff1Y / oldP) * 100 : null;
      }

      // Find alias if any
      const matchingAlias = aliases.find(
        (a) => a.storeName.toLowerCase() === latest.storeName.toLowerCase()
      );

      return {
        storeName: latest.storeName,
        storeBrandHex: latest.storeBrandHex,
        rawName: matchingAlias ? matchingAlias.rawAlias : latest.rawName,
        lastSeenDate: latest.purchaseDate,
        currentPrice,
        diff1Y,
        diffPercent1Y,
      };
    });

    rankingList.sort((a, b) => a.currentPrice - b.currentPrice);
    return rankingList;
  }, [currentSightings, priceMode, aliases, latestDateMs]);

  // KPI 1: Cheapest Now
  const cheapestNow = storeRankings[0] || null;

  // KPI 2: Period Change over selected timeframe
  const periodStats = useMemo(() => {
    if (filteredSightings.length === 0) {
      return { changePercent: 0, oldAvg: 0, newAvg: 0, hasHistory: false };
    }
    if (filteredSightings.length === 1) {
      const p =
        priceMode === "unit"
          ? filteredSightings[0].pricePerBaseUnit
          : filteredSightings[0].unitPrice;
      return { changePercent: 0, oldAvg: p, newAvg: p, hasHistory: false };
    }

    const sorted = [...filteredSightings].sort(
      (a, b) =>
        new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime()
    );

    const earliestDate = sorted[0].purchaseDate.slice(0, 10);
    const latestDate = sorted[sorted.length - 1].purchaseDate.slice(0, 10);

    if (earliestDate === latestDate) {
      const avg =
        sorted.reduce(
          (sum, s) =>
            sum + (priceMode === "unit" ? s.pricePerBaseUnit : s.unitPrice),
          0
        ) / sorted.length;
      return { changePercent: 0, oldAvg: avg, newAvg: avg, hasHistory: false };
    }

    const earliestBatch = sorted.filter(
      (s) => s.purchaseDate.slice(0, 10) === earliestDate
    );
    const latestBatch = sorted.filter(
      (s) => s.purchaseDate.slice(0, 10) === latestDate
    );

    const oldAvg =
      earliestBatch.reduce(
        (sum, s) =>
          sum + (priceMode === "unit" ? s.pricePerBaseUnit : s.unitPrice),
        0
      ) / earliestBatch.length;

    const newAvg =
      latestBatch.reduce(
        (sum, s) =>
          sum + (priceMode === "unit" ? s.pricePerBaseUnit : s.unitPrice),
        0
      ) / latestBatch.length;

    const changePercent = oldAvg > 0 ? ((newAvg - oldAvg) / oldAvg) * 100 : 0;

    return {
      changePercent,
      oldAvg,
      newAvg,
      hasHistory: true,
    };
  }, [filteredSightings, priceMode]);

  // KPI 3: All-Time Low & High
  const allTimeStats = useMemo(() => {
    if (currentSightings.length === 0) {
      return { low: 0, lowDate: "", high: 0, highDate: "" };
    }

    let low = Infinity;
    let lowS = currentSightings[0];
    let high = -Infinity;
    let highS = currentSightings[0];

    currentSightings.forEach((s) => {
      const p = priceMode === "unit" ? s.pricePerBaseUnit : s.unitPrice;
      if (p < low) {
        low = p;
        lowS = s;
      }
      if (p > high) {
        high = p;
        highS = s;
      }
    });

    return {
      low,
      lowDate: lowS.purchaseDate,
      lowStore: lowS.storeName,
      high,
      highDate: highS.purchaseDate,
      highStore: highS.storeName,
    };
  }, [currentSightings, priceMode]);

  // KPI 4: Store Spread
  const storeSpread = useMemo(() => {
    if (storeRankings.length < 2) return 0;
    const cheapest = storeRankings[0].currentPrice;
    const mostExpensive = storeRankings[storeRankings.length - 1].currentPrice;
    return Math.max(0, mostExpensive - cheapest);
  }, [storeRankings]);

  // Transform filtered sightings for Recharts LineChart
  const chartData = useMemo(() => {
    // Group observations by month/date string
    const dateMap = new Map<string, ChartPoint>();

    filteredSightings.forEach((s) => {
      const dateKey = s.purchaseDate.slice(0, 10);
      let entry = dateMap.get(dateKey);
      if (!entry) {
        const dObj = new Date(s.purchaseDate);
        const displayDate = dObj.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "2-digit",
        });
        entry = { date: dateKey, displayDate, _meta: {} };
        dateMap.set(dateKey, entry);
      }
      const price = priceMode === "unit" ? s.pricePerBaseUnit : s.unitPrice;
      entry[s.storeName] = price;

      const q = Math.max(Number(s.quantity) || 1, 1);
      const single = Number((Number(s.unitMeasure) / q).toFixed(3));
      const format = formatPackBadge(single, s.baseUnit);
      if (!entry._meta) entry._meta = {};
      entry._meta[s.storeName] = {
        packPrice: s.unitPrice,
        format,
      };
    });

    return Array.from(dateMap.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    );
  }, [filteredSightings, priceMode]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
        <Link
          href="/products"
          className="hover:text-zinc-200 transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Products</span>
        </Link>
        <span>/</span>
        <span className="text-zinc-400 truncate">{productData.category}</span>
        <span>/</span>
        <span className="text-emerald-400 font-semibold truncate">
          {productData.displayName}
        </span>
      </div>

      {/* 1. Clear Product Header */}
      <div className="rounded-3xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/90 to-zinc-950 p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700/60 text-xs font-medium whitespace-nowrap shrink-0">
                {productData.category}
              </span>
              {productData.isStaple && (
                <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Everyday Staple</span>
                </span>
              )}
              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(true)}
                    className="px-2.5 py-1 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 text-xs font-medium whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Pencil className="w-3 h-3 text-emerald-400" />
                    <span>Edit Product</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsNormalizeModalOpen(true)}
                    className="px-2.5 py-1 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 text-xs font-medium whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Scale className="w-3 h-3 text-emerald-400" />
                    <span>Normalize Format / History</span>
                  </button>
                </>
              )}
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
              {productData.displayName}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl">
              Multi-store historical price comparison across Spanish supermarkets with normalized{" "}
              <strong className="text-zinc-300 font-mono font-medium">{unitLabel}</strong> unit pricing.
            </p>
          </div>

          {/* Controls: Price Unit Toggle + Timeframe Pills */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            {/* Unit vs Pack Mode Toggle */}
            <div className="inline-flex rounded-xl p-1 bg-zinc-900 border border-zinc-800 shrink-0">
              <button
                type="button"
                onClick={() => setPriceMode("unit")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  priceMode === "unit"
                    ? "bg-emerald-500 text-zinc-950 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {unitLabel}
              </button>
              <button
                type="button"
                onClick={() => setPriceMode("pack")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  priceMode === "pack"
                    ? "bg-emerald-500 text-zinc-950 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Pack €
              </button>
            </div>

            {/* Timeframe Selector Pills */}
            <div className="inline-flex rounded-xl p-1 bg-zinc-900 border border-zinc-800 shrink-0">
              {(["1M", "3M", "6M", "1Y", "2Y", "All"] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    timeframe === tf
                      ? "bg-zinc-800 text-emerald-400 border border-zinc-700/60 shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 4 Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {/* Card 1: Cheapest Now */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-1.5">
            <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider flex items-center justify-between">
              <span>Cheapest Now</span>
              {cheapestNow && (
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-sm whitespace-nowrap"
                  style={{ backgroundColor: cheapestNow.storeBrandHex }}
                >
                  {cheapestNow.storeName}
                </span>
              )}
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
              {cheapestNow
                ? `${cheapestNow.currentPrice.toFixed(2)} ${priceMode === "unit" ? unitLabel : "€"}`
                : "—"}
            </div>
            <div className="text-[11px] text-zinc-500 font-mono">
              Recorded {cheapestNow ? new Date(cheapestNow.lastSeenDate).toLocaleDateString("en-GB") : "N/A"}
            </div>
          </div>

          {/* Card 2: Period Change */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-1.5">
            <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider flex items-center justify-between">
              <span>Period Change</span>
              <span className="text-zinc-500 font-mono text-[10px]">({timeframe})</span>
            </div>
            {periodStats.hasHistory ? (
              <>
                <div
                  className={`text-2xl font-bold font-mono tabular-nums flex items-center gap-1.5 ${
                    periodStats.changePercent < 0
                      ? "text-emerald-400"
                      : periodStats.changePercent > 0
                      ? "text-rose-400"
                      : "text-zinc-300"
                  }`}
                >
                  {periodStats.changePercent < 0 && <TrendingDown className="w-5 h-5 shrink-0" />}
                  {periodStats.changePercent > 0 && <TrendingUp className="w-5 h-5 shrink-0" />}
                  <span>
                    {periodStats.changePercent > 0 ? "+" : ""}
                    {periodStats.changePercent.toFixed(1)}%
                  </span>
                </div>
                <div className="text-[11px] text-zinc-500 font-mono truncate">
                  {periodStats.oldAvg.toFixed(2)} → {periodStats.newAvg.toFixed(2)}{" "}
                  {priceMode === "unit" ? unitLabel : "€"}
                </div>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold font-mono tabular-nums text-zinc-400">
                  {periodStats.newAvg > 0 ? `${periodStats.newAvg.toFixed(2)} ${priceMode === "unit" ? unitLabel : "€"}` : "—"}
                </div>
                <div className="text-[11px] text-zinc-500 font-mono truncate">
                  Single observation recorded
                </div>
              </>
            )}
          </div>

          {/* Card 3: All-Time Low / High */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-1.5">
            <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
              All-Time Low / High
            </div>
            <div className="text-sm font-mono space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-emerald-400 font-bold">
                  Low: {allTimeStats.low.toFixed(2)} {priceMode === "unit" ? unitLabel : "€"}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {allTimeStats.lowDate ? new Date(allTimeStats.lowDate).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }) : ""}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-rose-400 font-bold">
                  High: {allTimeStats.high.toFixed(2)} {priceMode === "unit" ? unitLabel : "€"}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {allTimeStats.highDate ? new Date(allTimeStats.highDate).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }) : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: Store Spread */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-1.5">
            <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
              Store Spread
            </div>
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {storeSpread.toFixed(2)} {priceMode === "unit" ? unitLabel : "€"}
            </div>
            <div className="text-[11px] text-zinc-500 font-mono">
              Cheapest vs most expensive now
            </div>
          </div>
        </div>
      </div>

      {/* ⚠️ SHRINKFLATION ALERT BANNER */}
      {shrinkflationIncidents && shrinkflationIncidents.length > 0 && (
        <div className="space-y-3">
          {shrinkflationIncidents.map((inc) => (
            <div
              key={inc.id}
              className="rounded-3xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent p-5 sm:p-6 text-amber-200 space-y-3 shadow-xl"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">⚠️</span>
                  <span className="text-sm font-bold text-amber-300 tracking-wide uppercase font-mono">
                    Shrinkflation Detected
                  </span>
                  <span
                    className="px-2.5 py-0.5 rounded-full text-xs font-bold text-white shadow-sm whitespace-nowrap shrink-0"
                    style={{ backgroundColor: inc.storeHex }}
                  >
                    {inc.storeName}
                  </span>
                </div>
                <span className="text-xs font-mono text-amber-300/80">
                  {new Date(inc.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>

              <p className="text-xs sm:text-sm text-amber-100 leading-relaxed">
                Shrinkflation recorded at <strong>{inc.storeName}</strong> on{" "}
                <strong>{new Date(inc.date).toLocaleDateString("en-GB")}</strong>: package size was reduced from{" "}
                <strong className="underline decoration-amber-400 font-mono">{formatMeasure(inc.oldMeasure, inc.baseUnit)}</strong> to{" "}
                <strong className="underline decoration-amber-400 font-mono">{formatMeasure(inc.newMeasure, inc.baseUnit)}</strong>{" "}
                (-{inc.percentMeasureReduction}%) while keeping a similar pack price (
                <span className="font-mono">€{inc.oldUnitPrice.toFixed(2)} → €{inc.newUnitPrice.toFixed(2)}</span>), causing a stealth price surge of{" "}
                <strong className="text-rose-300 font-mono font-bold">+{inc.percentNormIncrease}%</strong> per {inc.baseUnit.toLowerCase()}.
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-mono">
                <span className="px-3 py-1 rounded-xl bg-zinc-950/70 border border-amber-500/30 text-zinc-300 whitespace-nowrap shrink-0">
                  Pack: {formatMeasure(inc.oldMeasure, inc.baseUnit)} → {formatMeasure(inc.newMeasure, inc.baseUnit)} (-{inc.percentMeasureReduction}%)
                </span>
                <span className="px-3 py-1 rounded-xl bg-zinc-950/70 border border-amber-500/30 text-zinc-300 whitespace-nowrap shrink-0">
                  Pack price: €{inc.oldUnitPrice.toFixed(2)} → €{inc.newUnitPrice.toFixed(2)}
                </span>
                <span className="px-3 py-1 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold whitespace-nowrap shrink-0">
                  Normalized price: €{inc.oldNormPrice.toFixed(2)} → €{inc.newNormPrice.toFixed(2)}/{inc.baseUnit.toLowerCase()} (+{inc.percentNormIncrease}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2. Interactive Multi-Store Price History Chart (Recharts) */}
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-6 sm:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div className="space-y-0.5">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Scale className="w-5 h-5 text-emerald-400" />
              <span>Multi-Store Price Trajectory ({timeframe})</span>
            </h2>
            <p className="text-xs text-zinc-400">
              Continuous price evolution plotted from confirmed grocery receipts.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
            <div className="inline-flex rounded-lg p-0.5 bg-zinc-950 border border-zinc-800 shrink-0">
              <button
                type="button"
                onClick={() => setChartCurve("step")}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap transition-all ${
                  chartCurve === "step"
                    ? "bg-emerald-500 text-zinc-950 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Step
              </button>
              <button
                type="button"
                onClick={() => setChartCurve("smooth")}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap transition-all ${
                  chartCurve === "smooth"
                    ? "bg-emerald-500 text-zinc-950 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Smooth
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <span>Range:</span>
              <span className="text-emerald-400 font-semibold">{timeframe}</span>
            </div>
          </div>
        </div>

        {/* Format Filter Pills (when 2+ distinct pack sizes exist) */}
        {availableFormats.length >= 2 && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 pb-1 border-b border-zinc-800/60">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider mr-1">
                Pack Format:
              </span>
              <button
                type="button"
                onClick={() => setSelectedFormat("all")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                  selectedFormat === "all"
                    ? "bg-emerald-500 text-zinc-950 shadow-sm"
                    : "bg-zinc-950 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                }`}
              >
                All formats ({unitLabel})
              </button>
              {availableFormats.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => setSelectedFormat(f.label)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                    selectedFormat === f.label
                      ? "bg-emerald-500 text-zinc-950 shadow-sm"
                      : "bg-zinc-950 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                  }`}
                >
                  {f.label}{" "}
                  <span className="text-[10px] opacity-70 font-mono">({f.count})</span>
                </button>
              ))}
            </div>

            {priceMode === "pack" && selectedFormat === "all" && (
              <div className="text-[11px] text-amber-400/90 font-mono flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg whitespace-nowrap shrink-0">
                <span>⚠️ Select a specific format to compare Pack € without mixing sizes</span>
              </div>
            )}
          </div>
        )}

        {/* Chart View */}
        <div className="h-80 w-full pt-4">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="displayDate"
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
                  tickFormatter={(val: number | string) => `€${Number(val).toFixed(2)}`}
                  domain={[0, "auto"]}
                />
                <Tooltip
                  content={({ active, payload, label }: TooltipContentProps) => {
                    if (!active || !payload || !payload.length) return null;
                    const pointMeta =
                      (payload[0]?.payload as ChartPoint | undefined)?._meta || {};
                    return (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-md p-3.5 shadow-2xl space-y-2 text-xs">
                        <div className="font-semibold text-zinc-200 border-b border-zinc-800 pb-1.5 flex items-center justify-between gap-3">
                          <span>{label}</span>
                          {selectedFormat !== "all" && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-emerald-400 border border-zinc-700/60 whitespace-nowrap shrink-0">
                              {selectedFormat}
                            </span>
                          )}
                        </div>
                        <div className="space-y-2">
                          {payload.map((entry) => {
                            const meta = pointMeta[String(entry.name)];
                            return (
                              <div
                                key={entry.name}
                                className="space-y-0.5 font-mono text-xs border-b border-zinc-900/60 last:border-0 pb-1.5 last:pb-0"
                              >
                                <div className="flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: entry.color }}
                                    />
                                    <span className="text-zinc-300 font-semibold">{entry.name}</span>
                                  </div>
                                  <span className="font-bold text-white tabular-nums">
                                    €{Number(entry.value).toFixed(2)}{" "}
                                    {priceMode === "unit" ? unitLabel : "€"}
                                  </span>
                                </div>
                                {meta && (
                                  <div className="flex items-center justify-between text-[10px] text-zinc-400 pl-4">
                                    <span className="text-zinc-500">{meta.format}</span>
                                    <span>Pack: €{meta.packPrice.toFixed(2)}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: "12px", fontSize: "12px" }}
                  iconType="circle"
                />
                {shrinkflationIncidents.map((inc) => {
                  const incDateKey = inc.date.slice(0, 10);
                  const matchingPoint = chartData.find((p) => p.date === incDateKey);
                  if (!matchingPoint) return null;
                  return (
                    <ReferenceLine
                      key={`ref-${inc.id}`}
                      x={String(matchingPoint.displayDate)}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{
                        value: "⚠️ Shrinkflation",
                        fill: "#f59e0b",
                        fontSize: 10,
                        position: "top",
                        offset: 5,
                      }}
                    />
                  );
                })}
                {uniqueStores.map((store) => (
                  <Line
                    key={store.name}
                    type={chartCurve === "step" ? "stepAfter" : "monotone"}
                    dataKey={store.name}
                    stroke={store.brandHex}
                    strokeWidth={2.5}
                    dot={{ r: 4, strokeWidth: 1, fill: store.brandHex }}
                    activeDot={{ r: 6, strokeWidth: 2 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full flex items-center justify-center text-xs text-zinc-500 font-mono animate-pulse">
              Loading price history chart...
            </div>
          )}
        </div>
      </div>

      {/* 3. Current Price by Supermarket (Ranked List) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <StoreIcon className="w-4 h-4 text-emerald-400" />
              <span>Current Price by Supermarket (Ranked)</span>
            </h2>
            <p className="text-xs text-zinc-400">
              Ranked from cheapest to most expensive across stores with recent confirmed purchases.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {storeRankings.map((store, idx) => {
            const isLowest = idx === 0;
            return (
              <div
                key={store.storeName}
                className={`rounded-2xl border p-4 space-y-3 transition-all ${
                  isLowest
                    ? "border-emerald-500/50 bg-zinc-900/90 shadow-lg ring-1 ring-emerald-500/30"
                    : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2.5 py-0.5 rounded-lg text-xs font-bold text-white shadow-sm whitespace-nowrap shrink-0"
                      style={{ backgroundColor: store.storeBrandHex }}
                    >
                      {store.storeName}
                    </span>
                    {isLowest && (
                      <span className="text-[10px] font-bold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 whitespace-nowrap shrink-0">
                        Cheapest
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono whitespace-nowrap">
                    Rank #{idx + 1}
                  </span>
                </div>

                {/* Raw POS Alias */}
                <div className="text-[11px] text-zinc-400 font-mono truncate" title={store.rawName}>
                  POS: &ldquo;{store.rawName}&rdquo;
                </div>

                {/* Price & 1Y Difference */}
                <div className="pt-2 border-t border-zinc-800/80 flex items-baseline justify-between">
                  <div>
                    <div className="text-xl font-bold font-mono text-white tabular-nums">
                      {store.currentPrice.toFixed(2)} {priceMode === "unit" ? unitLabel : "€"}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                      Seen {new Date(store.lastSeenDate).toLocaleDateString("en-GB")}
                    </div>
                  </div>

                  {store.diffPercent1Y !== null && (
                    <div className="text-right">
                      <div
                        className={`text-xs font-semibold font-mono flex items-center justify-end gap-1 ${
                          store.diffPercent1Y < 0
                            ? "text-emerald-400"
                            : store.diffPercent1Y > 0
                            ? "text-rose-400"
                            : "text-zinc-400"
                        }`}
                      >
                        {store.diffPercent1Y < 0 && <TrendingDown className="w-3 h-3" />}
                        {store.diffPercent1Y > 0 && <TrendingUp className="w-3 h-3" />}
                        <span>
                          {store.diffPercent1Y > 0 ? "+" : ""}
                          {store.diffPercent1Y.toFixed(1)}%
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500">vs 1Y ago</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Historical Receipt Sightings Log */}
      <div className="space-y-4">
        <div className="space-y-0.5">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <ReceiptIcon className="w-4 h-4 text-emerald-400" />
            <span>Historical Receipt Sightings Log ({currentSightings.length} observations)</span>
          </h2>
          <p className="text-xs text-zinc-400">
            Chronological log of confirmed receipt items linking to source tickets.
          </p>
        </div>

        {deleteError && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 flex items-center gap-2 text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{deleteError}</span>
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-zinc-800/80 bg-zinc-900/40">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/70 text-zinc-400 font-medium font-mono">
                <th className="py-3 px-4">Purchase Date</th>
                <th className="py-3 px-4">Supermarket</th>
                <th className="py-3 px-4">Receipt Raw Text</th>
                <th className="py-3 px-4 text-center">Pack Format</th>
                <th className="py-3 px-4 text-center">Package / Weight</th>
                <th className="py-3 px-4 text-right">Pack Price</th>
                <th className="py-3 px-4 text-right">Normalized Price</th>
                <th className="py-3 px-4 text-right">Receipt</th>
                {canDelete && <th className="py-3 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {displayedTableSightings
                .slice()
                .reverse()
                .slice(0, 50)
                .map((s) => {
                  const q = Math.max(Number(s.quantity) || 1, 1);
                  const single = Number((Number(s.unitMeasure) / q).toFixed(3));
                  const formatBadge = formatPackBadge(single, s.baseUnit);

                  return (
                    <tr key={s.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-2.5 px-4 text-zinc-300">
                        {new Date(s.purchaseDate).toLocaleDateString("en-GB")}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className="inline-block px-2 py-0.5 rounded text-[11px] font-bold text-white shadow-sm"
                          style={{ backgroundColor: s.storeBrandHex }}
                        >
                          {s.storeName}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-zinc-400 truncate max-w-xs font-sans">
                        {s.rawName}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-zinc-800/80 text-emerald-400 border border-zinc-700/60 text-[10px] font-mono font-medium whitespace-nowrap shrink-0">
                          {formatBadge}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-zinc-950 text-zinc-300 border border-zinc-800 text-[11px] font-mono shadow-inner">
                          {s.baseUnit === "KG"
                            ? `${s.unitMeasure.toFixed(3)} kg`
                            : s.baseUnit === "L"
                            ? `${s.unitMeasure} L`
                            : s.unitMeasure > 1
                            ? `${s.unitMeasure} units`
                            : `${s.quantity || 1} unit`}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right text-zinc-200 tabular-nums">
                        €{s.unitPrice.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="text-emerald-400 font-bold tabular-nums">
                          €{s.pricePerBaseUnit.toFixed(2)} {unitLabel}
                        </div>
                        {s.unitMeasure !== 1 && (
                          <div className="text-[10px] text-zinc-500 font-normal tabular-nums">
                            €{s.unitPrice.toFixed(2)} &divide; {s.unitMeasure} {s.baseUnit.toLowerCase()}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <Link
                          href={`/receipts/${s.receiptId}/review`}
                          className="text-zinc-500 hover:text-emerald-400 transition-colors text-[11px]"
                        >
                          #{s.receiptId.slice(-6)} →
                        </Link>
                      </td>
                    {canDelete && (
                      <td className="py-2.5 px-4 text-right">
                        {confirmDeleteId === s.id ? (
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleDeleteSighting(s.id)}
                              disabled={deletingId === s.id}
                              className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 shadow-sm"
                            >
                              {deletingId === s.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                "Delete"
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800"
                              title="Cancel"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditSighting(s)}
                              className="p-1.5 text-zinc-400 hover:text-emerald-400 rounded-lg hover:bg-zinc-800/80 transition-colors inline-flex items-center justify-center"
                              title="Edit observation details"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(s.id)}
                              className="p-1.5 text-zinc-400 hover:text-rose-400 rounded-lg hover:bg-zinc-800/80 transition-colors inline-flex items-center justify-center"
                              title="Exclude this observation from price intelligence"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin Edit Product Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in-50">
          <div className="w-full max-w-lg max-h-[92vh] flex flex-col rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-7 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3.5 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Edit Product Definition</h3>
                  <p className="text-xs text-zinc-400">Canonical catalogue entry & normalization rules</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center gap-2 shrink-0">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-4 overflow-y-auto pr-1 flex-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Display Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  >
                    {CANONICAL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Base Unit</label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-zinc-900 border border-zinc-800">
                    {(["KG", "L", "UNIT"] as const).map((unit) => (
                      <button
                        key={unit}
                        type="button"
                        onClick={() => setEditBaseUnit(unit)}
                        className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                          editBaseUnit === unit
                            ? "bg-emerald-500 text-zinc-950 shadow-sm"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        {unit}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 transition-colors cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsStaple}
                    onChange={(e) => setEditIsStaple(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500/20 bg-zinc-950"
                  />
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                      <Star className={`w-3.5 h-3.5 ${editIsStaple ? "text-amber-400 fill-amber-400" : "text-zinc-500"}`} />
                      <span>Everyday Household Staple</span>
                    </span>
                    <p className="text-[11px] text-zinc-500">
                      Prioritizes this product in search suggestions, comparator presets, and the Staple Basket Inflation Index.
                    </p>
                  </div>
                </label>
              </div>

              <div className="pt-3.5 border-t border-zinc-800 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={isSavingProduct}
                  className="px-4 py-2 rounded-xl border border-zinc-800 hover:bg-zinc-900 text-xs font-medium text-zinc-400 transition-colors whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingProduct}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold shadow-md shadow-emerald-500/20 transition-all inline-flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  {isSavingProduct && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Normalize Product History Modal */}
      {isNormalizeModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in-50">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8 space-y-6 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Scale className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Normalize Format & History</h3>
                  <p className="text-xs text-zinc-400">Retroactively recalculates all historical purchases of this product</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNormalizeModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {normalizeError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center gap-2 shrink-0">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{normalizeError}</span>
              </div>
            )}

            <form onSubmit={handleNormalizeHistory} className="space-y-6 overflow-y-auto pr-1">
              {/* 1. Canonical Base Unit Selector */}
              <div className="space-y-2 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
                <label className="text-xs font-semibold text-zinc-300 block">
                  Canonical Product Base Unit
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["KG", "L", "UNIT"] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setNormalizeBaseUnit(unit)}
                      className={`py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap shrink-0 ${
                        normalizeBaseUnit === unit
                          ? "bg-emerald-500 text-zinc-950 shadow-md"
                          : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
                      }`}
                    >
                      {unit === "KG" ? "KG (€/kg)" : unit === "L" ? "L (€/L)" : "UNIT (€/unit)"}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-500">
                  All historical purchases will be normalized to this reference unit.
                </p>
              </div>

              {/* 2. Linked Product Aliases Format Mapping */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">
                    Formats by Supermarket / POS SKU ({aliasFormats.length})
                  </span>
                  <span className="text-[11px] text-zinc-500 font-mono">
                    1 pack = X {normalizeBaseUnit.toLowerCase()}
                  </span>
                </div>

                {aliasFormats.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-zinc-800 text-center text-xs text-zinc-500">
                    No aliases recorded for this product yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {aliasFormats.map((af, idx) => (
                      <div
                        key={af.aliasId || idx}
                        className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-sm whitespace-nowrap shrink-0"
                              style={{ backgroundColor: af.storeBrandHex }}
                            >
                              {af.storeName}
                            </span>
                            <span className="font-mono text-xs text-zinc-200 font-medium truncate max-w-xs">
                              &ldquo;{af.rawAlias}&rdquo;
                            </span>
                          </div>

                          <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">
                            <input
                              type="checkbox"
                              checked={af.isVariableWeight}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setAliasFormats((prev) =>
                                  prev.map((item, i) =>
                                    i === idx
                                      ? {
                                          ...item,
                                          isVariableWeight: checked,
                                          unitMeasurePerPack: checked ? null : item.unitMeasurePerPack,
                                        }
                                      : item
                                  )
                                );
                              }}
                              className="w-3.5 h-3.5 rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500/20 bg-zinc-950"
                            />
                            <span className="text-[11px] font-mono">Variable checkout weight (loose)</span>
                          </label>
                        </div>

                        {!af.isVariableWeight ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                <label className="text-[10px] text-zinc-400 font-mono block mb-1">
                                  Net content per individual pack ({normalizeBaseUnit.toLowerCase()}):
                                </label>
                                <input
                                  type="number"
                                  step="0.001"
                                  min="0.001"
                                  value={af.unitMeasurePerPack ?? ""}
                                  placeholder="e.g. 1.500"
                                  onChange={(e) => {
                                    const val = e.target.value === "" ? null : parseFloat(e.target.value);
                                    setAliasFormats((prev) =>
                                      prev.map((item, i) =>
                                        i === idx ? { ...item, unitMeasurePerPack: val } : item
                                      )
                                    );
                                  }}
                                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-white focus:outline-none focus:border-emerald-500 transition-colors"
                                />
                              </div>

                              <div className="pt-4 text-xs font-mono text-zinc-400">
                                {af.unitMeasurePerPack ? (
                                  <span className="text-emerald-400 font-bold">
                                    {formatPackBadge(af.unitMeasurePerPack, normalizeBaseUnit)}
                                  </span>
                                ) : (
                                  <span className="text-zinc-600">No fixed format</span>
                                )}
                              </div>
                            </div>

                            {/* Preset Buttons */}
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              <span className="text-[10px] text-zinc-500 font-mono mr-1">Presets:</span>
                              {(normalizeBaseUnit === "L"
                                ? [
                                    { l: "330ml", v: 0.33 },
                                    { l: "500ml", v: 0.5 },
                                    { l: "1L", v: 1 },
                                    { l: "1.5L", v: 1.5 },
                                    { l: "2L", v: 2 },
                                    { l: "5L", v: 5 },
                                  ]
                                : normalizeBaseUnit === "KG"
                                ? [
                                    { l: "125g", v: 0.125 },
                                    { l: "250g", v: 0.25 },
                                    { l: "400g", v: 0.4 },
                                    { l: "500g", v: 0.5 },
                                    { l: "1kg", v: 1 },
                                  ]
                                : [
                                    { l: "1 unit", v: 1 },
                                    { l: "4 units", v: 4 },
                                    { l: "6 units", v: 6 },
                                    { l: "12 units", v: 12 },
                                  ]
                              ).map((preset) => (
                                <button
                                  key={preset.l}
                                  type="button"
                                  onClick={() => {
                                    setAliasFormats((prev) =>
                                      prev.map((item, i) =>
                                        i === idx ? { ...item, unitMeasurePerPack: preset.v } : item
                                      )
                                    );
                                  }}
                                  className="px-2 py-0.5 rounded-md bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors whitespace-nowrap shrink-0"
                                >
                                  {preset.l}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] font-mono text-amber-400/90 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl">
                            Purchases with this alias will maintain their specific scale weight recorded on each receipt.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-zinc-800 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsNormalizeModalOpen(false)}
                  disabled={isNormalizing}
                  className="px-4 py-2 rounded-xl border border-zinc-800 hover:bg-zinc-900 text-xs font-medium text-zinc-400 transition-colors whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isNormalizing}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold shadow-md shadow-emerald-500/20 transition-all inline-flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  {isNormalizing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>⚡ Recalculate full history</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Sighting Observation Modal */}
      {editingSighting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in-50">
          <div className="w-full max-w-lg max-h-[92vh] flex flex-col rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-7 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3.5 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Edit Observation</h3>
                  <p className="text-xs text-zinc-400">
                    Correct pack price, quantity, or net package weight for this purchase
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingSighting(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {sightingSaveError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center gap-2 shrink-0">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{sightingSaveError}</span>
              </div>
            )}

            {/* Context Info Banner */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-xs shrink-0">
              <div className="flex items-center gap-2">
                <span
                  className="px-2 py-0.5 rounded text-[11px] font-bold text-white shadow-sm"
                  style={{ backgroundColor: editingSighting.storeBrandHex }}
                >
                  {editingSighting.storeName}
                </span>
                <span className="text-zinc-400 font-mono">
                  {new Date(editingSighting.purchaseDate).toLocaleDateString("en-GB")}
                </span>
              </div>
              <Link
                href={`/receipts/${editingSighting.receiptId}/review`}
                target="_blank"
                className="text-zinc-500 hover:text-emerald-400 font-mono text-[11px] transition-colors"
              >
                #{editingSighting.receiptId.slice(-6)} ↗
              </Link>
            </div>

            <form onSubmit={handleSaveSighting} className="space-y-4 overflow-y-auto pr-1 flex-1">
              {/* Receipt Raw Text */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Receipt Raw Text</label>
                <input
                  type="text"
                  value={editSightingRawName}
                  onChange={(e) => setEditSightingRawName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                  placeholder="POS line item description"
                />
              </div>

              {/* Price & Quantity Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Pack Price (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editSightingPrice}
                    onChange={(e) => setEditSightingPrice(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors font-mono tabular-nums"
                  />
                  <p className="text-[10px] text-zinc-500">Printed shelf price per pack</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Quantity</label>
                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    required
                    value={editSightingQty}
                    onChange={(e) => setEditSightingQty(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors font-mono tabular-nums"
                  />
                  <p className="text-[10px] text-zinc-500">Number of packs purchased</p>
                </div>
              </div>

              {/* Net Content / Weight */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-300">
                    Total Package / Weight ({editingSighting.baseUnit})
                  </label>
                  <span className="text-[10px] font-mono text-zinc-500">
                    Per pack:{" "}
                    {(
                      (parseFloat(editSightingMeasure) || 0) /
                      Math.max(parseFloat(editSightingQty) || 1, 1)
                    ).toFixed(3)}{" "}
                    {editingSighting.baseUnit.toLowerCase()}
                  </span>
                </div>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  required
                  value={editSightingMeasure}
                  onChange={(e) => setEditSightingMeasure(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors font-mono tabular-nums"
                />

                {/* Quick Presets based on baseUnit */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-zinc-500 mr-1 font-mono">Presets:</span>
                  {(editingSighting.baseUnit === "KG"
                    ? [
                        { label: "250g", val: 0.25 },
                        { label: "400g", val: 0.4 },
                        { label: "500g", val: 0.5 },
                        { label: "750g", val: 0.75 },
                        { label: "1kg", val: 1.0 },
                        { label: "2kg", val: 2.0 },
                      ]
                    : editingSighting.baseUnit === "L"
                    ? [
                        { label: "330ml", val: 0.33 },
                        { label: "500ml", val: 0.5 },
                        { label: "1L", val: 1.0 },
                        { label: "1.5L", val: 1.5 },
                        { label: "2L", val: 2.0 },
                        { label: "5L", val: 5.0 },
                      ]
                    : [
                        { label: "1 unit", val: 1 },
                        { label: "6 units", val: 6 },
                        { label: "10 units", val: 10 },
                        { label: "12 units", val: 12 },
                        { label: "24 units", val: 24 },
                      ]
                  ).map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        const q = Math.max(parseFloat(editSightingQty) || 1, 1);
                        const totalM = Number((preset.val * q).toFixed(3));
                        setEditSightingMeasure(totalM.toString());
                      }}
                      className="px-2 py-0.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-emerald-400 text-[10px] font-mono transition-colors whitespace-nowrap shrink-0"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Purchase Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Purchase Date</label>
                <input
                  type="date"
                  value={editSightingDate}
                  onChange={(e) => setEditSightingDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                />
              </div>

              {/* Live Preview Bar */}
              {(() => {
                const liveP = parseFloat(editSightingPrice) || 0;
                const liveQ = parseFloat(editSightingQty) || 1;
                const liveM = parseFloat(editSightingMeasure) || 1;
                const liveTot = liveP * liveQ;
                const liveNorm = liveM > 0 ? liveTot / liveM : 0;
                const singlePack = liveM / Math.max(liveQ, 1);
                const liveBadge = formatPackBadge(singlePack, editingSighting.baseUnit);

                return (
                  <div className="p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800/80 space-y-2">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
                      Calculated Preview
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 rounded-xl bg-zinc-950/70 border border-zinc-800/60">
                        <div className="text-[10px] text-zinc-400">Total Spend</div>
                        <div className="text-xs font-bold font-mono text-zinc-200">
                          €{liveTot.toFixed(2)}
                        </div>
                      </div>
                      <div className="p-2 rounded-xl bg-zinc-950/70 border border-zinc-800/60">
                        <div className="text-[10px] text-zinc-400">Normalized Price</div>
                        <div className="text-xs font-bold font-mono text-emerald-400">
                          €{liveNorm.toFixed(2)} {unitLabel}
                        </div>
                      </div>
                      <div className="p-2 rounded-xl bg-zinc-950/70 border border-zinc-800/60">
                        <div className="text-[10px] text-zinc-400">Pack Format</div>
                        <div className="text-[11px] font-bold font-mono text-zinc-300 truncate">
                          {liveBadge}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="pt-3.5 border-t border-zinc-800 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingSighting(null)}
                  disabled={isSavingSighting}
                  className="px-4 py-2 rounded-xl border border-zinc-800 hover:bg-zinc-900 text-xs font-medium text-zinc-400 transition-colors whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSighting}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold shadow-md shadow-emerald-500/20 transition-all inline-flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  {isSavingSighting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Observation</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

