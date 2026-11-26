"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Pencil,
  Trash2,
  X,
  Leaf,
  ScanBarcode,
  RefreshCw,
} from "lucide-react";
import {
  deleteSightingAction,
  updateProductDetailsAction,
  normalizeProductHistoryAction,
  updateSightingAction,
  fetchAndCacheProductNutritionAction,
} from "./actions";
import { CANONICAL_CATEGORIES } from "@/lib/ai/schema";
import { ShrinkflationIncident } from "@/lib/analytics/shrinkflation-types";
import {
  NON_FOOD_CATEGORIES,
  computeKcalPerEuro,
  computeProteinPerEuro,
  getNovaGroupMeta,
  getNutriScoreBadgeStyle,
} from "@/lib/analytics/nutrition";
import { BarcodeScannerModal } from "@/components/common/barcode-scanner-modal";
import {
  formatCurrency,
  formatPriceRange,
  formatUnitPrice,
  formatMeasureText,
  formatLineMeasure,
  formatPercent,
  formatDate,
  formatShortDate,
  formatDateInputDDMMYYYY,
  parseDDMMYYYYToISO,
  getStoreBrand,
  normalizeUnit,
} from "@/lib/format";

export function formatPackBadge(
  packSize: number,
  baseUnit: "KG" | "L" | "UNIT",
  isVariableWeight?: boolean
): string {
  if (isVariableWeight) return "Loose / counter";
  return formatMeasureText(packSize, baseUnit);
}

export interface SightingObservation {
  id: string;
  receiptId: string;
  purchaseDate: string;
  storeName: string;
  storeSlug: string;
  storeBrandHex: string;
  rawName: string;
  unitPrice: number;
  totalPrice: number;
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
    nutriScore?: string | null;
    novaGroup?: number | null;
    proteinPer100g?: number | null;
    kcalPer100g?: number | null;
    ean?: string | null;
    nutritionSource?: string | null;
    nutritionUpdatedAt?: string | null;
  };
  allProducts?: Array<{ slug: string; displayName: string }>;
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
  isAuthenticated?: boolean;
  shrinkflationIncidents?: ShrinkflationIncident[];
}

type Timeframe = "1M" | "3M" | "6M" | "1Y" | "2Y" | "All";
type PriceMode = "unit" | "pack";
type ChartCurve = "step" | "smooth";

interface PlottedPoint {
  id: string;
  date: string;
  iso: string;
  storeName: string;
  storeBrandHex: string;
  value: number;
  packPrice: number;
  totalPrice: number;
  unitMeasure: number;
  quantity: number;
  x: number;
  y: number;
}

