"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Search,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  Plus,
  Loader2,
  Star,
  RotateCcw,
  ArrowRight,
  Wand2,
  ScanBarcode,
} from "lucide-react";
import {
  confirmReceiptAction,
  deleteReceiptAction,
  enrichReceiptItemsWithAIAction,
  reopenReceiptAction,
  type ReviewItemInput,
} from "./actions";
import type {
  CatalogLookupResult,
  ProductNutritionMeta,
} from "@/lib/catalog/parser";
import {
  getNovaGroupMeta,
  getNutriScoreBadgeStyle,
} from "@/lib/analytics/nutrition";
import { CANONICAL_CATEGORIES } from "@/lib/ai/schema";
import { ReceiptViewer } from "./receipt-viewer";
import { ProductSearchModal, type SearchedProduct } from "./product-search-modal";
import { BarcodeScannerModal } from "@/components/common/barcode-scanner-modal";
import {
  formatCurrency,
  formatUnitPrice,
  formatLineMeasure,
  formatDate,
  formatDateInputDDMMYYYY,
  parseDDMMYYYYToISO,
  normalizeUnit,
  getStoreBrand,
} from "@/lib/format";

export interface SerializedStore {
  id: string;
  name: string;
  brandHex: string;
  slug: string;
}

export interface SerializedProduct {
  id: string;
  displayName: string;
  category: string;
  baseUnit: "KG" | "L" | "UNIT";
  isStaple: boolean;
}

export interface SerializedReceiptItem {
  id: string;
  rawName: string;
  suggestedName: string;
  suggestedCat: string | null;
  matchConfidence: number;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  baseUnit: "KG" | "L" | "UNIT";
  unitMeasure: number;
  pricePerBaseUnit: number;
  isDiscount: boolean;
  excluded: boolean;
  confirmed: boolean;
  productId: string | null;
  product?: SerializedProduct | null;
}

export interface TaxBreakdownBracket {
  rate: number;
  baseAmount: number;
  taxAmount: number;
}

export interface SerializedReceipt {
  id: string;
  storeId: string;
  purchaseDate: string;
  totalAmount: number;
  status: "REVIEW" | "CONFIRMED";
  aiProvider: string | null;
  processingMs: number | null;
  sourceFile: string;
  hasOriginalPdf?: boolean;
  fileVersion?: string;
  isDigitalDia?: boolean;
  taxBreakdown?: TaxBreakdownBracket[] | null;
  store: SerializedStore;
  items: SerializedReceiptItem[];
}

interface ReviewWorkstationProps {
  receipt: SerializedReceipt;
  stores: SerializedStore[];
  currentUserRole?: string;
  nextPendingId?: string | null;
  pendingReviewCount?: number;
}

interface ExtendedItemState extends ReviewItemInput {
  localKey: string;
  isEditing: boolean;
  barcode?: string | null;
  nutrition?: ProductNutritionMeta | null;
  matchedProductInfo?: {
    id: string;
    displayName: string;
    category: string;
    baseUnit: "KG" | "L" | "UNIT";
    isStaple: boolean;
  } | null;
}

function recomputeItemMetrics(item: ExtendedItemState): ExtendedItemState {
  const safeQty = item.quantity > 0 ? item.quantity : 1;
  const safeMeasure = item.unitMeasure > 0 ? item.unitMeasure : 1;
  const safeTotal = Number.isFinite(item.totalPrice) ? item.totalPrice : 0;
  const unitPrice = Number((safeTotal / safeQty).toFixed(4));
  const pricePerBaseUnit = Number((safeTotal / safeMeasure).toFixed(4));
  return {
    ...item,
    unitPrice,
    pricePerBaseUnit,
  };
}

function buildInitialItems(
  rawItems: SerializedReceiptItem[]
): ExtendedItemState[] {
  return rawItems.map((it, idx) => ({
    localKey: it.id || `item-${idx}`,
    id: it.id,
    rawName: it.rawName,
    suggestedName: it.suggestedName,
    suggestedCat: it.suggestedCat || "Other",
    matchConfidence: it.matchConfidence ?? 0,
    mode: it.productId ? "link_existing" : "create_new",
    productId: it.productId ?? null,
    newProductName: it.product?.displayName || it.suggestedName,
    newProductCategory: it.product?.category || it.suggestedCat || "Other",
    newProductBaseUnit: it.product?.baseUnit || it.baseUnit || "UNIT",
    newProductIsStaple: Boolean(it.product?.isStaple),
    quantity: it.quantity || 1,
    unitPrice: it.unitPrice || 0,
    totalPrice: it.totalPrice || 0,
    baseUnit: it.baseUnit || "UNIT",
    unitMeasure: it.unitMeasure || 1,
    pricePerBaseUnit: it.pricePerBaseUnit || 0,
    isVariableWeight:
      it.baseUnit === "KG" &&
      it.unitMeasure > 0 &&
      Math.abs(it.unitMeasure - 1) > 0.001,
    isDiscount: Boolean(it.isDiscount),
    excluded: Boolean(it.excluded),
    isEditing: false,
    matchedProductInfo: it.product
      ? {
          id: it.product.id,
          displayName: it.product.displayName,
          category: it.product.category,
          baseUnit: it.product.baseUnit,
          isStaple: it.product.isStaple,
        }
      : null,
  }));
}