export function ProductTrackerClient({
  product,
  allProducts = [],
  sightings,
  aliases,
  shrinkflationIncidents = [],
  canDelete = false,
  isAdmin = false,
  isAuthenticated = false,
}: ProductTrackerClientProps) {
  const router = useRouter();
  const [productData, setProductData] = useState(product);
  const [currentSightings, setCurrentSightings] =
    useState<SightingObservation[]>(sightings);
  const [timeframe, setTimeframe] = useState<Timeframe>("2Y");
  const [priceMode, setPriceMode] = useState<PriceMode>("unit");
  const [chartCurve, setChartCurve] = useState<ChartCurve>("step");
  const [isolatedStore, setIsolatedStore] = useState<string | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<PlottedPoint | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Edit purchase modal state
  const [editingSighting, setEditingSighting] =
    useState<SightingObservation | null>(null);
  const [editSightingPrice, setEditSightingPrice] = useState<string>("");
  const [editSightingQty, setEditSightingQty] = useState<string>("1");
  const [editSightingMeasure, setEditSightingMeasure] = useState<string>("");
  const [editSightingRawName, setEditSightingRawName] = useState<string>("");
  const [editSightingDate, setEditSightingDate] = useState<string>("");
  const [isSavingSighting, setIsSavingSighting] = useState(false);
  const [sightingSaveError, setSightingSaveError] = useState<string | null>(
    null
  );

  // Edit product modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState(product.displayName);
  const [editCategory, setEditCategory] = useState(product.category);
  const [editBaseUnit, setEditBaseUnit] = useState<"KG" | "L" | "UNIT">(
    product.baseUnit
  );
  const [editIsStaple, setEditIsStaple] = useState(product.isStaple);
  const [editNutriScore, setEditNutriScore] = useState<string>(
    product.nutriScore || ""
  );
  const [editNovaGroup, setEditNovaGroup] = useState<string>(
    product.novaGroup ? String(product.novaGroup) : ""
  );
  const [editProtein, setEditProtein] = useState<string>(
    product.proteinPer100g !== null && product.proteinPer100g !== undefined
      ? String(product.proteinPer100g)
      : ""
  );
  const [editKcal, setEditKcal] = useState<string>(
    product.kcalPer100g !== null && product.kcalPer100g !== undefined
      ? String(product.kcalPer100g)
      : ""
  );
  const [editEan, setEditEan] = useState<string>(product.ean || "");
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Nutrition & Barcode Lookup state
  const [isFetchingNutrition, setIsFetchingNutrition] = useState(false);
  const [nutritionNotice, setNutritionNotice] = useState<string | null>(null);
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);

  // Normalize product history modal state
  const [isNormalizeModalOpen, setIsNormalizeModalOpen] = useState(false);
  const [normalizeBaseUnit, setNormalizeBaseUnit] = useState<
    "KG" | "L" | "UNIT"
  >(product.baseUnit);
  const [aliasFormats, setAliasFormats] = useState(() =>
    aliases.map((a) => ({
      aliasId: a.id || "",
      storeName: a.storeName,
      storeBrandHex: a.storeBrandHex,
      rawAlias: a.rawAlias,
      unitMeasurePerPack: a.unitMeasurePerPack ?? null,
      isVariableWeight: !!a.isVariableWeight,
    }))
  );
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [normalizeError, setNormalizeError] = useState<string | null>(null);

  const availableFormats = useMemo(() => {
    const formatCountMap = new Map<string, number>();
    currentSightings.forEach((s) => {
      const q = Math.max(Number(s.quantity) || 1, 1);
      const single = Number((Number(s.unitMeasure) / q).toFixed(3));
      const badge = formatPackBadge(single, s.baseUnit);
      formatCountMap.set(badge, (formatCountMap.get(badge) || 0) + 1);
    });
    return Array.from(formatCountMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [currentSightings]);

  const [selectedFormat, setSelectedFormat] = useState<string>("all");

  const handlePriceModeChange = (mode: PriceMode) => {
    setPriceMode(mode);
    if (
      mode === "pack" &&
      availableFormats.length >= 2 &&
      selectedFormat === "all" &&
      availableFormats[0]
    ) {
      setSelectedFormat(availableFormats[0].label);
    }
  };

  const unitNoun =
    productData.baseUnit === "KG"
      ? "Per kg"
      : productData.baseUnit === "L"
        ? "Per litre"
        : "Per unit";

  const formatValue = (val: number) =>
    priceMode === "unit"
      ? formatUnitPrice(val, productData.baseUnit)
      : formatCurrency(val);

  const latestDateMs = useMemo(() => {
    if (currentSightings.length === 0) return 0;
    return Math.max(
      ...currentSightings.map((s) => new Date(s.purchaseDate).getTime())
    );
  }, [currentSightings]);

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

  const displayedTableSightings = useMemo(() => {
    const base =
      selectedFormat === "all"
        ? currentSightings
        : currentSightings.filter((s) => {
            const q = Math.max(Number(s.quantity) || 1, 1);
            const single = Number((Number(s.unitMeasure) / q).toFixed(3));
            return formatPackBadge(single, s.baseUnit) === selectedFormat;
          });
    return base.slice().reverse().slice(0, 50);
  }, [currentSightings, selectedFormat]);

  const storeRankings = useMemo(() => {
    const storeLatest = new Map<string, SightingObservation>();
    const storeOld1Y = new Map<string, SightingObservation>();
    const oneYearAgoMs = latestDateMs - 365 * 24 * 60 * 60 * 1000;

    currentSightings.forEach((s) => {
      storeLatest.set(s.storeName, s);
      if (new Date(s.purchaseDate).getTime() <= oneYearAgoMs) {
        storeOld1Y.set(s.storeName, s);
      }
    });

    return Array.from(storeLatest.values())
      .map((latest) => {
        const currentPrice =
          priceMode === "unit" ? latest.pricePerBaseUnit : latest.unitPrice;
        const old1Y = storeOld1Y.get(latest.storeName);
        let diffPercent1Y: number | null = null;
        if (old1Y) {
          const oldP =
            priceMode === "unit" ? old1Y.pricePerBaseUnit : old1Y.unitPrice;
          if (oldP > 0) {
            diffPercent1Y = ((currentPrice - oldP) / oldP) * 100;
          }
        }
        const matchingAlias = aliases.find(
          (a) => a.storeName.toLowerCase() === latest.storeName.toLowerCase()
        );

        return {
          storeName: latest.storeName,
          storeBrandHex: latest.storeBrandHex,
          rawName: matchingAlias ? matchingAlias.rawAlias : latest.rawName,
          lastSeenDate: latest.purchaseDate,
          currentPrice,
          packPrice: latest.unitPrice,
          totalPrice: latest.totalPrice,
          unitMeasure: latest.unitMeasure,
          quantity: latest.quantity || 1,
          diffPercent1Y,
        };
      })
      .sort((a, b) => a.currentPrice - b.currentPrice);
  }, [currentSightings, priceMode, aliases, latestDateMs]);

  const cheapestNow = storeRankings[0] || null;
  const mostExpensiveNow =
    storeRankings.length > 1 ? storeRankings[storeRankings.length - 1] : null;
  const storeSpread =
    cheapestNow && mostExpensiveNow
      ? Math.max(0, mostExpensiveNow.currentPrice - cheapestNow.currentPrice)
      : 0;

  const periodStats = useMemo(() => {
    if (filteredSightings.length === 0) {
      return {
        changePercent: 0,
        oldAvg: 0,
        newAvg: 0,
        oldDate: "",
        hasHistory: false,
      };
    }
    const sorted = [...filteredSightings].sort(
      (a, b) =>
        new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime()
    );
    const earliestDate = sorted[0].purchaseDate.slice(0, 10);
    const latestDate = sorted[sorted.length - 1].purchaseDate.slice(0, 10);

    if (sorted.length === 1 || earliestDate === latestDate) {
      const avg =
        sorted.reduce(
          (sum, s) =>
            sum + (priceMode === "unit" ? s.pricePerBaseUnit : s.unitPrice),
          0
        ) / sorted.length;
      return {
        changePercent: 0,
        oldAvg: avg,
        newAvg: avg,
        oldDate: sorted[0].purchaseDate,
        hasHistory: false,
      };
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
      oldDate: sorted[0].purchaseDate,
      hasHistory: true,
    };
  }, [filteredSightings, priceMode]);

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
      high,
      highDate: highS.purchaseDate,
    };
  }, [currentSightings, priceMode]);

  // Interactive Multi-Store SVG Chart computation
  const chartModel = useMemo(() => {
    const width = 760;
    const height = 250;
    const padL = 68;
    const padR = 24;
    const padT = 24;
    const padB = 38;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const sorted = [...filteredSightings].sort((a, b) =>
      a.purchaseDate.localeCompare(b.purchaseDate)
    );
    if (sorted.length === 0) {
      return {
        width,
        height,
        padL,
        padR,
        padT,
        padB,
        yTicks: [] as Array<{ val: number; y: number }>,
        xDates: [] as Array<{ iso: string; label: string; x: number }>,
        series: [] as Array<{
          storeName: string;
          color: string;
          path: string;
          points: PlottedPoint[];
        }>,
        refLines: [] as Array<{ id: string; x: number }>,
      };
    }

    const timestamps = sorted.map((s) => new Date(s.purchaseDate).getTime());
    const minT = Math.min(...timestamps);
    const maxT = Math.max(...timestamps);
    const spanT = maxT - minT || 1;

    const values = sorted.map((s) =>
      priceMode === "unit" ? s.pricePerBaseUnit : s.unitPrice
    );
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const margin = (rawMax - rawMin) * 0.22 || Math.max(rawMax * 0.14, 0.2);
    const minY = Math.max(0, rawMin - margin);
    const maxY = rawMax + margin;
    const spanY = maxY - minY || 1;

    const xFor = (iso: string) => {
      if (sorted.length === 1 || maxT === minT) return padL + plotW / 2;
      const t = new Date(iso).getTime();
      return padL + ((t - minT) / spanT) * plotW;
    };
    const yFor = (v: number) => padT + plotH - ((v - minY) / spanY) * plotH;

    const yTicks = [0, 1, 2, 3].map((i) => {
      const val = minY + (spanY * i) / 3;
      return { val, y: yFor(val) };
    });

    const seenDay = new Set<string>();
    const rawDates: Array<{ iso: string; label: string; x: number }> = [];
    sorted.forEach((s) => {
      const dayKey = s.purchaseDate.slice(0, 10);
      if (!seenDay.has(dayKey)) {
        seenDay.add(dayKey);
        rawDates.push({
          iso: s.purchaseDate,
          label: formatShortDate(s.purchaseDate),
          x: xFor(s.purchaseDate),
        });
      }
    });

    // Limit crowded X-axis labels so they stay clean
    const xDates =
      rawDates.length <= 6
        ? rawDates
        : rawDates.filter(
            (_, idx) =>
              idx === 0 ||
              idx === rawDates.length - 1 ||
              idx % Math.ceil(rawDates.length / 5) === 0
          );

    const byStore = new Map<string, PlottedPoint[]>();
    sorted.forEach((s) => {
      const val = priceMode === "unit" ? s.pricePerBaseUnit : s.unitPrice;
      const pt: PlottedPoint = {
        id: s.id,
        date: s.purchaseDate,
        iso: s.purchaseDate.slice(0, 10),
        storeName: s.storeName,
        storeBrandHex: s.storeBrandHex,
        value: val,
        packPrice: s.unitPrice,
        totalPrice: s.totalPrice,
        unitMeasure: s.unitMeasure,
        quantity: s.quantity || 1,
        x: xFor(s.purchaseDate),
        y: yFor(val),
      };
      const arr = byStore.get(s.storeName) || [];
      arr.push(pt);
      byStore.set(s.storeName, arr);
    });

    const series = Array.from(byStore.entries()).map(([storeName, pts]) => {
      const color = getStoreBrand(storeName, pts[0]?.storeBrandHex).color;
      let path = "";
      if (pts.length > 1) {
        path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
        for (let i = 1; i < pts.length; i++) {
          const prev = pts[i - 1];
          const curr = pts[i];
          if (chartCurve === "step") {
            path += ` L ${curr.x.toFixed(1)} ${prev.y.toFixed(1)} L ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
          } else {
            const cx = ((prev.x + curr.x) / 2).toFixed(1);
            path += ` C ${cx} ${prev.y.toFixed(1)}, ${cx} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
          }
        }
      }
      return { storeName, color, path, points: pts };
    });

    const refLines = shrinkflationIncidents
      .filter((inc) => {
        const ms = new Date(inc.date).getTime();
        return ms >= minT && ms <= maxT;
      })
      .map((inc) => ({
        id: inc.id,
        x: xFor(inc.date),
      }));

    return {
      width,
      height,
      padL,
      padR,
      padT,
      padB,
      yTicks,
      xDates,
      series,
      refLines,
    };
  }, [filteredSightings, priceMode, chartCurve, shrinkflationIncidents]);

  const handleDeleteSighting = async (sightingId: string) => {
    setDeletingId(sightingId);
    setDeleteError(null);
    try {
      const res = await deleteSightingAction(sightingId, product.slug);
      if (res.success) {
        setCurrentSightings((prev) => prev.filter((s) => s.id !== sightingId));
        setConfirmDeleteId(null);
      } else {
        setDeleteError(res.error || "Could not remove this purchase.");
      }
    } catch (err: unknown) {
      setDeleteError(
        err instanceof Error ? err.message : "Error removing purchase."
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
    setEditSightingDate(formatDateInputDDMMYYYY(s.purchaseDate));
    setSightingSaveError(null);
  };

  const handleSaveSighting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSighting) return;

    const priceNum = parseFloat(editSightingPrice);
    const qtyNum = parseFloat(editSightingQty);
    const measureNum = parseFloat(editSightingMeasure);
    const trimmedDate = editSightingDate.trim();
    const parsedDateISO = trimmedDate ? parseDDMMYYYYToISO(trimmedDate) : null;

    if (isNaN(priceNum) || priceNum < 0) {
      setSightingSaveError("Please enter a valid pack price.");
      return;
    }
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setSightingSaveError("Please enter a valid quantity.");
      return;
    }
    if (isNaN(measureNum) || measureNum <= 0) {
      setSightingSaveError("Please enter a valid pack weight or volume.");
      return;
    }
    if (trimmedDate && !parsedDateISO) {
      setSightingSaveError(
        "Please enter a valid purchase date in DD/MM/YYYY format."
      );
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
        purchaseDate: parsedDateISO || undefined,
      });

      if (res.success && res.updated) {
        const updated = res.updated;
        setCurrentSightings((prev) =>
          prev.map((s) =>
            s.id === updated.id
              ? {
                  ...s,
                  unitPrice: updated.unitPrice,
                  totalPrice: updated.totalPrice,
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
        setSightingSaveError(res.error || "Failed to update purchase.");
      }
    } catch (err: unknown) {
      setSightingSaveError(
        err instanceof Error ? err.message : "Error updating purchase."
      );
    } finally {
      setIsSavingSighting(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProduct(true);
    setEditError(null);
    const parsedNutri =
      editNutriScore === "a" ||
      editNutriScore === "b" ||
      editNutriScore === "c" ||
      editNutriScore === "d" ||
      editNutriScore === "e"
        ? editNutriScore
        : null;
    const parsedNovaNum = parseInt(editNovaGroup, 10);
    const parsedNova =
      parsedNovaNum === 1 ||
      parsedNovaNum === 2 ||
      parsedNovaNum === 3 ||
      parsedNovaNum === 4
        ? parsedNovaNum
        : null;
    const parsedProtein =
      editProtein.trim() !== "" && Number.isFinite(parseFloat(editProtein))
        ? parseFloat(editProtein)
        : null;
    const parsedKcal =
      editKcal.trim() !== "" && Number.isFinite(parseFloat(editKcal))
        ? parseFloat(editKcal)
        : null;
    const cleanEan = editEan.trim() || null;

    try {
      const res = await updateProductDetailsAction(productData.id, {
        displayName: editName,
        category: editCategory,
        baseUnit: editBaseUnit,
        isStaple: editIsStaple,
        nutriScore: parsedNutri,
        novaGroup: parsedNova,
        proteinPer100g: parsedProtein,
        kcalPer100g: parsedKcal,
        ean: cleanEan,
      });
      if (res.success) {
        setProductData((prev) => ({
          ...prev,
          displayName: editName.trim(),
          category: editCategory,
          baseUnit: editBaseUnit,
          isStaple: editIsStaple,
          nutriScore: parsedNutri,
          novaGroup: parsedNova,
          proteinPer100g: parsedProtein,
          kcalPer100g: parsedKcal,
          ean: cleanEan,
        }));
        setIsEditModalOpen(false);
        router.refresh();
      } else {
        setEditError(res.error || "Failed to update item.");
      }
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Error saving item.");
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleFetchNutrition = async (barcodeOverride?: string) => {
    setIsFetchingNutrition(true);
    setNutritionNotice(null);
    try {
      const res = await fetchAndCacheProductNutritionAction(
        productData.id,
        barcodeOverride
      );
      if (!res.success) {
        setNutritionNotice(res.error || "Could not fetch nutrition details.");
      } else if (!res.found || !res.nutrition) {
        setNutritionNotice(
          barcodeOverride
            ? `No OpenFoodFacts entry matched EAN ${barcodeOverride}.`
            : "No matching OpenFoodFacts nutrition profile found."
        );
      } else {
        setProductData((prev) => ({
          ...prev,
          nutriScore: res.nutrition!.nutriScore,
          novaGroup: res.nutrition!.novaGroup,
          proteinPer100g: res.nutrition!.proteinPer100g,
          kcalPer100g: res.nutrition!.kcalPer100g,
          ean: res.nutrition!.ean,
          nutritionSource: res.nutrition!.nutritionSource,
          nutritionUpdatedAt: res.nutrition!.nutritionUpdatedAt,
        }));
        setEditNutriScore(res.nutrition.nutriScore || "");
        setEditNovaGroup(
          res.nutrition.novaGroup ? String(res.nutrition.novaGroup) : ""
        );
        setEditProtein(
          res.nutrition.proteinPer100g !== null
            ? String(res.nutrition.proteinPer100g)
            : ""
        );
        setEditKcal(
          res.nutrition.kcalPer100g !== null
            ? String(res.nutrition.kcalPer100g)
            : ""
        );
        setEditEan(res.nutrition.ean || "");
        setNutritionNotice(
          res.matchName
            ? `Updated from OpenFoodFacts: ${res.matchName}`
            : "Nutrition details updated from OpenFoodFacts."
        );
        router.refresh();
      }
    } catch {
      setNutritionNotice("Error contacting OpenFoodFacts.");
    } finally {
      setIsFetchingNutrition(false);
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
        setNormalizeError(res.error || "Failed to update pack sizes.");
      }
    } catch (err: unknown) {
      setNormalizeError(
        err instanceof Error ? err.message : "Error updating pack sizes."
      );
    } finally {
      setIsNormalizing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Utility Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/products"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>All products</span>
          </Link>

          {allProducts.length > 1 && (
            <select
              value={productData.slug}
              onChange={(e) => router.push(`/products/${e.target.value}`)}
              aria-label="Switch grocery item"
              className="h-9 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] max-w-[230px] cursor-pointer"
            >
              {allProducts.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.displayName}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div
            className="inline-flex items-center p-[3px] rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] gap-0.5"
            role="group"
            aria-label="Price display mode"
          >
            <button
              type="button"
              onClick={() => handlePriceModeChange("unit")}
              className={`h-[30px] px-3 rounded-full text-[13px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                priceMode === "unit"
                  ? "bg-[var(--bg-card)] text-[var(--text-primary)] font-semibold shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium"
              }`}
            >
              {unitNoun}
            </button>
            <button
              type="button"
              onClick={() => handlePriceModeChange("pack")}
              className={`h-[30px] px-3 rounded-full text-[13px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                priceMode === "pack"
                  ? "bg-[var(--bg-card)] text-[var(--text-primary)] font-semibold shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium"
              }`}
            >
              Per pack
            </button>
          </div>

          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                className="h-9 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                Edit item
              </button>
              <button
                type="button"
                onClick={() => setIsNormalizeModalOpen(true)}
                className="h-9 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                Pack sizes
              </button>
            </>
          )}
        </div>
      </div>

      {/* Direct Title Area & Nutrition Summary */}
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-[25px] sm:text-[30px] font-bold leading-tight text-[var(--text-primary)]">
            {productData.displayName}
          </h1>
          <p className="mt-1.5 text-[15px] text-[var(--text-muted)]">
            {productData.category}
            {productData.isStaple ? " · Everyday staple" : ""}
          </p>
        </div>

        {!NON_FOOD_CATEGORIES.has(productData.category) &&
          (() => {
            const nsBadge = getNutriScoreBadgeStyle(productData.nutriScore);
            const novaMeta = getNovaGroupMeta(productData.novaGroup);
            const cheapestNormalizedPrice =
              priceMode === "unit" && cheapestNow
                ? cheapestNow.currentPrice
                : null;
            const proteinPerEuro =
              cheapestNormalizedPrice !== null
                ? computeProteinPerEuro(
                    productData.proteinPer100g,
                    cheapestNormalizedPrice,
                    productData.baseUnit
                  )
                : null;
            const kcalPerEuro =
              cheapestNormalizedPrice !== null
                ? computeKcalPerEuro(
                    productData.kcalPer100g,
                    cheapestNormalizedPrice,
                    productData.baseUnit
                  )
                : null;
            const hasNutrition = Boolean(
              nsBadge ||
                novaMeta ||
                (productData.proteinPer100g !== null &&
                  productData.proteinPer100g !== undefined) ||
                (productData.kcalPer100g !== null &&
                  productData.kcalPer100g !== undefined)
            );

            if (!hasNutrition && !isAuthenticated) return null;

            return (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[var(--text-muted)]">
                    <Leaf className="w-4 h-4 text-[var(--primary)] shrink-0" />
                    <span>Nutrition</span>
                  </span>

                  {nsBadge && (
                    <span
                      className={`px-2.5 py-0.5 rounded-full border text-[13px] font-semibold whitespace-nowrap shrink-0 ${nsBadge.className}`}
                    >
                      Nutri-Score {nsBadge.letter}
                    </span>
                  )}

                  {novaMeta && (
                    <span
                      className={`px-2.5 py-0.5 rounded-full border text-[13px] font-semibold whitespace-nowrap shrink-0 ${novaMeta.className}`}
                      title={novaMeta.label}
                    >
                      {novaMeta.shortLabel}
                    </span>
                  )}

                  {productData.proteinPer100g !== null &&
                    productData.proteinPer100g !== undefined && (
                      <span className="px-2.5 py-0.5 rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] text-[13px] text-[var(--text-primary)] whitespace-nowrap shrink-0 tabular-nums">
                        Protein:{" "}
                        <strong>
                          {productData.proteinPer100g
                            .toFixed(1)
                            .replace(".", ",")}
                          g
                        </strong>
                        /100g
                      </span>
                    )}

                  {productData.kcalPer100g !== null &&
                    productData.kcalPer100g !== undefined && (
                      <span className="px-2.5 py-0.5 rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] text-[13px] text-[var(--text-muted)] whitespace-nowrap shrink-0 tabular-nums">
                        {Math.round(productData.kcalPer100g)} kcal/100g
                      </span>
                    )}

                  {proteinPerEuro !== null && (
                    <span className="px-2.5 py-0.5 rounded-full bg-[var(--positive-tint)] border border-[var(--positive)]/30 text-[13px] font-semibold text-[var(--positive)] whitespace-nowrap shrink-0 tabular-nums">
                      {proteinPerEuro.toFixed(1).replace(".", ",")} g protein / €
                      {kcalPerEuro ? ` · ${kcalPerEuro} kcal/€` : ""}
                    </span>
                  )}

                  {productData.ean && (
                    <span className="px-2.5 py-0.5 rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] text-[13px] text-[var(--text-muted)] whitespace-nowrap shrink-0 tabular-nums">
                      EAN {productData.ean}
                    </span>
                  )}

                  {!hasNutrition && (
                    <span className="text-[var(--text-muted)]">
                      No cached nutritional info yet.
                    </span>
                  )}
                </div>

                {isAuthenticated && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleFetchNutrition()}
                      disabled={isFetchingNutrition}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-[var(--border)] bg-[var(--bg-page)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 text-[var(--primary)] shrink-0 ${
                          isFetchingNutrition ? "animate-spin" : ""
                        }`}
                      />
                      <span>
                        {hasNutrition ? "Refresh nutrition" : "Fetch nutrition"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setBarcodeModalOpen(true)}
                      disabled={isFetchingNutrition}
                      title="Scan barcode or enter EAN to fetch OpenFoodFacts entry"
                      aria-label="Scan barcode for product nutrition"
                      className="w-8 h-8 rounded-full border border-[var(--border)] bg-[var(--bg-page)] hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--primary)] inline-flex items-center justify-center whitespace-nowrap shrink-0 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <ScanBarcode className="w-4 h-4 shrink-0" />
                    </button>
                  </div>
                )}

                {nutritionNotice && (
                  <div className="w-full text-[13px] text-[var(--text-muted)] pt-2 border-t border-[var(--border)]">
                    {nutritionNotice}
                  </div>
                )}
              </div>
            );
          })()}
      </div>

      <BarcodeScannerModal
        isOpen={barcodeModalOpen}
        onClose={() => setBarcodeModalOpen(false)}
        onDetected={(code) => {
          setBarcodeModalOpen(false);
          void handleFetchNutrition(code);
        }}
        title="Match product by barcode"
        subtitle="Look up exact nutrition details and pack size via OpenFoodFacts"
      />

      {/* 4-Column Flat Summary Strip */}
      <section
        aria-label="Price summary"
        className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] grid grid-cols-2 lg:grid-cols-4 py-4 sm:py-5"
      >
        <div className="px-4 sm:px-5 py-1">
          <div className="text-[13px] text-[var(--text-muted)]">
            Cheapest right now
          </div>
          <div className="font-display text-2xl font-bold tabular-nums text-[var(--text-primary)] mt-1">
            {cheapestNow ? formatValue(cheapestNow.currentPrice) : "—"}
          </div>
          {cheapestNow && (
            <div className="flex items-start gap-1.5 text-[13px] text-[var(--text-muted)] tabular-nums leading-snug mt-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                style={{
                  backgroundColor: getStoreBrand(
                    cheapestNow.storeName,
                    cheapestNow.storeBrandHex
                  ).color,
                }}
              />
              <span>
                {cheapestNow.storeName} ·{" "}
                <span className="sm:hidden">
                  {formatShortDate(cheapestNow.lastSeenDate)}
                </span>
                <span className="hidden sm:inline">
                  {formatDate(cheapestNow.lastSeenDate)}
                </span>
              </span>
            </div>
          )}
        </div>

        <div className="px-4 sm:px-5 py-1 border-l border-[var(--border)]">
          <div className="text-[13px] text-[var(--text-muted)]">
            Price change ({timeframe})
          </div>
          <div
            className={`font-display text-2xl font-bold tabular-nums mt-1 ${
              periodStats.hasHistory
                ? periodStats.changePercent < -0.05
                  ? "text-[var(--positive)]"
                  : periodStats.changePercent > 0.05
                    ? "text-[var(--negative)]"
                    : "text-[var(--text-primary)]"
                : "text-[var(--text-primary)]"
            }`}
          >
            {periodStats.hasHistory
              ? formatPercent(periodStats.changePercent)
              : formatValue(periodStats.newAvg)}
          </div>
          <div className="text-[13px] text-[var(--text-muted)] tabular-nums mt-1.5">
            {periodStats.hasHistory
              ? `${periodStats.changePercent <= 0 ? "Down from" : "Up from"} ${formatValue(periodStats.oldAvg)} (${formatShortDate(periodStats.oldDate)})`
              : "Single recorded trip"}
          </div>
        </div>

        <div className="px-4 sm:px-5 py-1 pt-4 lg:pt-1 border-t lg:border-t-0 lg:border-l border-[var(--border)]">
          <div className="text-[13px] text-[var(--text-muted)]">
            Low and high
          </div>
          <div className="font-display text-xl sm:text-2xl font-bold tabular-nums text-[var(--text-primary)] mt-1">
            {currentSightings.length > 0
              ? formatPriceRange(
                  allTimeStats.low,
                  allTimeStats.high,
                  priceMode,
                  productData.baseUnit
                )
              : "—"}
          </div>
          <div className="text-[13px] text-[var(--text-muted)] tabular-nums mt-1.5">
            {allTimeStats.lowDate && allTimeStats.highDate
              ? `${formatShortDate(allTimeStats.lowDate)} and ${formatShortDate(allTimeStats.highDate)}`
              : "No history yet"}
          </div>
        </div>

        <div className="px-4 sm:px-5 py-1 pt-4 lg:pt-1 border-t lg:border-t-0 border-l border-[var(--border)]">
          <div className="text-[13px] text-[var(--text-muted)]">
            Store difference
          </div>
          <div className="font-display text-2xl font-bold tabular-nums text-[var(--text-primary)] mt-1">
            {formatValue(storeSpread)}
          </div>
          <div className="text-[13px] text-[var(--text-muted)] leading-snug mt-1.5">
            {cheapestNow && mostExpensiveNow
              ? `Between ${cheapestNow.storeName} and ${mostExpensiveNow.storeName}`
              : cheapestNow
                ? `Only tracked at ${cheapestNow.storeName}`
                : "No stores yet"}
          </div>
        </div>
      </section>

      {/* Pack Size Reduction Alert (Shrinkflation) */}
      {shrinkflationIncidents.length > 0 && (
        <section className="space-y-3" aria-label="Pack size alerts">
          {shrinkflationIncidents.map((inc) => {
            const brand = getStoreBrand(inc.storeName, inc.storeHex);
            return (
              <div
                key={inc.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--accent-tint)] p-5 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold text-[15px] text-[var(--text-primary)]">
                    <AlertTriangle className="w-4 h-4 text-[var(--accent)] shrink-0" />
                    <span>Smaller pack size noticed</span>
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-muted)]">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: brand.color }}
                      />
                      <span>{inc.storeName}</span>
                    </span>
                  </div>
                  <span className="text-[13px] text-[var(--text-muted)] tabular-nums">
                    {formatDate(inc.date)}
                  </span>
                </div>
                <p className="text-[15px] text-[var(--text-primary)] leading-relaxed">
                  Pack size dropped from{" "}
                  <strong>
                    {formatMeasureText(inc.oldMeasure, inc.baseUnit)}
                  </strong>{" "}
                  to{" "}
                  <strong>
                    {formatMeasureText(inc.newMeasure, inc.baseUnit)}
                  </strong>{" "}
                  ({formatPercent(-inc.percentMeasureReduction)}) while the shelf
                  price went from {formatCurrency(inc.oldUnitPrice)} to{" "}
                  {formatCurrency(inc.newUnitPrice)}. That raises the unit price
                  from{" "}
                  <span className="tabular-nums">
                    {formatUnitPrice(inc.oldNormPrice, inc.baseUnit)}
                  </span>{" "}
                  to{" "}
                  <strong className="text-[var(--negative)] tabular-nums">
                    {formatUnitPrice(inc.newNormPrice, inc.baseUnit)} (
                    {formatPercent(inc.percentNormIncrease)})
                  </strong>
                  .
                </p>
              </div>
            );
          })}
        </section>
      )}

      {/* Interactive Multi-Store SVG Chart */}
      <section
        aria-labelledby="price-chart-heading"
        className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div>
            <h2
              id="price-chart-heading"
              className="font-display text-[18px] font-semibold text-[var(--text-primary)]"
            >
              Price over time
            </h2>
            <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
              Hover or tap any point to inspect the receipt price. Click a store
              below to highlight it.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div
              className="inline-flex items-center p-[3px] rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] gap-0.5"
              role="group"
              aria-label="Timeframe"
            >
              {(["6M", "1Y", "2Y", "All"] as Timeframe[]).map((tf) => (
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
              aria-label="Line style"
            >
              <button
                type="button"
                onClick={() => setChartCurve("step")}
                className={`h-[30px] px-3 rounded-full text-[13px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  chartCurve === "step"
                    ? "bg-[var(--bg-card)] text-[var(--text-primary)] font-semibold shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium"
                }`}
              >
                Step
              </button>
              <button
                type="button"
                onClick={() => setChartCurve("smooth")}
                className={`h-[30px] px-3 rounded-full text-[13px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  chartCurve === "smooth"
                    ? "bg-[var(--bg-card)] text-[var(--text-primary)] font-semibold shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium"
                }`}
              >
                Smooth
              </button>
            </div>
          </div>
        </div>

        {availableFormats.length >= 2 && (
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[13px] text-[var(--text-muted)]">
              Pack size:
            </span>
            <div
              className="inline-flex items-center p-[3px] rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] gap-0.5 flex-wrap"
              role="group"
              aria-label="Filter by pack size"
            >
              <button
                type="button"
                onClick={() => setSelectedFormat("all")}
                className={`h-[30px] px-3 rounded-full text-[13px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedFormat === "all"
                    ? "bg-[var(--bg-card)] text-[var(--text-primary)] font-semibold shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium"
                }`}
              >
                All sizes
              </button>
              {availableFormats.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => setSelectedFormat(f.label)}
                  className={`h-[30px] px-3 rounded-full text-[13px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedFormat === f.label
                      ? "bg-[var(--bg-card)] text-[var(--text-primary)] font-semibold shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium"
                  }`}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>
            {priceMode === "pack" && selectedFormat === "all" && (
              <span className="text-[13px] text-[var(--accent)] font-medium">
                Select a pack size to compare pack prices fairly
              </span>
            )}
          </div>
        )}

        <div
          className="relative w-full"
          onMouseLeave={() => setHoveredPoint(null)}
        >
          {chartModel.series.length === 0 ? (
            <div className="py-12 text-center text-[13px] text-[var(--text-muted)]">
              No prices recorded in this timeframe. Try choosing a longer range.
            </div>
          ) : (
            <div className="w-full overflow-x-auto no-scrollbar">
              <svg
                viewBox={`0 0 ${chartModel.width} ${chartModel.height}`}
                className="w-full min-w-[660px] h-[250px] block select-none overflow-visible"
                role="img"
                aria-label={`Price over time chart for ${productData.displayName}`}
              >
                {chartModel.yTicks.map((tk, i) => (
                  <g key={i}>
                    <line
                      x1={chartModel.padL}
                      y1={tk.y}
                      x2={chartModel.width - chartModel.padR}
                      y2={tk.y}
                      stroke="var(--border)"
                      strokeWidth="1"
                      strokeDasharray={i === 0 ? undefined : "3 3"}
                    />
                    <text
                      x={chartModel.padL - 10}
                      y={tk.y + 4}
                      textAnchor="end"
                      fill="var(--text-muted)"
                      fontSize="14"
                    >
                      {formatCurrency(tk.val)}
                    </text>
                  </g>
                ))}

                {chartModel.refLines.map((rl) => (
                  <line
                    key={rl.id}
                    x1={rl.x}
                    y1={chartModel.padT}
                    x2={rl.x}
                    y2={chartModel.height - chartModel.padB}
                    stroke="var(--accent)"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                ))}

                {chartModel.xDates.map((d, idx) => {
                  const anchor =
                    chartModel.xDates.length === 1
                      ? "middle"
                      : idx === 0
                        ? "start"
                        : idx === chartModel.xDates.length - 1
                          ? "end"
                          : "middle";
                  return (
                    <text
                      key={d.iso}
                      x={d.x}
                      y={chartModel.height - 10}
                      textAnchor={anchor}
                      fill="var(--text-muted)"
                      fontSize="14"
                    >
                      {d.label}
                    </text>
                  );
                })}

                {chartModel.series.map((s) => {
                  const dimmed =
                    isolatedStore !== null && isolatedStore !== s.storeName;
                  const opacity = dimmed ? 0.2 : 1;
                  return (
                    <g key={s.storeName} opacity={opacity}>
                      {s.path && (
                        <path
                          d={s.path}
                          fill="none"
                          stroke={s.color}
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                      {s.points.map((pt) => (
                        <g
                          key={pt.id}
                          tabIndex={0}
                          role="button"
                          aria-label={`${pt.storeName} on ${formatDate(pt.date)}: ${formatValue(pt.value)}`}
                          onMouseEnter={() => setHoveredPoint(pt)}
                          onFocus={() => setHoveredPoint(pt)}
                          onClick={() => setHoveredPoint(pt)}
                          className="cursor-pointer"
                        >
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r="14"
                            fill="transparent"
                          />
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r="5.5"
                            fill="var(--bg-card)"
                            stroke={s.color}
                            strokeWidth="2.6"
                          />
                        </g>
                      ))}
                    </g>
                  );
                })}
              </svg>
            </div>
          )}

          {hoveredPoint && (
            <div className="mt-3 sm:mt-0 sm:absolute sm:top-2 sm:right-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-card)] px-3.5 py-2.5 shadow-[var(--shadow-soft)] text-[13px] min-w-[190px] z-10">
              <div className="flex items-center justify-between gap-3 font-semibold text-[var(--text-primary)] mb-1">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: getStoreBrand(
                        hoveredPoint.storeName,
                        hoveredPoint.storeBrandHex
                      ).color,
                    }}
                  />
                  <span>{hoveredPoint.storeName}</span>
                </span>
                <span className="font-normal text-[var(--text-muted)] tabular-nums">
                  {formatDate(hoveredPoint.date)}
                </span>
              </div>
              <div className="font-bold text-[15px] tabular-nums text-[var(--text-primary)]">
                {formatValue(hoveredPoint.value)}
              </div>
              <div className="text-[var(--text-muted)] tabular-nums">
                Paid {formatCurrency(hoveredPoint.totalPrice)} for{" "}
                {formatLineMeasure(
                  hoveredPoint.unitMeasure,
                  hoveredPoint.quantity,
                  productData.baseUnit
                )}
              </div>
            </div>
          )}
        </div>

        {/* Store Legend */}
        {chartModel.series.length > 0 && (
          <div
            role="group"
            aria-label="Highlight supermarket series"
            className="flex items-center gap-2.5 flex-wrap pt-3 border-t border-[var(--border)]"
          >
            {chartModel.series.map((s) => {
              const isIso = isolatedStore === s.storeName;
              const isDim = isolatedStore !== null && !isIso;
              return (
                <button
                  key={s.storeName}
                  type="button"
                  aria-pressed={isIso}
                  onClick={() =>
                    setIsolatedStore((prev) =>
                      prev === s.storeName ? null : s.storeName
                    )
                  }
                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[13px] transition-colors cursor-pointer ${
                    isIso
                      ? "bg-[var(--bg-subtle)] border-[var(--border-strong)] font-semibold text-[var(--text-primary)]"
                      : "border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] font-medium"
                  } ${isDim ? "opacity-45" : ""}`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                  <span>{s.storeName}</span>
                </button>
              );
            })}
            {isolatedStore && (
              <button
                type="button"
                onClick={() => setIsolatedStore(null)}
                className="ml-auto text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Show all stores
              </button>
            )}
          </div>
        )}
      </section>

      {/* Where it's cheapest right now */}
      <section aria-labelledby="cheapest-stores-heading" className="space-y-3">
        <div>
          <h2
            id="cheapest-stores-heading"
            className="font-display text-[18px] font-semibold text-[var(--text-primary)]"
          >
            Where it&apos;s cheapest right now
          </h2>
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
            Ranked from lowest to highest based on your most recent receipt at
            each store.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] divide-y divide-[var(--border)]">
          {storeRankings.map((st, idx) => {
            const isFirst = idx === 0;
            const brand = getStoreBrand(st.storeName, st.storeBrandHex);
            return (
              <div
                key={st.storeName}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 px-5 py-4"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <span className="font-display text-[15px] font-bold text-[var(--text-muted)] w-6 shrink-0 tabular-nums pt-0.5">
                    #{idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: brand.color }}
                      />
                      <span className="font-semibold text-[15px] text-[var(--text-primary)]">
                        {st.storeName}
                      </span>
                      {isFirst && (
                        <span className="text-[13px] font-semibold text-[var(--positive)]">
                          · Best price
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] text-[var(--text-muted)] mt-0.5">
                      On receipt: &ldquo;{st.rawName}&rdquo; · Seen{" "}
                      {formatDate(st.lastSeenDate)}
                    </div>
                  </div>
                </div>

                <div className="sm:text-right pl-9 sm:pl-0 shrink-0">
                  <div
                    className={`font-display text-[19px] font-bold tabular-nums ${
                      isFirst
                        ? "text-[var(--positive)]"
                        : "text-[var(--text-primary)]"
                    }`}
                  >
                    {formatValue(st.currentPrice)}
                  </div>
                  <div className="text-[13px] text-[var(--text-muted)] tabular-nums">
                    {formatCurrency(st.totalPrice)} for{" "}
                    {formatLineMeasure(
                      st.unitMeasure,
                      st.quantity,
                      productData.baseUnit
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Receipt History (Desktop Table + Mobile Stacked Cards) */}
      <section aria-labelledby="receipt-history-heading" className="space-y-3">
        <div>
          <h2
            id="receipt-history-heading"
            className="font-display text-[18px] font-semibold text-[var(--text-primary)]"
          >
            Receipt history
          </h2>
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
            {currentSightings.length} recorded{" "}
            {currentSightings.length === 1 ? "purchase" : "purchases"}. Click
            any receipt number to view the full ticket.
          </p>
        </div>

        {deleteError && (
          <div className="rounded-xl bg-[var(--negative-tint)] border border-[var(--negative)] p-3 flex items-center gap-2 text-[var(--negative)] text-[13px]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{deleteError}</span>
          </div>
        )}

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-[13px] font-semibold text-[var(--text-muted)]">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Store</th>
                  <th className="py-3 px-4">Item on receipt</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Unit price</th>
                  <th className="py-3 px-4 text-right">Receipt</th>
                  {canDelete && (
                    <th className="py-3 px-4 text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] text-[15px]">
                {displayedTableSightings.map((s) => {
                  const brand = getStoreBrand(s.storeName, s.storeBrandHex);
                  return (
                    <tr
                      key={s.id}
                      className="hover:bg-[var(--bg-subtle)]/60 transition-colors"
                    >
                      <td className="py-3.5 px-4 tabular-nums whitespace-nowrap">
                        {formatDate(s.purchaseDate)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2 font-medium">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: brand.color }}
                          />
                          <span>{s.storeName}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-[13px] text-[var(--text-muted)] max-w-xs truncate">
                        {s.rawName}
                      </td>
                      <td className="py-3.5 px-4 tabular-nums whitespace-nowrap text-[13px]">
                        {formatLineMeasure(
                          s.unitMeasure,
                          s.quantity || 1,
                          s.baseUnit
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums whitespace-nowrap">
                        {formatCurrency(s.totalPrice)}
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums font-semibold whitespace-nowrap">
                        {formatUnitPrice(s.pricePerBaseUnit, s.baseUnit)}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <Link
                          href={`/receipts/${s.receiptId}/review`}
                          className="text-[13px] font-semibold text-[var(--primary)] hover:underline underline-offset-4 tabular-nums"
                        >
                          #{s.receiptId.slice(-6)}
                        </Link>
                      </td>
                      {canDelete && (
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {confirmDeleteId === s.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleDeleteSighting(s.id)}
                                disabled={deletingId === s.id}
                                className="h-7 px-2.5 rounded-full bg-[var(--negative)] text-[var(--negative-on)] text-[13px] font-semibold cursor-pointer"
                              >
                                {deletingId === s.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  "Remove"
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="h-7 px-2.5 rounded-full border border-[var(--border)] text-[13px] text-[var(--text-muted)] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditSighting(s)}
                                aria-label="Edit purchase"
                                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(s.id)}
                                aria-label="Remove purchase"
                                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--negative)] hover:bg-[var(--negative-tint)] cursor-pointer"
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

          {/* Mobile Stacked Cards */}
          <div className="md:hidden divide-y divide-[var(--border)]">
            {displayedTableSightings.map((s) => {
              const brand = getStoreBrand(s.storeName, s.storeBrandHex);
              return (
                <div key={s.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 font-semibold text-[15px]">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: brand.color }}
                      />
                      <span>{s.storeName}</span>
                    </span>
                    <span className="font-bold text-[15px] tabular-nums text-[var(--text-primary)]">
                      {formatUnitPrice(s.pricePerBaseUnit, s.baseUnit)}
                    </span>
                  </div>
                  <div className="text-[13px] text-[var(--text-muted)]">
                    &ldquo;{s.rawName}&rdquo;
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[13px] pt-1">
                    <span className="text-[var(--text-muted)] tabular-nums">
                      {formatDate(s.purchaseDate)} ·{" "}
                      {formatLineMeasure(
                        s.unitMeasure,
                        s.quantity || 1,
                        s.baseUnit
                      )}{" "}
                      · Paid {formatCurrency(s.totalPrice)}
                    </span>
                    <Link
                      href={`/receipts/${s.receiptId}/review`}
                      className="font-semibold text-[var(--primary)] tabular-nums shrink-0"
                    >
                      #{s.receiptId.slice(-6)}
                    </Link>
                  </div>
                  {canDelete && (
                    <div className="flex items-center gap-2 pt-2">
                      {confirmDeleteId === s.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDeleteSighting(s.id)}
                            disabled={deletingId === s.id}
                            className="h-8 px-3 rounded-full bg-[var(--negative)] text-[var(--negative-on)] text-[13px] font-semibold cursor-pointer"
                          >
                            Confirm remove
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="h-8 px-3 rounded-full border border-[var(--border)] text-[13px] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOpenEditSighting(s)}
                            className="h-8 px-3 rounded-full border border-[var(--border)] text-[13px] font-medium cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(s.id)}
                            className="h-8 px-3 rounded-full border border-[var(--border)] text-[var(--negative)] text-[13px] font-medium cursor-pointer"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Edit Product Modal */}
      {isEditModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-item-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--scrim)]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsEditModalOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="edit-item-title"
                  className="font-display text-[18px] font-semibold text-[var(--text-primary)]"
                >
                  Edit grocery item
                </h2>
                <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
                  Update how this item appears across your history and basket.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                aria-label="Close edit dialog"
                className="w-9 h-9 rounded-full border border-[var(--border)] inline-flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="p-3 rounded-xl bg-[var(--negative-tint)] text-[13px] text-[var(--negative)]">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div>
                <label
                  htmlFor="edit-item-name"
                  className="block text-[13px] font-semibold mb-1.5"
                >
                  Item name
                </label>
                <input
                  id="edit-item-name"
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="edit-item-cat"
                    className="block text-[13px] font-semibold mb-1.5"
                  >
                    Category
                  </label>
                  <select
                    id="edit-item-cat"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)]"
                  >
                    {CANONICAL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="block text-[13px] font-semibold mb-1.5">
                    Comparison unit
                  </span>
                  <div className="grid grid-cols-3 p-1 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] gap-1">
                    {(["KG", "L", "UNIT"] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setEditBaseUnit(u)}
                        className={`h-8 rounded-md text-[13px] font-semibold cursor-pointer ${
                          editBaseUnit === u
                            ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
                            : "text-[var(--text-muted)]"
                        }`}
                      >
                        {normalizeUnit(u)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-[13px] cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={editIsStaple}
                  onChange={(e) => setEditIsStaple(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span>Track as an everyday staple</span>
              </label>

              {/* Optional Cached Nutrition & Barcode Metadata */}
              <div className="pt-3 border-t border-[var(--border)] space-y-3">
                <div className="text-[13px] font-medium text-[var(--text-muted)]">
                  Nutrition &amp; barcode details (optional)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label
                      htmlFor="edit-item-nutri"
                      className="block text-[13px] text-[var(--text-muted)] mb-1"
                    >
                      Nutri-Score
                    </label>
                    <select
                      id="edit-item-nutri"
                      value={editNutriScore}
                      onChange={(e) => setEditNutriScore(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[13px] text-[var(--text-primary)]"
                    >
                      <option value="">—</option>
                      <option value="a">A</option>
                      <option value="b">B</option>
                      <option value="c">C</option>
                      <option value="d">D</option>
                      <option value="e">E</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="edit-item-nova"
                      className="block text-[13px] text-[var(--text-muted)] mb-1"
                    >
                      NOVA
                    </label>
                    <select
                      id="edit-item-nova"
                      value={editNovaGroup}
                      onChange={(e) => setEditNovaGroup(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[13px] text-[var(--text-primary)]"
                    >
                      <option value="">—</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="edit-item-prot"
                      className="block text-[13px] text-[var(--text-muted)] mb-1"
                    >
                      Protein/100g
                    </label>
                    <input
                      id="edit-item-prot"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={editProtein}
                      onChange={(e) => setEditProtein(e.target.value)}
                      placeholder="g"
                      className="w-full h-9 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[13px] tabular-nums text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="edit-item-kcal"
                      className="block text-[13px] text-[var(--text-muted)] mb-1"
                    >
                      kcal/100g
                    </label>
                    <input
                      id="edit-item-kcal"
                      type="number"
                      step="1"
                      min="0"
                      max="1000"
                      value={editKcal}
                      onChange={(e) => setEditKcal(e.target.value)}
                      placeholder="kcal"
                      className="w-full h-9 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[13px] tabular-nums text-[var(--text-primary)]"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="edit-item-ean"
                    className="block text-[13px] text-[var(--text-muted)] mb-1"
                  >
                    EAN / Barcode
                  </label>
                  <input
                    id="edit-item-ean"
                    type="text"
                    value={editEan}
                    onChange={(e) => setEditEan(e.target.value)}
                    placeholder="e.g. 8480000105302"
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[13px] tabular-nums text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={isSavingProduct}
                  className="h-9 px-4 rounded-full border border-[var(--border)] text-[13px] font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingProduct}
                  className="h-9 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  {isSavingProduct && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  <span>Save changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Normalize Pack Sizes Modal */}
      {isNormalizeModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="normalize-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--scrim)]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsNormalizeModalOpen(false);
          }}
        >
          <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-5 overflow-hidden">
            <div className="flex items-start justify-between gap-3 shrink-0">
              <div>
                <h2
                  id="normalize-title"
                  className="font-display text-[18px] font-semibold text-[var(--text-primary)]"
                >
                  Pack sizes and history
                </h2>
                <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
                  Update the unit or pack sizes to recalculate past unit prices.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsNormalizeModalOpen(false)}
                aria-label="Close pack sizes dialog"
                className="w-9 h-9 rounded-full border border-[var(--border)] inline-flex items-center justify-center hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {normalizeError && (
              <div className="p-3 rounded-xl bg-[var(--negative-tint)] text-[13px] text-[var(--negative)]">
                {normalizeError}
              </div>
            )}

            <form
              onSubmit={handleNormalizeHistory}
              className="space-y-4 overflow-y-auto pr-1"
            >
              <div className="rounded-xl bg-[var(--bg-subtle)] p-4 space-y-2">
                <span className="text-[13px] font-semibold block">
                  Comparison unit
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {(["KG", "L", "UNIT"] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setNormalizeBaseUnit(unit)}
                      className={`h-9 rounded-lg text-[13px] font-semibold cursor-pointer ${
                        normalizeBaseUnit === unit
                          ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm border border-[var(--border)]"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {unit === "KG"
                        ? "Per kg"
                        : unit === "L"
                          ? "Per litre"
                          : "Per unit"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-[13px] font-semibold">
                  Receipt names ({aliasFormats.length})
                </div>
                {aliasFormats.length === 0 ? (
                  <p className="text-[13px] text-[var(--text-muted)]">
                    No store receipt names linked yet.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
                    {aliasFormats.map((af, idx) => (
                      <div key={af.aliasId || idx} className="py-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-[13px]">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{
                                backgroundColor: getStoreBrand(
                                  af.storeName,
                                  af.storeBrandHex
                                ).color,
                              }}
                            />
                            <span className="font-semibold">
                              {af.storeName}
                            </span>
                            <span className="text-[var(--text-muted)]">
                              &ldquo;{af.rawAlias}&rdquo;
                            </span>
                          </div>
                          <label className="flex items-center gap-2 text-[13px] cursor-pointer">
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
                                          unitMeasurePerPack: checked
                                            ? null
                                            : item.unitMeasurePerPack,
                                        }
                                      : item
                                  )
                                );
                              }}
                            />
                            <span>Sold by counter weight</span>
                          </label>
                        </div>

                        {!af.isVariableWeight && (
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              step="0.001"
                              min="0.001"
                              value={af.unitMeasurePerPack ?? ""}
                              onChange={(e) => {
                                const val =
                                  e.target.value === ""
                                    ? null
                                    : parseFloat(e.target.value);
                                setAliasFormats((prev) =>
                                  prev.map((item, i) =>
                                    i === idx
                                      ? { ...item, unitMeasurePerPack: val }
                                      : item
                                  )
                                );
                              }}
                              placeholder={`Size in ${normalizeUnit(normalizeBaseUnit)}`}
                              className="w-40 h-9 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[13px] tabular-nums"
                            />
                            <span className="text-[13px] text-[var(--text-muted)]">
                              {af.unitMeasurePerPack
                                ? formatMeasureText(
                                    af.unitMeasurePerPack,
                                    normalizeBaseUnit
                                  )
                                : "No fixed pack size"}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsNormalizeModalOpen(false)}
                  disabled={isNormalizing}
                  className="h-9 px-4 rounded-full border border-[var(--border)] text-[13px] font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isNormalizing}
                  className="h-9 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  {isNormalizing && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  <span>Recalculate history</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Purchase Modal */}
      {editingSighting && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-purchase-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--scrim)]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingSighting(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="edit-purchase-title"
                  className="font-display text-[18px] font-semibold"
                >
                  Edit recorded purchase
                </h2>
                <p className="text-[13px] text-[var(--text-muted)]">
                  {editingSighting.storeName} ·{" "}
                  {formatDate(editingSighting.purchaseDate)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingSighting(null)}
                aria-label="Close purchase editor"
                className="w-9 h-9 rounded-full border border-[var(--border)] inline-flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {sightingSaveError && (
              <div className="p-3 rounded-xl bg-[var(--negative-tint)] text-[13px] text-[var(--negative)]">
                {sightingSaveError}
              </div>
            )}

            <form onSubmit={handleSaveSighting} className="space-y-3.5">
              <div>
                <label className="block text-[13px] font-semibold mb-1">
                  Receipt text
                </label>
                <input
                  type="text"
                  value={editSightingRawName}
                  onChange={(e) => setEditSightingRawName(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[13px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-semibold mb-1">
                    Pack price (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editSightingPrice}
                    onChange={(e) => setEditSightingPrice(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[13px] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-semibold mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    required
                    value={editSightingQty}
                    onChange={(e) => setEditSightingQty(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[13px] tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-semibold mb-1">
                    Total size ({normalizeUnit(editingSighting.baseUnit)})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    required
                    value={editSightingMeasure}
                    onChange={(e) => setEditSightingMeasure(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[13px] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-semibold mb-1">
                    Purchase date
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="DD/MM/YYYY"
                    value={editSightingDate}
                    onChange={(e) => setEditSightingDate(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[13px] tabular-nums"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingSighting(null)}
                  disabled={isSavingSighting}
                  className="h-9 px-4 rounded-full border border-[var(--border)] text-[13px] font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSighting}
                  className="h-9 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  {isSavingSighting && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  <span>Save</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