export function ReviewWorkstation({
  receipt,
  stores,
  nextPendingId = null,
}: ReviewWorkstationProps) {
  const router = useRouter();

  const [status, setStatus] = useState<"REVIEW" | "CONFIRMED">(receipt.status);
  const [storeId, setStoreId] = useState(receipt.storeId);
  const [dateInput, setDateInput] = useState(() =>
    formatDateInputDDMMYYYY(receipt.purchaseDate)
  );
  const [totalAmountInput, setTotalAmountInput] = useState(() =>
    receipt.totalAmount.toFixed(2)
  );
  const [items, setItems] = useState<ExtendedItemState[]>(() =>
    buildInitialItems(receipt.items)
  );

  const [showMobileViewer, setShowMobileViewer] = useState(false);

  useEffect(() => {
    if (!showMobileViewer) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowMobileViewer(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showMobileViewer]);
  const [showDiscountsSection, setShowDiscountsSection] = useState(false);
  const [searchModalKey, setSearchModalKey] = useState<string | null>(null);
  const [barcodeTargetKey, setBarcodeTargetKey] = useState<string | null>(null);

  const [isReopening, setIsReopening] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [actionBanner, setActionBanner] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);

  const [catalogResults, setCatalogResults] = useState<
    Record<
      string,
      { loading: boolean; result: CatalogLookupResult | null; error?: string }
    >
  >({});

  const isEditable = status === "REVIEW";

  const currentStore = useMemo(
    () => stores.find((s) => s.id === storeId) || receipt.store,
    [stores, storeId, receipt.store]
  );
  const brand = getStoreBrand(
    currentStore.slug || currentStore.name,
    currentStore.brandHex
  );

  const parsedDateISO = parseDDMMYYYYToISO(dateInput);
  const parsedTotalAmount = parseFloat(totalAmountInput.replace(",", ".")) || 0;

  const activeItems = useMemo(
    () => items.filter((it) => !it.excluded && !it.isDiscount),
    [items]
  );
  const pendingItems = useMemo(
    () =>
      activeItems.filter(
        (it) => !it.productId && it.matchConfidence < 0.72
      ),
    [activeItems]
  );
  const matchedItems = useMemo(
    () =>
      activeItems.filter(
        (it) => Boolean(it.productId) || it.matchConfidence >= 0.72
      ),
    [activeItems]
  );
  const discountAndExcludedItems = useMemo(
    () => items.filter((it) => it.isDiscount || it.excluded),
    [items]
  );

  const calculatedLineSum = useMemo(() => {
    return items
      .filter((it) => !it.excluded)
      .reduce((acc, it) => acc + (Number(it.totalPrice) || 0), 0);
  }, [items]);

  const totalDifference = Math.abs(calculatedLineSum - parsedTotalAmount);

  function updateItem(
    localKey: string,
    updater: (prev: ExtendedItemState) => ExtendedItemState
  ) {
    setItems((prev) =>
      prev.map((it) => (it.localKey === localKey ? updater(it) : it))
    );
  }

  function handleSelectProduct(product: SearchedProduct) {
    if (!searchModalKey) return;
    updateItem(searchModalKey, (it) => {
      const next: ExtendedItemState = {
        ...it,
        mode: "link_existing",
        productId: product.id,
        suggestedName: product.displayName,
        suggestedCat: product.category,
        baseUnit: product.baseUnit,
        matchConfidence: 1,
        matchedProductInfo: {
          id: product.id,
          displayName: product.displayName,
          category: product.category,
          baseUnit: product.baseUnit,
          isStaple: Boolean(product.isStaple),
        },
      };
      return recomputeItemMetrics(next);
    });
    setSearchModalKey(null);
  }

  function handleSwitchToCreateNew(localKey?: string) {
    const key = localKey || searchModalKey;
    if (!key) return;
    updateItem(key, (it) => ({
      ...it,
      mode: "create_new",
      productId: null,
      matchedProductInfo: null,
      newProductName: it.newProductName || it.suggestedName || it.rawName,
      newProductCategory: it.newProductCategory || it.suggestedCat || "Other",
      newProductBaseUnit: it.newProductBaseUnit || it.baseUnit || "UNIT",
      isEditing: true,
    }));
    if (searchModalKey) setSearchModalKey(null);
  }

  function handleAddEmptyItem() {
    const newKey = `manual-${Date.now()}`;
    setItems((prev) => [
      {
        localKey: newKey,
        rawName: "Manual item",
        suggestedName: "New grocery item",
        suggestedCat: "Other",
        matchConfidence: 1,
        mode: "create_new",
        productId: null,
        newProductName: "New grocery item",
        newProductCategory: "Other",
        newProductBaseUnit: "UNIT",
        newProductIsStaple: false,
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        baseUnit: "UNIT",
        unitMeasure: 1,
        pricePerBaseUnit: 0,
        isDiscount: false,
        excluded: false,
        isEditing: true,
        matchedProductInfo: null,
      },
      ...prev,
    ]);
  }

  async function handleCatalogLookup(item: ExtendedItemState) {
    const query =
      item.newProductName || item.suggestedName || item.rawName || "";
    if (!query.trim()) return;

    setCatalogResults((prev) => ({
      ...prev,
      [item.localKey]: { loading: true, result: null },
    }));

    try {
      const res = await fetch(
        `/api/catalog/lookup?q=${encodeURIComponent(
          query.trim()
        )}&store=${encodeURIComponent(currentStore.name)}`
      );
      if (!res.ok) {
        setCatalogResults((prev) => ({
          ...prev,
          [item.localKey]: {
            loading: false,
            result: null,
            error: "No pack match found in product directory.",
          },
        }));
        return;
      }
      const data = await res.json();
      if (!data?.result) {
        setCatalogResults((prev) => ({
          ...prev,
          [item.localKey]: {
            loading: false,
            result: null,
            error: "No pack size entry matched.",
          },
        }));
        return;
      }
      setCatalogResults((prev) => ({
        ...prev,
        [item.localKey]: { loading: false, result: data.result },
      }));
    } catch {
      setCatalogResults((prev) => ({
        ...prev,
        [item.localKey]: {
          loading: false,
          result: null,
          error: "Could not look up pack size right now.",
        },
      }));
    }
  }

  function handleApplyBarcodeFromModal(match: CatalogLookupResult) {
    if (!searchModalKey) return;
    updateItem(searchModalKey, (it) => {
      const isLinked =
        it.mode === "link_existing" && Boolean(it.matchedProductInfo);
      const qty = Math.max(Number(it.quantity) || 1, 1);
      const nextBaseUnit =
        isLinked && it.matchedProductInfo
          ? it.matchedProductInfo.baseUnit
          : match.hasParsedQuantity !== false
          ? match.baseUnit
          : it.baseUnit;
      const nextUnitMeasure =
        match.hasParsedQuantity !== false && match.unitMeasurePerPack > 0
          ? Number((qty * match.unitMeasurePerPack).toFixed(3))
          : it.unitMeasure;
      return recomputeItemMetrics({
        ...it,
        suggestedName: match.productName || it.suggestedName,
        ...(isLinked
          ? {}
          : {
              newProductName: match.productName || it.newProductName,
              newProductBaseUnit: nextBaseUnit,
            }),
        baseUnit: nextBaseUnit,
        unitMeasure: nextUnitMeasure,
        isVariableWeight: false,
        barcode: match.ean || match.nutrition?.ean || it.barcode || null,
        nutrition: match.nutrition || it.nutrition || null,
      });
    });
    setSearchModalKey(null);
  }

  async function handleBarcodeLookupForItem(localKey: string, ean: string) {
    const targetItem = items.find((i) => i.localKey === localKey);
    if (!targetItem) return;

    setCatalogResults((prev) => ({
      ...prev,
      [localKey]: { loading: true, result: null },
    }));

    try {
      const res = await fetch(
        `/api/catalog/lookup?barcode=${encodeURIComponent(ean)}`
      );
      if (!res.ok) {
        setCatalogResults((prev) => ({
          ...prev,
          [localKey]: {
            loading: false,
            result: null,
            error: "Could not look up that barcode right now.",
          },
        }));
        return;
      }

      const data = await res.json();
      const offMatch = (data.offMatch as CatalogLookupResult | null) || null;
      const qty = Math.max(Number(targetItem.quantity) || 1, 1);

      if (data.localProduct) {
        const lp = data.localProduct;
        const measure =
          offMatch &&
          offMatch.hasParsedQuantity !== false &&
          offMatch.unitMeasurePerPack > 0
            ? Number((qty * offMatch.unitMeasurePerPack).toFixed(3))
            : targetItem.unitMeasure;

        updateItem(localKey, (prev) =>
          recomputeItemMetrics({
            ...prev,
            mode: "link_existing",
            productId: lp.id,
            suggestedName: lp.displayName,
            suggestedCat: lp.category,
            matchConfidence: 1,
            baseUnit: lp.baseUnit,
            unitMeasure: measure,
            matchedProductInfo: {
              id: lp.id,
              displayName: lp.displayName,
              category: lp.category,
              baseUnit: lp.baseUnit,
              isStaple: Boolean(lp.isStaple),
            },
            barcode: ean,
            nutrition: offMatch?.nutrition || null,
          })
        );
        setCatalogResults((prev) => ({
          ...prev,
          [localKey]: { loading: false, result: offMatch },
        }));
      } else if (offMatch) {
        setCatalogResults((prev) => ({
          ...prev,
          [localKey]: { loading: false, result: offMatch },
        }));
      } else {
        setCatalogResults((prev) => ({
          ...prev,
          [localKey]: {
            loading: false,
            result: null,
            error: `No product found for barcode ${ean}.`,
          },
        }));
      }
    } catch {
      setCatalogResults((prev) => ({
        ...prev,
        [localKey]: {
          loading: false,
          result: null,
          error: "Could not look up that barcode right now.",
        },
      }));
    }
  }

  async function handleReopenReceipt() {
    setIsReopening(true);
    setActionBanner(null);
    try {
      const res = await reopenReceiptAction(receipt.id);
      if (!res.success) {
        setActionBanner({
          tone: "error",
          text: res.error || "Could not unlock receipt for editing.",
        });
        return;
      }
      setStatus("REVIEW");
      setActionBanner({
        tone: "success",
        text: "Receipt unlocked. Make your edits and confirm when finished.",
      });
      router.refresh();
    } catch {
      setActionBanner({
        tone: "error",
        text: "Could not unlock receipt for editing.",
      });
    } finally {
      setIsReopening(false);
    }
  }

  async function handleEnrichWithAI() {
    setIsEnriching(true);
    setActionBanner(null);
    try {
      const res = await enrichReceiptItemsWithAIAction(receipt.id);
      if (!res.success) {
        setActionBanner({
          tone: "error",
          text: res.error || "Could not improve item names right now.",
        });
        return;
      }

      if (Array.isArray(res.updatedItems)) {
        const patchMap = new Map(res.updatedItems.map((p) => [p.id, p]));
        setItems((prev) =>
          prev.map((it) => {
            if (!it.id) return it;
            const patch = patchMap.get(it.id);
            if (!patch) return it;
            return {
              ...it,
              suggestedName: patch.suggestedName,
              suggestedCat: patch.suggestedCat || it.suggestedCat,
              matchConfidence: patch.matchConfidence,
              mode: patch.productId ? "link_existing" : "create_new",
              productId: patch.productId,
              newProductName:
                patch.product?.displayName || patch.suggestedName,
              newProductCategory:
                patch.product?.category ||
                patch.suggestedCat ||
                it.suggestedCat ||
                "Other",
              newProductBaseUnit: patch.product?.baseUnit || patch.baseUnit,
              newProductIsStaple: Boolean(patch.product?.isStaple),
              baseUnit: patch.baseUnit,
              unitMeasure: patch.unitMeasure,
              pricePerBaseUnit: patch.pricePerBaseUnit,
              excluded: patch.excluded,
              matchedProductInfo: patch.product || null,
            };
          })
        );
      }

      setActionBanner({
        tone: "success",
        text:
          res.message ||
          "Cleaned up item names and matched household staples.",
      });
      router.refresh();
    } catch {
      setActionBanner({
        tone: "error",
        text: "Could not clean up item names right now.",
      });
    } finally {
      setIsEnriching(false);
    }
  }

  async function handleConfirmReceipt(goToNextAfter: boolean) {
    if (!parsedDateISO) {
      setActionBanner({
        tone: "error",
        text: "Please enter a valid purchase date in DD/MM/YYYY format.",
      });
      return;
    }

    setIsConfirming(true);
    setActionBanner(null);

    try {
      const serializedItems: ReviewItemInput[] = items.map((it) => ({
        id: it.id,
        rawName: it.rawName,
        suggestedName:
          it.matchedProductInfo?.displayName ||
          it.newProductName ||
          it.suggestedName ||
          it.rawName,
        suggestedCat: it.suggestedCat || "Other",
        matchConfidence: it.matchConfidence,
        mode: it.productId ? "link_existing" : "create_new",
        productId: it.productId || null,
        newProductName:
          it.newProductName || it.suggestedName || it.rawName,
        newProductCategory:
          it.newProductCategory || it.suggestedCat || "Other",
        newProductBaseUnit: it.newProductBaseUnit || it.baseUnit,
        newProductIsStaple: Boolean(it.newProductIsStaple),
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        totalPrice: it.totalPrice,
        baseUnit: it.baseUnit,
        unitMeasure: it.unitMeasure,
        pricePerBaseUnit: it.pricePerBaseUnit,
        isVariableWeight: Boolean(it.isVariableWeight),
        isDiscount: Boolean(it.isDiscount),
        excluded: Boolean(it.excluded),
        barcode: it.barcode || null,
        nutrition: it.nutrition || null,
      }));

      const res = await confirmReceiptAction({
        receiptId: receipt.id,
        storeId,
        purchaseDate: parsedDateISO,
        totalAmount: parsedTotalAmount,
        items: serializedItems,
      });

      if (!res.success) {
        setActionBanner({
          tone: "error",
          text: res.error || "Could not save and confirm receipt.",
        });
        setIsConfirming(false);
        return;
      }

      setStatus("CONFIRMED");
      setItems((prev) => prev.map((it) => ({ ...it, isEditing: false })));
      setActionBanner({
        tone: "success",
        text: "Receipt confirmed and added to your household price tracker.",
      });

      if (goToNextAfter && nextPendingId) {
        router.push(`/receipts/${nextPendingId}/review`);
      } else {
        router.refresh();
      }
    } catch {
      setActionBanner({
        tone: "error",
        text: "Something went wrong while saving. Please try again.",
      });
    } finally {
      setIsConfirming(false);
    }
  }

  async function handleDeleteReceipt() {
    setIsDeleting(true);
    try {
      const res = await deleteReceiptAction(receipt.id);
      if (!res.success) {
        setActionBanner({
          tone: "error",
          text: res.error || "Could not delete this receipt.",
        });
        setIsDeleting(false);
        return;
      }
      router.push("/my-receipts");
      router.refresh();
    } catch {
      setActionBanner({
        tone: "error",
        text: "Could not delete this receipt.",
      });
      setIsDeleting(false);
    }
  }

  const activeModalItem = useMemo(
    () => items.find((it) => it.localKey === searchModalKey) ?? null,
    [items, searchModalKey]
  );

  return (
    <div className="space-y-5">
      {/* Top Receipt Header Card */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <span
            className="w-11 h-11 rounded-xl flex items-center justify-center text-[14px] font-bold shrink-0"
            style={{ backgroundColor: brand.color, color: brand.fg }}
          >
            {brand.monogram}
          </span>
          <div className="min-w-0 space-y-0.5">
            <h1 className="font-display font-bold text-[24px] sm:text-[28px] leading-tight text-[var(--text-primary)] truncate">
              {currentStore.name} receipt
            </h1>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[13px] text-[var(--text-muted)] tabular-nums">
              <span>{parsedDateISO ? formatDate(parsedDateISO) : dateInput}</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-[var(--text-primary)]">
                {formatCurrency(parsedTotalAmount)}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {activeItems.length}{" "}
                {activeItems.length === 1 ? "item" : "items"}
              </span>
              <span aria-hidden="true">·</span>
              {status === "CONFIRMED" ? (
                <span className="inline-flex items-center gap-1 text-[var(--positive)] font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Confirmed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[var(--accent)] font-medium">
                  Needs review
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowMobileViewer(true)}
            className="lg:hidden h-9 px-3.5 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] text-[13px] font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Eye className="w-4 h-4 text-[var(--text-muted)]" />
            Show original receipt
          </button>

          {isEditable ? (
            <button
              type="button"
              disabled={isEnriching}
              onClick={handleEnrichWithAI}
              className="h-9 px-3.5 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)] text-[13px] font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {isEnriching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--primary)]" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-[var(--primary)]" />
              )}
              Improve item names
            </button>
          ) : (
            <button
              type="button"
              disabled={isReopening}
              onClick={handleReopenReceipt}
              className="h-9 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)] text-[13px] font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {isReopening ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Pencil className="w-3.5 h-3.5" />
              )}
              Edit receipt
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowDeleteConfirm((prev) => !prev)}
            className="h-9 px-3.5 rounded-full text-[13px] font-medium text-[var(--negative)] hover:bg-[var(--negative-tint)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>

      {/* Inline Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="rounded-2xl border border-[var(--negative)]/30 bg-[var(--negative-tint)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[14px] text-[var(--text-primary)]">
            Delete this {currentStore.name} receipt and remove all prices from
            your tracker?
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDeleteReceipt}
              className="h-9 px-4 rounded-full bg-[var(--negative)] text-[var(--negative-on)] text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Yes, delete receipt
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setShowDeleteConfirm(false)}
              className="h-9 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action Feedback Banner */}
      {actionBanner && (
        <div
          role={actionBanner.tone === "error" ? "alert" : "status"}
          className={`rounded-2xl border px-4 py-3 flex items-center gap-2.5 text-[13px] ${
            actionBanner.tone === "error"
              ? "border-[var(--negative)]/30 bg-[var(--negative-tint)] text-[var(--negative)]"
              : "border-[var(--positive)]/30 bg-[var(--positive-tint)] text-[var(--positive)]"
          }`}
        >
          {actionBanner.tone === "error" ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span>{actionBanner.text}</span>
        </div>
      )}

      {/* Main Split Workstation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Desktop Sticky Receipt Viewer */}
        <div className="hidden lg:block lg:col-span-5 lg:sticky lg:top-24">
          <ReceiptViewer
            receiptId={receipt.id}
            sourceFile={receipt.sourceFile}
            hasOriginalPdf={receipt.hasOriginalPdf}
            fileVersion={receipt.fileVersion}
            isDigitalDia={receipt.isDigitalDia}
          />
        </div>

        {/* Checklist & Editor Column */}
        <div className="lg:col-span-7 space-y-5">
          {/* Receipt Store / Date / Total Edit Fields */}
          {isEditable && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="review-store"
                  className="block text-[13px] font-medium text-[var(--text-muted)]"
                >
                  Supermarket
                </label>
                <select
                  id="review-store"
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] text-[var(--text-primary)] focus:outline-none"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="review-date"
                  className="block text-[13px] font-medium text-[var(--text-muted)]"
                >
                  Purchase date
                </label>
                <input
                  id="review-date"
                  type="text"
                  inputMode="numeric"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  placeholder="DD/MM/YYYY"
                  className={`w-full h-10 px-3 rounded-xl bg-[var(--bg-page)] border text-[14px] tabular-nums text-[var(--text-primary)] focus:outline-none ${
                    !parsedDateISO
                      ? "border-[var(--negative)]"
                      : "border-[var(--border)] focus:border-[var(--primary)]"
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="review-total"
                  className="block text-[13px] font-medium text-[var(--text-muted)]"
                >
                  Total paid (€)
                </label>
                <input
                  id="review-total"
                  type="number"
                  step="0.01"
                  value={totalAmountInput}
                  onChange={(e) => setTotalAmountInput(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] tabular-nums text-[var(--text-primary)] focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Compact 1-Line Status Strip (Replaces Empty Yellow Box) */}
          {pendingItems.length > 0 && isEditable ? (
            <div className="rounded-xl border border-[var(--accent)]/35 bg-[var(--accent-tint)] px-4 py-2.5 flex items-center justify-between gap-2 text-[13px] text-[var(--text-primary)]">
              <span className="font-medium">
                {pendingItems.length}{" "}
                {pendingItems.length === 1 ? "item needs" : "items need"} a quick
                check ({matchedItems.length} already matched)
              </span>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--positive)]/30 bg-[var(--positive-tint)] px-4 py-2.5 flex items-center gap-2 text-[13px] text-[var(--positive)] font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                All {activeItems.length}{" "}
                {activeItems.length === 1 ? "item" : "items"} matched and priced
              </span>
            </div>
          )}

          {/* Items Checklist */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3 px-1">
              <h2 className="font-display font-semibold text-[18px] text-[var(--text-primary)]">
                Receipt items
              </h2>
              {isEditable && (
                <button
                  type="button"
                  onClick={handleAddEmptyItem}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--primary)] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add item
                </button>
              )}
            </div>

            {activeItems.length === 0 ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-5 py-10 text-center space-y-2">
                <p className="text-[14px] font-medium text-[var(--text-primary)]">
                  No active items on this receipt
                </p>
                {isEditable && (
                  <button
                    type="button"
                    onClick={handleAddEmptyItem}
                    className="h-9 px-4 rounded-full bg-[var(--primary)] text-[var(--primary-on)] text-[13px] font-semibold cursor-pointer"
                  >
                    Add first item
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] divide-y divide-[var(--border)] overflow-hidden">
                {[...pendingItems, ...matchedItems].map((item) => {
                  const needsCheck =
                    !item.productId && item.matchConfidence < 0.72;
                  const resolvedTitle =
                    item.matchedProductInfo?.displayName ||
                    item.newProductName ||
                    item.suggestedName ||
                    item.rawName;
                  const resolvedCategory =
                    item.matchedProductInfo?.category ||
                    item.newProductCategory ||
                    item.suggestedCat ||
                    "Other";
                  const resolvedStaple =
                    item.matchedProductInfo?.isStaple ??
                    Boolean(item.newProductIsStaple);
                  const lookupState = catalogResults[item.localKey];

                  return (
                    <div
                      key={item.localKey}
                      className={
                        needsCheck && isEditable
                          ? "border-l-[3px] border-l-[var(--accent)]"
                          : ""
                      }
                    >
                      <div className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0 space-y-1 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            {resolvedStaple && (
                              <Star
                                className="w-3.5 h-3.5 text-[var(--accent)] fill-current shrink-0"
                                aria-label="Household staple"
                              />
                            )}
                            <span className="font-semibold text-[15px] text-[var(--text-primary)] truncate">
                              {resolvedTitle}
                            </span>
                            <span className="text-[13px] text-[var(--text-muted)]">
                              · {resolvedCategory}
                            </span>
                          </div>

                          <div className="text-[13px] text-[var(--text-muted)] tabular-nums truncate">
                            {item.rawName !== resolvedTitle
                              ? `${item.rawName} · `
                              : ""}
                            {formatLineMeasure(
                              item.unitMeasure,
                              item.quantity,
                              item.baseUnit
                            )}
                            {" · "}
                            {formatUnitPrice(
                              item.pricePerBaseUnit,
                              item.baseUnit
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                          <span className="font-semibold text-[15px] tabular-nums text-[var(--text-primary)]">
                            {formatCurrency(item.totalPrice)}
                          </span>

                          {isEditable && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setSearchModalKey(item.localKey)}
                                title="Match to another pantry product"
                                className="h-8 px-2.5 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)] text-[13px] font-medium text-[var(--text-primary)] inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <Search className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                Match
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateItem(item.localKey, (prev) => ({
                                    ...prev,
                                    isEditing: !prev.isEditing,
                                  }))
                                }
                                className={`h-8 px-2.5 rounded-full border text-[13px] font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                                  item.isEditing
                                    ? "border-[var(--primary)] bg-[var(--primary-tint)] text-[var(--primary)]"
                                    : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                }`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                {item.isEditing ? "Done" : "Edit"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateItem(item.localKey, (prev) => ({
                                    ...prev,
                                    excluded: true,
                                    isEditing: false,
                                  }))
                                }
                                title="Exclude from grocery prices"
                                aria-label={`Exclude ${resolvedTitle}`}
                                className="w-8 h-8 rounded-full hover:bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--negative)] cursor-pointer"
                              >
                                <EyeOff className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Inline Row Editor */}
                      {isEditable && item.isEditing && (
                        <div className="px-4 py-4 bg-[var(--bg-subtle)]/70 border-t border-[var(--border)] space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="block text-[13px] font-medium text-[var(--text-muted)]">
                                {item.productId
                                  ? "Matched product"
                                  : "Product name"}
                              </label>
                              {item.productId ? (
                                <div className="h-10 px-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] flex items-center justify-between gap-2 text-[14px]">
                                  <span className="truncate font-medium text-[var(--text-primary)]">
                                    {item.matchedProductInfo?.displayName ||
                                      item.suggestedName}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleSwitchToCreateNew(item.localKey)
                                    }
                                    className="text-[13px] font-medium text-[var(--primary)] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                                  >
                                    New instead
                                  </button>
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  value={
                                    item.newProductName ?? item.suggestedName
                                  }
                                  onChange={(e) =>
                                    updateItem(item.localKey, (prev) => ({
                                      ...prev,
                                      newProductName: e.target.value,
                                      suggestedName: e.target.value,
                                    }))
                                  }
                                  className="w-full h-10 px-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] text-[var(--text-primary)] focus:outline-none"
                                />
                              )}
                            </div>

                            <div className="space-y-1">
                              <label className="block text-[13px] font-medium text-[var(--text-muted)]">
                                Category
                              </label>
                              <select
                                disabled={Boolean(item.productId)}
                                value={
                                  item.newProductCategory ||
                                  item.suggestedCat ||
                                  "Other"
                                }
                                onChange={(e) =>
                                  updateItem(item.localKey, (prev) => ({
                                    ...prev,
                                    newProductCategory: e.target.value,
                                    suggestedCat: e.target.value,
                                  }))
                                }
                                className="w-full h-10 px-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] text-[var(--text-primary)] focus:outline-none disabled:opacity-60"
                              >
                                {CANONICAL_CATEGORIES.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="space-y-1">
                              <label className="block text-[13px] font-medium text-[var(--text-muted)]">
                                Quantity
                              </label>
                              <input
                                type="number"
                                step="any"
                                min="0.01"
                                value={item.quantity}
                                onChange={(e) => {
                                  const qty =
                                    parseFloat(e.target.value) || 0;
                                  updateItem(item.localKey, (prev) =>
                                    recomputeItemMetrics({
                                      ...prev,
                                      quantity: qty > 0 ? qty : 1,
                                    })
                                  );
                                }}
                                className="w-full h-10 px-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] tabular-nums text-[var(--text-primary)] focus:outline-none"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="block text-[13px] font-medium text-[var(--text-muted)]">
                                Total size ({normalizeUnit(item.baseUnit)})
                              </label>
                              <input
                                type="number"
                                step="any"
                                min="0.001"
                                value={item.unitMeasure}
                                onChange={(e) => {
                                  const measure =
                                    parseFloat(e.target.value) || 0;
                                  updateItem(item.localKey, (prev) =>
                                    recomputeItemMetrics({
                                      ...prev,
                                      unitMeasure: measure > 0 ? measure : 1,
                                    })
                                  );
                                }}
                                className="w-full h-10 px-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] tabular-nums text-[var(--text-primary)] focus:outline-none"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="block text-[13px] font-medium text-[var(--text-muted)]">
                                Tracked unit
                              </label>
                              <select
                                disabled={Boolean(item.productId)}
                                value={item.baseUnit}
                                onChange={(e) => {
                                  const bu = e.target.value as
                                    | "KG"
                                    | "L"
                                    | "UNIT";
                                  updateItem(item.localKey, (prev) =>
                                    recomputeItemMetrics({
                                      ...prev,
                                      baseUnit: bu,
                                      newProductBaseUnit: bu,
                                    })
                                  );
                                }}
                                className="w-full h-10 px-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] text-[var(--text-primary)] focus:outline-none disabled:opacity-60"
                              >
                                <option value="KG">Per kg</option>
                                <option value="L">Per L</option>
                                <option value="UNIT">Per unit</option>
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="block text-[13px] font-medium text-[var(--text-muted)]">
                                Line total (€)
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={item.totalPrice}
                                onChange={(e) => {
                                  const total =
                                    parseFloat(e.target.value) || 0;
                                  updateItem(item.localKey, (prev) =>
                                    recomputeItemMetrics({
                                      ...prev,
                                      totalPrice: total,
                                    })
                                  );
                                }}
                                className="w-full h-10 px-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] tabular-nums text-[var(--text-primary)] focus:outline-none"
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                            {!item.productId ? (
                              <label className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--text-primary)] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(item.newProductIsStaple)}
                                  onChange={(e) =>
                                    updateItem(item.localKey, (prev) => ({
                                      ...prev,
                                      newProductIsStaple: e.target.checked,
                                    }))
                                  }
                                  className="w-4 h-4 rounded accent-[var(--primary)]"
                                />
                                Mark as household staple
                              </label>
                            ) : (
                              <span className="text-[13px] text-[var(--text-muted)]">
                                Unit price updates automatically:{" "}
                                <strong className="text-[var(--text-primary)] tabular-nums">
                                  {formatUnitPrice(
                                    item.pricePerBaseUnit,
                                    item.baseUnit
                                  )}
                                </strong>
                              </span>
                            )}

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleCatalogLookup(item)}
                                disabled={lookupState?.loading}
                                className="h-8 px-3 rounded-full border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-strong)] text-[13px] font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                {lookupState?.loading ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Wand2 className="w-3.5 h-3.5 text-[var(--primary)]" />
                                )}
                                Look up pack size
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setBarcodeTargetKey(item.localKey)
                                }
                                disabled={lookupState?.loading}
                                title="Secondary barcode / EAN lookup"
                                aria-label="Scan barcode for item"
                                className="w-8 h-8 rounded-full border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--primary)] inline-flex items-center justify-center shrink-0 cursor-pointer"
                              >
                                <ScanBarcode className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {lookupState?.error && (
                            <p className="text-[13px] text-[var(--text-muted)]">
                              {lookupState.error}
                            </p>
                          )}

                          {lookupState?.result && (
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 flex flex-wrap items-center justify-between gap-3 text-[13px]">
                              <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-[var(--text-primary)]">
                                  {lookupState.result.productName}
                                </span>
                                <span className="text-[var(--text-muted)]">
                                  ·{" "}
                                  {lookupState.result.brand
                                    ? `${lookupState.result.brand} · `
                                    : ""}
                                  {lookupState.result.rawQuantityText ||
                                    "Unknown size"}
                                  {lookupState.result.unitMeasurePerPack > 0
                                    ? ` (${lookupState.result.unitMeasurePerPack} ${normalizeUnit(lookupState.result.baseUnit)})`
                                    : ""}
                                </span>
                                {(() => {
                                  const ns = getNutriScoreBadgeStyle(
                                    lookupState.result.nutrition?.nutriScore
                                  );
                                  return ns ? (
                                    <span
                                      className={`px-2 py-0.5 rounded-full border text-[13px] leading-none font-semibold ${ns.className}`}
                                    >
                                      NS {ns.letter}
                                    </span>
                                  ) : null;
                                })()}
                                {(() => {
                                  const nova = getNovaGroupMeta(
                                    lookupState.result.nutrition?.novaGroup
                                  );
                                  return nova ? (
                                    <span
                                      className={`px-2 py-0.5 rounded-full border text-[13px] leading-none font-semibold ${nova.className}`}
                                    >
                                      {nova.shortLabel}
                                    </span>
                                  ) : null;
                                })()}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const match = lookupState.result!;
                                  updateItem(item.localKey, (prev) => {
                                    const isLinked =
                                      prev.mode === "link_existing";
                                    const effectiveUnit = isLinked
                                      ? prev.baseUnit
                                      : match.hasParsedQuantity !== false
                                        ? match.baseUnit
                                        : prev.baseUnit;
                                    const newUnitMeasure =
                                      match.hasParsedQuantity !== false &&
                                      match.unitMeasurePerPack > 0
                                        ? Number(
                                            (
                                              match.unitMeasurePerPack *
                                              (prev.quantity > 0
                                                ? prev.quantity
                                                : 1)
                                            ).toFixed(3)
                                          )
                                        : prev.unitMeasure;
                                    return recomputeItemMetrics({
                                      ...prev,
                                      ...(!isLinked &&
                                      match.ean &&
                                      match.productName
                                        ? {
                                            newProductName: match.productName,
                                            suggestedName: match.productName,
                                          }
                                        : {}),
                                      baseUnit: effectiveUnit,
                                      newProductBaseUnit: isLinked
                                        ? prev.newProductBaseUnit
                                        : effectiveUnit,
                                      unitMeasure: newUnitMeasure,
                                      barcode:
                                        match.ean ||
                                        match.nutrition?.ean ||
                                        prev.barcode ||
                                        null,
                                      nutrition:
                                        match.nutrition ||
                                        prev.nutrition ||
                                        null,
                                    });
                                  });
                                }}
                                className="h-7 px-3 rounded-full bg-[var(--primary)] text-[var(--primary-on)] text-[13px] font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                Apply size
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Collapsible Discounts & Excluded Bags */}
          {discountAndExcludedItems.length > 0 && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
              <button
                type="button"
                onClick={() => setShowDiscountsSection((prev) => !prev)}
                aria-expanded={showDiscountsSection}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[var(--bg-subtle)]/60 transition-colors cursor-pointer"
              >
                <span className="text-[14px] font-medium text-[var(--text-primary)]">
                  Discounts and bags ({discountAndExcludedItems.length})
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${
                    showDiscountsSection ? "rotate-180" : ""
                  }`}
                />
              </button>

              {showDiscountsSection && (
                <div className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
                  {discountAndExcludedItems.map((item) => (
                    <div
                      key={item.localKey}
                      className="px-4 py-2.5 flex items-center justify-between gap-3 text-[13px]"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-[var(--text-primary)] truncate">
                          {item.suggestedName || item.rawName}
                        </div>
                        <div className="text-[var(--text-muted)]">
                          {item.isDiscount ? "Store discount" : "Excluded item"}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className={`tabular-nums font-medium ${
                            item.totalPrice < 0
                              ? "text-[var(--positive)]"
                              : "text-[var(--text-muted)]"
                          }`}
                        >
                          {formatCurrency(item.totalPrice)}
                        </span>

                        {isEditable && item.excluded && !item.isDiscount && (
                          <button
                            type="button"
                            onClick={() =>
                              updateItem(item.localKey, (prev) => ({
                                ...prev,
                                excluded: false,
                              }))
                            }
                            title="Restore item"
                            className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--primary)] hover:underline cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Restore
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Spanish VAT Tax Breakdown */}
          {receipt.taxBreakdown && receipt.taxBreakdown.length > 0 && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)]">
                <h2 className="font-display font-semibold text-[16px] text-[var(--text-primary)]">
                  Tax breakdown
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                      <th className="py-2.5 px-4 font-medium">VAT rate</th>
                      <th className="py-2.5 px-4 font-medium text-right">
                        Taxable base
                      </th>
                      <th className="py-2.5 px-4 font-medium text-right">
                        VAT paid
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] tabular-nums">
                    {receipt.taxBreakdown.map((t, idx) => (
                      <tr key={`${t.rate}-${idx}`}>
                        <td className="py-2.5 px-4 font-medium text-[var(--text-primary)]">
                          {t.rate}%
                        </td>
                        <td className="py-2.5 px-4 text-right text-[var(--text-muted)]">
                          {formatCurrency(t.baseAmount)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-[var(--text-primary)]">
                          {formatCurrency(t.taxAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky Bottom Confirmation Bar */}
      {isEditable && (
        <div className="sticky bottom-3 z-30 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-card)]/95 backdrop-blur-md px-4 sm:px-5 py-3.5 shadow-[var(--shadow-soft)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-[13px] tabular-nums space-y-0.5">
            <div className="font-semibold text-[var(--text-primary)]">
              Items sum: {formatCurrency(calculatedLineSum)} · Receipt total:{" "}
              {formatCurrency(parsedTotalAmount)}
            </div>
            {totalDifference > 0.1 ? (
              <div className="text-[var(--accent)]">
                Difference of {formatCurrency(totalDifference)} vs till slip
                total
              </div>
            ) : (
              <div className="text-[var(--text-muted)]">
                Matches till slip total
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isConfirming || !parsedDateISO}
              onClick={() => handleConfirmReceipt(false)}
              className="h-10 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[14px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer disabled:opacity-60"
            >
              {isConfirming && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              <CheckCircle2 className="w-4 h-4" />
              Confirm receipt
            </button>

            {nextPendingId && (
              <button
                type="button"
                disabled={isConfirming || !parsedDateISO}
                onClick={() => handleConfirmReceipt(true)}
                className="h-10 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)] text-[13px] font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                Confirm and next
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mobile Full-Screen Receipt Viewer Modal */}
      {showMobileViewer && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex items-center justify-center p-3"
          role="dialog"
          aria-modal="true"
          aria-label="Original receipt photo"
        >
          <div
            className="fixed inset-0 bg-[var(--scrim)]"
            onClick={() => setShowMobileViewer(false)}
          />
          <div className="relative z-10 w-full max-w-lg">
            <ReceiptViewer
              receiptId={receipt.id}
              sourceFile={receipt.sourceFile}
              hasOriginalPdf={receipt.hasOriginalPdf}
              fileVersion={receipt.fileVersion}
              isDigitalDia={receipt.isDigitalDia}
              isMobileModal
              onCloseMobileModal={() => setShowMobileViewer(false)}
            />
          </div>
        </div>
      )}

      {/* Product Search Link Modal */}
      <ProductSearchModal
        key={searchModalKey ?? "closed"}
        isOpen={Boolean(searchModalKey)}
        onClose={() => setSearchModalKey(null)}
        onSelectProduct={handleSelectProduct}
        onSwitchToCreateNew={() => handleSwitchToCreateNew()}
        onApplyBarcodeLookup={handleApplyBarcodeFromModal}
        currentProductName={
          activeModalItem?.matchedProductInfo?.displayName ||
          activeModalItem?.suggestedName
        }
        initialQuery={
          activeModalItem?.suggestedName || activeModalItem?.rawName || ""
        }
      />

      {/* Camera Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={Boolean(barcodeTargetKey)}
        onClose={() => setBarcodeTargetKey(null)}
        onDetected={(code) => {
          const targetKey = barcodeTargetKey;
          setBarcodeTargetKey(null);
          if (targetKey) {
            void handleBarcodeLookupForItem(targetKey, code);
          }
        }}
      />
    </div>
  );
}
