"use client";

import React, { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Store as StoreIcon,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Tag,
  Trash2,
  Plus,
  Search,
  Eye,
  RefreshCw,
  Star,
  ChevronDown,
  ChevronUp,
  FileText,
  Upload,
  ArrowRight,
  ExternalLink,
  Edit2,
  Check,
  X,
  Clock,
  Scale,
} from "lucide-react";
import { CANONICAL_CATEGORIES } from "@/lib/ai/schema";
import { ReceiptViewer } from "./receipt-viewer";
import {
  ProductSearchModal,
  SearchedProduct,
} from "./product-search-modal";
import {
  confirmReceiptAction,
  deleteReceiptAction,
  reopenReceiptAction,
  ReviewItemInput,
} from "./actions";
import { type CatalogLookupResult } from "@/lib/catalog/parser";

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
  isEditing?: boolean;
  isCustomManual?: boolean;
  countInSanityTotal?: boolean;
  matchedProductInfo?: {
    displayName: string;
    category: string;
    baseUnit: "KG" | "L" | "UNIT";
    isStaple?: boolean;
  };
}

export function ReviewWorkstation({
  receipt,
  stores,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  currentUserRole: _currentUserRole = "USER",
  nextPendingId = null,
  pendingReviewCount = 0,
}: ReviewWorkstationProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Receipt Level Metadata State
  const [storeId, setStoreId] = useState(receipt.storeId);
  const [purchaseDate, setPurchaseDate] = useState(
    receipt.purchaseDate.slice(0, 10)
  );
  const [receiptTotal, setReceiptTotal] = useState<number>(
    receipt.totalAmount || 0
  );
  const [status, setStatus] = useState<"REVIEW" | "CONFIRMED">(receipt.status);

  // Items State
  const [items, setItems] = useState<ExtendedItemState[]>(() => {
    return receipt.items.map((i) => {
      const isLinked = !!i.productId && !!i.product;
      const initialMode: "create_new" | "link_existing" = isLinked
        ? "link_existing"
        : "create_new";

      const effectiveBaseUnit = (isLinked && i.product?.baseUnit)
        ? (i.product.baseUnit as "KG" | "L" | "UNIT")
        : (i.baseUnit as "KG" | "L" | "UNIT") || "UNIT";

      return {
        id: i.id,
        rawName: i.rawName,
        suggestedName: i.suggestedName || i.rawName,
        suggestedCat: i.suggestedCat || i.product?.category || "Other",
        matchConfidence: i.matchConfidence,
        mode: initialMode,
        productId: i.productId || null,
        newProductName: isLinked ? undefined : i.suggestedName || i.rawName,
        newProductCategory: isLinked ? undefined : i.suggestedCat || "Other",
        newProductBaseUnit: isLinked ? undefined : effectiveBaseUnit,
        newProductIsStaple: isLinked ? i.product?.isStaple : false,
        quantity: i.quantity || 1,
        unitPrice: i.unitPrice || 0,
        totalPrice: i.totalPrice || 0,
        baseUnit: effectiveBaseUnit,
        unitMeasure: i.unitMeasure || 1,
        pricePerBaseUnit: i.pricePerBaseUnit || 0,
        isDiscount: i.isDiscount,
        excluded: i.excluded,
        countInSanityTotal: true,
        matchedProductInfo: i.product
          ? {
              displayName: i.product.displayName,
              category: i.product.category,
              baseUnit: i.product.baseUnit,
              isStaple: i.product.isStaple,
            }
          : undefined,
      };
    });
  });

  // UI Accordion & Drawer Controls
  const [pendingExpanded, setPendingExpanded] = useState(true);
  const [matchedExpanded, setMatchedExpanded] = useState(true);
  const [excludedExpanded, setExcludedExpanded] = useState(false);
  const [mobileEvidenceOpen, setMobileEvidenceOpen] = useState(false);

  // Search Modal Controls
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchTargetIndex, setSearchTargetIndex] = useState<number | null>(
    null
  );

  // UI Feedback states
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Live Math Sanity Calculation
  const mathSanity = useMemo(() => {
    // Active items: not excluded and not discount
    const activeCount = items.filter((i) => !i.excluded && !i.isDiscount).length;

    // Sum of items that count towards sanity total
    const calculatedSum = items.reduce((acc, item) => {
      // If item is completely excluded and not counted in sanity total, skip
      if (item.excluded && !item.countInSanityTotal) return acc;
      // Discount lines are negative in calculation
      if (item.isDiscount) {
        return acc - Math.abs(item.totalPrice);
      }
      return acc + (item.excluded ? 0 : item.totalPrice);
    }, 0);

    const delta = Math.abs(calculatedSum - receiptTotal);
    const isBalanced = delta < 0.02;

    return {
      activeCount,
      calculatedSum: Math.round(calculatedSum * 100) / 100,
      delta: Math.round(delta * 100) / 100,
      isBalanced,
      diffSign: calculatedSum >= receiptTotal ? "+" : "-",
    };
  }, [items, receiptTotal]);

  // Current store details
  const currentStore = useMemo(() => {
    return (
      stores.find((s) => s.id === storeId) ||
      receipt.store || {
        id: storeId,
        name: "Supermarket",
        brandHex: "#10b981",
        slug: "store",
      }
    );
  }, [stores, storeId, receipt.store]);

  // Three-Tier Groups
  const pendingItems = useMemo(() => {
    return items
      .map((item, index) => ({ item, index }))
      .filter(
        ({ item }) =>
          !item.excluded && !item.isDiscount && item.matchConfidence < 1.0
      );
  }, [items]);

  const autoMatchedItems = useMemo(() => {
    return items
      .map((item, index) => ({ item, index }))
      .filter(
        ({ item }) =>
          !item.excluded && !item.isDiscount && item.matchConfidence >= 1.0
      );
  }, [items]);

  const excludedItems = useMemo(() => {
    return items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.excluded || item.isDiscount);
  }, [items]);

  // Handlers for modifying items
  const updateItem = (index: number, partial: Partial<ExtendedItemState>) => {
    setItems((prev) => {
      const next = [...prev];
      const target = { ...next[index], ...partial };

      // Recalculate normalized price if total, measure, or unit changed
      if (
        partial.totalPrice !== undefined ||
        partial.unitMeasure !== undefined ||
        partial.baseUnit !== undefined
      ) {
        const total = target.totalPrice || 0;
        const measure = target.unitMeasure || 1;
        target.pricePerBaseUnit =
          measure > 0 && total > 0 && !target.isDiscount
            ? Math.round((total / measure) * 100) / 100
            : 0;
      }

      next[index] = target;
      return next;
    });
  };

  const toggleItemExcluded = (index: number) => {
    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      next[index] = {
        ...current,
        excluded: !current.excluded,
      };
      return next;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const addManualLine = () => {
    const newItem: ExtendedItemState = {
      id: `manual-${Date.now()}`,
      rawName: "MANUAL ITEM",
      suggestedName: "New Product",
      suggestedCat: "Other",
      matchConfidence: 0,
      mode: "create_new",
      productId: null,
      newProductName: "New Product",
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
      isCustomManual: true,
      countInSanityTotal: true,
    };
    setItems((prev) => [newItem, ...prev]);
    setPendingExpanded(true);
  };

  // Open Search Modal for a specific item
  const openSearchModal = (itemIndex: number) => {
    setSearchTargetIndex(itemIndex);
    setSearchModalOpen(true);
  };

  const handleSelectProduct = (product: SearchedProduct) => {
    if (searchTargetIndex === null) return;
    const currentItem = items[searchTargetIndex];

    let newMeasure = currentItem.unitMeasure || 1;
    if (
      product.baseUnit === "KG" &&
      newMeasure === 1 &&
      currentItem.unitPrice > 0 &&
      currentItem.totalPrice > 0 &&
      currentItem.unitPrice > currentItem.totalPrice
    ) {
      newMeasure = Number(
        (currentItem.totalPrice / currentItem.unitPrice).toFixed(3)
      );
    }

    const pricePerBase =
      newMeasure > 0
        ? Math.round(((currentItem.totalPrice || 0) / newMeasure) * 100) / 100
        : 0;

    updateItem(searchTargetIndex, {
      mode: "link_existing",
      productId: product.id,
      matchConfidence: 1.0,
      baseUnit: product.baseUnit,
      unitMeasure: newMeasure,
      pricePerBaseUnit: pricePerBase,
      matchedProductInfo: {
        displayName: product.displayName,
        category: product.category,
        baseUnit: product.baseUnit,
        isStaple: product.isStaple,
      },
      newProductCategory: product.category,
      newProductBaseUnit: product.baseUnit,
    });
    setSearchModalOpen(false);
    setSearchTargetIndex(null);
  };

  const handleSwitchToCreateNew = () => {
    if (searchTargetIndex === null) return;
    const target = items[searchTargetIndex];

    updateItem(searchTargetIndex, {
      mode: "create_new",
      productId: null,
      matchConfidence: 0.0,
      matchedProductInfo: undefined,
      newProductName: target.suggestedName || target.rawName,
      newProductCategory: target.suggestedCat || "Other",
      newProductBaseUnit: target.baseUnit || "UNIT",
    });
    setSearchModalOpen(false);
    setSearchTargetIndex(null);
  };

  // Confirm Receipt Action
  const handleConfirmReceipt = (nextUrl?: string) => {
    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const sanitizedItems: ReviewItemInput[] = items.map((i) => ({
        id: i.id,
        rawName: i.rawName,
        suggestedName: i.suggestedName,
        suggestedCat: i.suggestedCat,
        matchConfidence: i.matchConfidence,
        mode: i.mode,
        productId: i.productId,
        newProductName: i.newProductName,
        newProductCategory: i.newProductCategory,
        newProductBaseUnit: i.newProductBaseUnit,
        newProductIsStaple: i.newProductIsStaple,
        quantity: Number(i.quantity) || 1,
        unitPrice: Number(i.unitPrice) || 0,
        totalPrice: Number(i.totalPrice) || 0,
        baseUnit: i.baseUnit,
        unitMeasure: Number(i.unitMeasure) || 1,
        pricePerBaseUnit: Number(i.pricePerBaseUnit) || 0,
        isDiscount: !!i.isDiscount,
        excluded: !!i.excluded,
      }));

      const res = await confirmReceiptAction({
        receiptId: receipt.id,
        storeId,
        purchaseDate,
        totalAmount: Number(receiptTotal) || 0,
        items: sanitizedItems,
      });

      if (res.success) {
        if (nextUrl) {
          router.push(nextUrl);
        } else {
          setStatus("CONFIRMED");
          setFeedbackSuccess(
            `Receipt confirmed successfully! Trained ${res.confirmedCount} product mappings.`
          );
          router.refresh();
        }
      } else {
        setFeedbackError(res.error || "Failed to confirm receipt.");
      }
    });
  };

  // Reopen Receipt Action
  const handleReopenReceipt = () => {
    startTransition(async () => {
      const res = await reopenReceiptAction(receipt.id);
      if (res.success) {
        setStatus("REVIEW");
        setFeedbackSuccess("Receipt reopened for editing.");
        router.refresh();
      } else {
        setFeedbackError(res.error || "Failed to reopen receipt.");
      }
    });
  };

  // Delete Receipt Action
  const handleDeleteReceipt = () => {
    startTransition(async () => {
      const res = await deleteReceiptAction(receipt.id);
      if (res.success) {
        router.push("/my-receipts");
      } else {
        setFeedbackError(res.error || "Failed to delete receipt.");
      }
    });
  };

  return (
    <div className="space-y-6 pb-52 sm:pb-36">
      {/* Search & Link Modal */}
      <ProductSearchModal
        isOpen={searchModalOpen}
        onClose={() => {
          setSearchModalOpen(false);
          setSearchTargetIndex(null);
        }}
        onSelectProduct={handleSelectProduct}
        onSwitchToCreateNew={handleSwitchToCreateNew}
        initialQuery={
          searchTargetIndex !== null
            ? items[searchTargetIndex]?.suggestedName ||
              items[searchTargetIndex]?.rawName ||
              ""
            : ""
        }
      />

      {/* Mobile Slide-Over Evidence Modal */}
      {mobileEvidenceOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950/95 backdrop-blur-md lg:hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-bold text-white">Original Receipt</span>
            </div>
            <button
              onClick={() => setMobileEvidenceOpen(false)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              aria-label="Close original receipt view"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 p-2 overflow-hidden">
            <ReceiptViewer
              receiptId={receipt.id}
              sourceFile={receipt.sourceFile}
            />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl border border-rose-500/30 bg-zinc-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Delete Receipt?</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              This will permanently remove this receipt, its scanned image, and all parsed line items. Confirmed products already in the catalogue will not be deleted.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteReceipt}
                disabled={isPending}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                {isPending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status & Feedback Alert Banners */}
      {feedbackSuccess && (
        <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-3 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span className="flex-1 font-medium">{feedbackSuccess}</span>
          <button
            onClick={() => setFeedbackSuccess(null)}
            className="text-emerald-400 hover:text-emerald-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {feedbackError && (
        <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-3">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span className="flex-1">{feedbackError}</span>
          <button
            onClick={() => setFeedbackError(null)}
            className="text-rose-400 hover:text-rose-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {status === "CONFIRMED" && (
        <div className="p-5 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>Receipt Confirmed & Integrated</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                  Active
                </span>
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">
                All prices are now active in the grocery catalogue and store aliases have been trained.
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {nextPendingId && (
              <Link
                href={`/receipts/${nextPendingId}/review`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs whitespace-nowrap shrink-0 transition-colors shadow-sm"
              >
                <span>Next in queue ({pendingReviewCount} remaining)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
            <Link
              href="/upload"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span>Upload Another</span>
            </Link>
            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
            >
              <span>View Catalogue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <button
              onClick={handleReopenReceipt}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-amber-500/30 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reopen to Edit</span>
            </button>
          </div>
        </div>
      )}

      {/* Editable Header Metadata Bar */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 backdrop-blur-sm p-4 sm:p-5 shadow-lg space-y-4">
        {/* Top row: Supermarket, Date, Total */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Supermarket Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <StoreIcon className="w-3.5 h-3.5 text-emerald-400" />
              <span>Supermarket</span>
            </label>
            <div className="relative">
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                disabled={status === "CONFIRMED" || isPending}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 appearance-none disabled:opacity-60 cursor-pointer"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-zinc-400">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Purchase Date */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>Purchase Date</span>
            </label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              disabled={status === "CONFIRMED" || isPending}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-60"
            />
          </div>

          {/* Printed Total */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-emerald-400" />
              <span>Printed Receipt Total</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                value={receiptTotal}
                onChange={(e) => setReceiptTotal(parseFloat(e.target.value) || 0)}
                disabled={status === "CONFIRMED" || isPending}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-3.5 pr-8 py-2 text-sm font-mono font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-60 tabular-nums"
              />
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none font-mono text-zinc-400 text-sm">
                €
              </div>
            </div>
          </div>
        </div>

        {/* Bottom row: Telemetry Pills & Mobile View Toggle */}
        <div className="pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 font-mono">
            {/* Status Pill */}
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider border ${
                status === "CONFIRMED"
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-300 border-amber-500/20"
              }`}
            >
              {status === "CONFIRMED" ? "CONFIRMED" : "PENDING REVIEW"}
            </span>

            {/* AI Provider Pill */}
            <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700/60 flex items-center gap-1.5 text-[11px]">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>AI: {receipt.aiProvider || "AI Vision"}</span>
            </span>

            {/* Latency Pill */}
            {receipt.processingMs ? (
              <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700/60 flex items-center gap-1 text-[11px]">
                <Clock className="w-3 h-3 text-zinc-500" />
                <span>{receipt.processingMs}ms</span>
              </span>
            ) : null}

            {/* Store Brand Badge */}
            <span
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-white shadow-sm flex items-center gap-1.5"
              style={{ backgroundColor: currentStore.brandHex }}
            >
              <span>{currentStore.name}</span>
            </span>
          </div>

          {/* Mobile View Original Receipt Button (< lg) */}
          <div className="block lg:hidden w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setMobileEvidenceOpen(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition-colors"
            >
              <Eye className="w-4 h-4" />
              <span>View Original Receipt</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Split-Screen Workstation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Sticky Column: Interactive Original Receipt Viewer (lg:col-span-5) */}
        <div className="hidden lg:block lg:col-span-5 sticky top-24 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase font-mono tracking-wider text-zinc-400 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              <span>Original Receipt Document</span>
            </h2>
            <a
              href={`/api/receipts/${receipt.id}/file`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-mono text-emerald-400 hover:underline flex items-center gap-1"
            >
              <span>Open raw</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="h-[75vh] w-full">
            <ReceiptViewer
              receiptId={receipt.id}
              sourceFile={receipt.sourceFile}
            />
          </div>
        </div>

        {/* Right Column: 3-Tier Grouped Checklist & Action Workstation (lg:col-span-7) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Action Toolbar above items */}
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Receipt Line Items</span>
                <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono text-xs">
                  {items.length} total
                </span>
              </h2>
            </div>

            {status !== "CONFIRMED" && (
              <button
                type="button"
                onClick={addManualLine}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800 hover:border-emerald-500/50 text-zinc-200 text-xs font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span>Add Line Item</span>
              </button>
            )}
          </div>

          {/* TIER 1: ⚠️ Pending Review / New Aliases */}
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 overflow-hidden transition-all shadow-sm">
            <button
              type="button"
              onClick={() => setPendingExpanded((prev) => !prev)}
              className="w-full flex items-center justify-between px-4 py-3 bg-amber-500/10 hover:bg-amber-500/15 text-amber-300 text-xs font-bold font-mono transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span>PENDING REVIEW / REQUIRES ATTENTION</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 text-[11px]">
                  {pendingItems.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-amber-400/80 font-normal">
                  {pendingExpanded ? "Collapse" : "Expand"}
                </span>
                {pendingExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
            </button>

            {pendingExpanded && (
              <div className="p-3.5 space-y-3">
                {pendingItems.length === 0 ? (
                  <div className="text-center py-6 text-xs text-zinc-400 font-mono">
                    All items recognized or categorized! Nothing pending review.
                  </div>
                ) : (
                  pendingItems.map(({ item, index }) => (
                    <ItemCard
                      key={item.id || `item-${index}`}
                      item={item}
                      index={index}
                      isPendingTier
                      readOnly={status === "CONFIRMED"}
                      storeName={currentStore.name}
                      onUpdateItem={updateItem}
                      onToggleExcluded={() => toggleItemExcluded(index)}
                      onRemoveItem={() => removeItem(index)}
                      onOpenSearch={() => openSearchModal(index)}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* TIER 2: ✅ Auto-Recognized (100% Match) */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden transition-all shadow-sm">
            <button
              type="button"
              onClick={() => setMatchedExpanded((prev) => !prev)}
              className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 hover:bg-zinc-800/80 text-emerald-400 text-xs font-bold font-mono transition-colors"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>AUTOMATICALLY RECOGNIZED</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px]">
                  {autoMatchedItems.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-400 font-normal">
                  {matchedExpanded ? "Collapse" : "Expand"}
                </span>
                {matchedExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
            </button>

            {matchedExpanded && (
              <div className="p-3.5 space-y-2.5">
                {autoMatchedItems.length === 0 ? (
                  <div className="text-center py-6 text-xs text-zinc-500 font-mono">
                    No items automatically matched at 100% yet. Confirm items above to train aliases!
                  </div>
                ) : (
                  autoMatchedItems.map(({ item, index }) => (
                    <ItemCard
                      key={item.id || `item-${index}`}
                      item={item}
                      index={index}
                      readOnly={status === "CONFIRMED"}
                      storeName={currentStore.name}
                      onUpdateItem={updateItem}
                      onToggleExcluded={() => toggleItemExcluded(index)}
                      onRemoveItem={() => removeItem(index)}
                      onOpenSearch={() => openSearchModal(index)}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* TIER 3: 🚫 Discounts, Bags & Excluded */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setExcludedExpanded((prev) => !prev)}
              className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/40 hover:bg-zinc-900 text-zinc-400 text-xs font-bold font-mono transition-colors"
            >
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-zinc-500" />
                <span>DISCOUNTS, BAGS & EXCLUDED ITEMS</span>
                <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-[11px]">
                  {excludedItems.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500 font-normal">
                  {excludedExpanded ? "Hide" : "Show"}
                </span>
                {excludedExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
            </button>

            {excludedExpanded && (
              <div className="p-3.5 space-y-2.5">
                {excludedItems.length === 0 ? (
                  <div className="text-center py-4 text-xs text-zinc-600 font-mono">
                    No excluded items or discounts in this receipt.
                  </div>
                ) : (
                  excludedItems.map(({ item, index }) => (
                    <div
                      key={item.id || `item-${index}`}
                      className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40 flex items-center justify-between gap-3 text-xs text-zinc-400"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 font-medium text-zinc-300">
                          <span>{item.suggestedName || item.rawName}</span>
                          {item.isDiscount ? (
                            <span className="px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 text-[10px] font-mono border border-rose-500/20">
                              Discount
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-500 text-[10px] font-mono">
                              Excluded
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-zinc-500">
                          POS: &quot;{item.rawName}&quot;
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right font-mono font-bold text-zinc-300 tabular-nums">
                          {item.isDiscount ? "-" : ""}€
                          {Math.abs(item.totalPrice).toFixed(2)}
                        </div>
                        {status !== "CONFIRMED" && (
                          <button
                            type="button"
                            onClick={() => toggleItemExcluded(index)}
                            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-semibold transition-colors"
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* RECEIPT TAX BREAKDOWN */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold font-mono text-zinc-200 uppercase tracking-wider">
                  Receipt Tax Breakdown
                </h3>
              </div>
              {receipt.taxBreakdown && receipt.taxBreakdown.length > 0 && (
                <span className="text-[11px] font-mono text-zinc-400">
                  Fiscal breakdown printed on receipt
                </span>
              )}
            </div>

            {receipt.taxBreakdown && receipt.taxBreakdown.length > 0 ? (
              <div className="space-y-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono text-left">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-400 text-[11px]">
                        <th className="py-1.5 px-2 font-medium">Tax Rate</th>
                        <th className="py-1.5 px-2 font-medium text-right">Tax Base</th>
                        <th className="py-1.5 px-2 font-medium text-right">Tax Amount</th>
                        <th className="py-1.5 px-2 font-medium text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                      {receipt.taxBreakdown.map((t, idx) => {
                        const subtotal = Number(t.baseAmount) + Number(t.taxAmount);
                        return (
                          <tr key={idx} className="hover:bg-zinc-900/40">
                            <td className="py-1.5 px-2 font-semibold text-emerald-400 whitespace-nowrap shrink-0">
                              {t.rate}%
                            </td>
                            <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap shrink-0">
                              €{Number(t.baseAmount).toFixed(2)}
                            </td>
                            <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap shrink-0">
                              €{Number(t.taxAmount).toFixed(2)}
                            </td>
                            <td className="py-1.5 px-2 text-right tabular-nums font-medium text-white whitespace-nowrap shrink-0">
                              €{subtotal.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      {(() => {
                        const totalBase = receipt.taxBreakdown.reduce((s, t) => s + Number(t.baseAmount), 0);
                        const totalCuota = receipt.taxBreakdown.reduce((s, t) => s + Number(t.taxAmount), 0);
                        const totalTaxed = totalBase + totalCuota;

                        return (
                          <tr className="border-t border-zinc-700/80 font-bold text-white bg-zinc-900/40">
                            <td className="py-2 px-2 text-zinc-400 whitespace-nowrap shrink-0">Total Taxes</td>
                            <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap shrink-0">€{totalBase.toFixed(2)}</td>
                            <td className="py-2 px-2 text-right tabular-nums text-emerald-400 whitespace-nowrap shrink-0">€{totalCuota.toFixed(2)}</td>
                            <td className="py-2 px-2 text-right tabular-nums text-white whitespace-nowrap shrink-0">
                              €{totalTaxed.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })()}
                    </tfoot>
                  </table>
                </div>

                {(() => {
                  const totalBase = receipt.taxBreakdown.reduce((s, t) => s + Number(t.baseAmount), 0);
                  const totalCuota = receipt.taxBreakdown.reduce((s, t) => s + Number(t.taxAmount), 0);
                  const totalTaxed = totalBase + totalCuota;
                  const delta = Math.abs(totalTaxed - Number(receiptTotal));
                  const isMatched = delta <= 0.05;

                  return (
                    <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                      <span className="text-zinc-400">
                        Base (€{totalBase.toFixed(2)}) + Tax (€{totalCuota.toFixed(2)}) = €{totalTaxed.toFixed(2)}
                      </span>
                      {isMatched ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap shrink-0 font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Total Matches Receipt</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 whitespace-nowrap shrink-0 font-medium">
                          <AlertCircle className="w-3 h-3" />
                          <span>Difference from total: €{delta.toFixed(2)}</span>
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-zinc-900/30 border border-zinc-800/40 text-xs text-zinc-500 font-mono">
                Tax breakdown not detected on receipt footer (common on digital or shortened tickets).
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky Bottom "Math Sanity Bar" */}
      <div className="fixed bottom-0 inset-x-0 z-50 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800 px-3 sm:px-6 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
          {/* Left: Active Count & Live Math Sanity */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs">
            <span className="font-mono text-zinc-300 font-medium whitespace-nowrap">
              <strong className="text-white font-bold">
                {mathSanity.activeCount}
              </strong>{" "}
              active items
            </span>

            <span className="hidden sm:inline text-zinc-700">•</span>

            <div className="font-mono text-xs flex items-center gap-2 whitespace-nowrap">
              <span className="text-zinc-400">
                Sum:{" "}
                <strong className="text-zinc-200 tabular-nums">
                  €{mathSanity.calculatedSum.toFixed(2)}
                </strong>
              </span>
              <span className="text-zinc-600">/</span>
              <span className="text-zinc-400">
                Ticket:{" "}
                <strong className="text-zinc-200 tabular-nums">
                  €{Number(receiptTotal).toFixed(2)}
                </strong>
              </span>
            </div>

            {/* Delta Badge */}
            {mathSanity.isBalanced ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[11px] font-bold whitespace-nowrap">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Balances to cent ✅ (Δ €0.00)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono text-[11px] font-bold whitespace-nowrap">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>
                  Discrepancy: Δ {mathSanity.diffSign}€{mathSanity.delta.toFixed(2)} ⚠️
                </span>
              </span>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {status !== "CONFIRMED" ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isPending}
                  className="p-2.5 sm:px-3 sm:py-2 rounded-xl border border-zinc-800 bg-zinc-900/80 hover:bg-rose-500/10 hover:border-rose-500/30 text-zinc-400 hover:text-rose-400 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors flex items-center gap-1.5"
                  title="Delete Receipt"
                >
                  <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">Delete</span>
                </button>

                {nextPendingId ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleConfirmReceipt()}
                      disabled={isPending}
                      className="px-3 sm:px-3.5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
                    >
                      Confirm & Exit
                    </button>

                    <button
                      type="button"
                      onClick={() => handleConfirmReceipt(`/receipts/${nextPendingId}/review`)}
                      disabled={isPending}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs sm:text-sm whitespace-nowrap shrink-0 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                    >
                      {isPending ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      <span>Confirm & Next ({pendingReviewCount} left) →</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConfirmReceipt()}
                    disabled={isPending}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs sm:text-sm whitespace-nowrap shrink-0 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                  >
                    {isPending ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    <span>Confirm Receipt & Train Aliases</span>
                  </button>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isPending}
                  className="px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-900/80 hover:bg-rose-500/10 hover:border-rose-500/30 text-zinc-400 hover:text-rose-400 text-xs font-semibold transition-colors flex items-center gap-1.5"
                  title="Delete Receipt"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Delete</span>
                </button>

                <button
                  type="button"
                  onClick={handleReopenReceipt}
                  disabled={isPending}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-xs font-bold transition-colors border border-amber-500/30"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reopen for Editing</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// ITEM CARD COMPONENT WITH RESOLUTION MODE + INLINE NORMALIZATION EDITOR
// -----------------------------------------------------------------------------
interface ItemCardProps {
  item: ExtendedItemState;
  index: number;
  isPendingTier?: boolean;
  readOnly?: boolean;
  storeName?: string;
  onUpdateItem: (index: number, partial: Partial<ExtendedItemState>) => void;
  onToggleExcluded: () => void;
  onRemoveItem: () => void;
  onOpenSearch: () => void;
}

function ItemCard({
  item,
  index,
  isPendingTier = false,
  readOnly = false,
  storeName = "",
  onUpdateItem,
  onToggleExcluded,
  onRemoveItem,
  onOpenSearch,
}: ItemCardProps) {
  const [isExpanded, setIsExpanded] = useState(
    item.isEditing || item.isCustomManual || false
  );

  // Catalog Lookup State
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [catalogMatches, setCatalogMatches] = useState<CatalogLookupResult[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const isModeCreateNew = item.mode === "create_new";
  const isLinked = item.mode === "link_existing" || !!item.matchedProductInfo;
  const canonicalBaseUnit = (isLinked && item.matchedProductInfo?.baseUnit)
    ? item.matchedProductInfo.baseUnit
    : item.baseUnit;

  const currentQty = Math.max(Number(item.quantity) || 1, 1);
  const packSize = Number((Number(item.unitMeasure || 1) / currentQty).toFixed(3));

  const handleCatalogLookup = async () => {
    setIsCatalogOpen(true);
    setIsCatalogLoading(true);
    setCatalogError(null);
    try {
      const q = item.suggestedName || item.rawName;
      const res = await fetch(
        `/api/catalog/lookup?q=${encodeURIComponent(q)}&store=${encodeURIComponent(storeName)}`
      );
      if (!res.ok) {
        throw new Error("Catalog lookup failed");
      }
      const data = await res.json();
      const matches = Array.isArray(data.matches) ? data.matches : [];
      setCatalogMatches(matches);
      if (matches.length === 0) {
        setCatalogError("No matching pack formats found in the catalog.");
      }
    } catch {
      setCatalogError("Unable to connect to the catalog at this time.");
    } finally {
      setIsCatalogLoading(false);
    }
  };

  const handleApplyCatalogMatch = (match: CatalogLookupResult) => {
    const effectiveUnit = isLinked && item.matchedProductInfo
      ? item.matchedProductInfo.baseUnit
      : match.baseUnit;
    const newTotalMeasure = Number((currentQty * match.unitMeasurePerPack).toFixed(3));
    onUpdateItem(index, {
      baseUnit: effectiveUnit,
      newProductBaseUnit: isLinked ? undefined : effectiveUnit,
      unitMeasure: newTotalMeasure,
      isVariableWeight: false,
    });
    setIsCatalogOpen(false);
  };

  return (
    <div
      className={`rounded-2xl border transition-all ${
        isPendingTier
          ? "border-amber-500/30 bg-zinc-900/90 shadow-sm"
          : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
      }`}
    >
      {/* Primary Card Header */}
      <div className="p-3.5 sm:p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          {/* Left item details */}
          <div className="space-y-1.5 flex-1 min-w-0">
            {/* POS verbatim text badge */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-zinc-950 text-zinc-300 border border-zinc-800 truncate max-w-[200px] sm:max-w-xs">
                &quot;{item.rawName}&quot;
              </span>

              {item.matchConfidence >= 1.0 ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-mono font-bold border border-emerald-500/20 whitespace-nowrap shrink-0">
                  100% Match
                </span>
              ) : item.matchConfidence > 0 ? (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 text-[10px] font-mono font-bold border border-amber-500/20 whitespace-nowrap shrink-0">
                  {(item.matchConfidence * 100).toFixed(0)}% Match
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-[10px] font-mono border border-zinc-700/60 whitespace-nowrap shrink-0">
                  New Item
                </span>
              )}

              {item.newProductIsStaple && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 text-[10px] font-mono font-semibold flex items-center gap-1 border border-amber-500/20 whitespace-nowrap shrink-0">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <span>Staple</span>
                </span>
              )}

              {item.isVariableWeight && (
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 text-[10px] font-mono font-semibold border border-cyan-500/20 whitespace-nowrap shrink-0">
                  Variable Weight / Loose
                </span>
              )}
            </div>

            {/* Display / Linked Name */}
            <div className="text-sm font-bold text-white truncate">
              {item.mode === "link_existing" && item.matchedProductInfo
                ? item.matchedProductInfo.displayName
                : item.newProductName || item.suggestedName || item.rawName}
            </div>

            {/* Category & Unit Subtext */}
            <div className="text-xs text-zinc-400 flex items-center gap-2 font-mono">
              <span className="text-zinc-300">
                {item.mode === "link_existing" && item.matchedProductInfo
                  ? item.matchedProductInfo.category
                  : item.newProductCategory || item.suggestedCat || "Other"}
              </span>
              <span className="text-zinc-600">&bull;</span>
              <span className="text-zinc-400">
                {item.quantity} × €{Number(item.unitPrice).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Right prices */}
          <div className="text-right shrink-0 space-y-1">
            <div className="text-base font-bold font-mono text-white tabular-nums">
              €{Number(item.totalPrice).toFixed(2)}
            </div>
            <div className="text-xs font-mono font-bold text-emerald-400 tabular-nums">
              {Number(item.pricePerBaseUnit).toFixed(2)} €/
              {canonicalBaseUnit.toLowerCase()}
            </div>
          </div>
        </div>

        {/* Resolution Mode Switcher (Active when pending review and not read-only) */}
        {!readOnly && isPendingTier && (
          <div className="pt-2 border-t border-zinc-800/80 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  onUpdateItem(index, {
                    mode: "create_new",
                    productId: null,
                    newProductName: item.suggestedName || item.rawName,
                    newProductCategory: item.suggestedCat || "Other",
                    newProductBaseUnit: item.baseUnit || "UNIT",
                  });
                }}
                className={`py-2 px-3 rounded-xl border text-xs transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
                  isModeCreateNew
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-bold"
                    : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Create New Product</span>
              </button>

              <button
                type="button"
                onClick={isModeCreateNew ? onOpenSearch : undefined}
                className={`py-2 px-3 rounded-xl border text-xs transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
                  !isModeCreateNew
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-bold"
                    : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>
                  {item.mode === "link_existing"
                    ? "Linked to Catalogue"
                    : "Link to Existing Product"}
                </span>
              </button>
            </div>

            {/* Mode A Details: Create New Product Inputs */}
            {isModeCreateNew ? (
              <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-mono text-zinc-400 uppercase">
                      Canonical Name
                    </label>
                    <input
                      type="text"
                      value={item.newProductName ?? item.suggestedName}
                      onChange={(e) =>
                        onUpdateItem(index, { newProductName: e.target.value })
                      }
                      className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      placeholder="e.g. Aceite de Oliva Virgen Extra 1L"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-zinc-400 uppercase">
                      Category
                    </label>
                    <select
                      value={item.newProductCategory ?? item.suggestedCat}
                      onChange={(e) =>
                        onUpdateItem(index, { newProductCategory: e.target.value })
                      }
                      className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {CANONICAL_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {/* Base Unit Pill Selector */}
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] font-mono text-zinc-400 mr-1 uppercase whitespace-nowrap">
                      Base Unit:
                    </span>
                    {(["KG", "L", "UNIT"] as const).map((unit) => (
                      <button
                        key={unit}
                        type="button"
                        onClick={() =>
                          onUpdateItem(index, {
                            baseUnit: unit,
                            newProductBaseUnit: unit,
                          })
                        }
                        className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border transition-colors whitespace-nowrap shrink-0 ${
                          item.baseUnit === unit
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                            : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                        }`}
                      >
                        {unit}
                      </button>
                    ))}
                  </div>

                  {/* Staple Toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateItem(index, {
                        newProductIsStaple: !item.newProductIsStaple,
                      })
                    }
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                      item.newProductIsStaple
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold"
                        : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${
                        item.newProductIsStaple
                          ? "fill-amber-400 text-amber-400"
                          : ""
                      }`}
                    />
                    <span>Staple Basket</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Mode B: Link to Existing Badge */
              <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5 truncate">
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {item.matchedProductInfo?.displayName ||
                        "Selected Product"}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono flex items-center gap-2">
                    <span>{item.matchedProductInfo?.category}</span>
                    <span>&bull;</span>
                    <span className="text-emerald-400 font-semibold">
                      BaseUnit Lock: {canonicalBaseUnit}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onOpenSearch}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold shrink-0 transition-colors flex items-center gap-1 whitespace-nowrap"
                >
                  <Search className="w-3 h-3 text-emerald-400" />
                  <span>Change Product</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tier 2 Auto-Matched Item Controls (Active for 100% matched items when not read-only) */}
        {!readOnly && !isPendingTier && (
          <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-800/60">
            <div className="flex items-center gap-2 min-w-0">
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <div className="text-xs font-mono truncate">
                <span className="text-zinc-400">Matched: </span>
                <span className="font-bold text-emerald-300">
                  {item.matchedProductInfo?.displayName || item.newProductName || item.suggestedName}
                </span>
                {item.matchedProductInfo?.category && (
                  <span className="text-zinc-500 text-[11px] ml-1.5">
                    ({item.matchedProductInfo.category})
                  </span>
                )}
                <span className="text-emerald-400 text-[11px] font-bold ml-1.5">
                  [{canonicalBaseUnit}]
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onOpenSearch}
                className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors flex items-center gap-1 whitespace-nowrap"
                title="Select a different product from catalogue"
              >
                <Search className="w-3 h-3 text-emerald-400" />
                <span>Change Product</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onUpdateItem(index, {
                    mode: "create_new",
                    productId: null,
                    matchConfidence: 0.0,
                    matchedProductInfo: undefined,
                    newProductName: item.suggestedName || item.rawName,
                    newProductCategory: item.suggestedCat || "Other",
                    newProductBaseUnit: item.baseUnit || "UNIT",
                  });
                }}
                className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 text-xs font-semibold transition-colors border border-zinc-700/60 flex items-center gap-1 whitespace-nowrap"
                title="Unlink and create as a new separate product"
              >
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>Not Same Product (Unlink)</span>
              </button>
            </div>
          </div>
        )}

        {/* Secondary Card Footer: Actions & Inline Editor Toggle */}
        <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-zinc-400">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs shadow-inner">
              <span className="text-zinc-500">Qty:</span>
              <strong className="text-white tabular-nums">{Number(item.quantity)}</strong>
              <span className="text-zinc-700">&bull;</span>
              <span className="text-zinc-500">
                {canonicalBaseUnit === "KG" ? "Weight:" : canonicalBaseUnit === "L" ? "Volume:" : "Pack Size:"}
              </span>
              <strong className="text-emerald-400 tabular-nums">
                {Number(item.unitMeasure)} {canonicalBaseUnit === "KG" ? "kg" : canonicalBaseUnit === "L" ? "L" : "units"}
              </strong>
            </div>

            {/* Catalog lookup quick trigger */}
            {!readOnly && (
              <button
                type="button"
                onClick={handleCatalogLookup}
                disabled={isCatalogLoading}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0"
              >
                {isCatalogLoading ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Search className="w-3 h-3 text-emerald-400" />
                )}
                <span>Lookup format</span>
              </button>
            )}
          </div>

          {!readOnly && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              >
                <Edit2 className="w-3 h-3 text-emerald-400" />
                <span>{isExpanded ? "Done" : "Adjust Weight / Pack Size"}</span>
              </button>

              <button
                type="button"
                onClick={onToggleExcluded}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition-colors"
                title="Exclude line from price index"
              >
                <Tag className="w-3.5 h-3.5" />
              </button>

              {item.isCustomManual && (
                <button
                  type="button"
                  onClick={onRemoveItem}
                  className="p-1 rounded-lg hover:bg-rose-500/10 text-zinc-400 hover:text-rose-400 transition-colors"
                  title="Remove line"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* INLINE PRICE & UNIT NORMALIZATION EDITOR */}
      {isExpanded && !readOnly && (
        <div className="px-4 pb-4 pt-3 border-t border-zinc-800 bg-zinc-950/70 rounded-b-2xl space-y-3.5">
          {/* Base Unit Lock / Selector Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-zinc-800/60 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider whitespace-nowrap">
                Normalizing Base Unit:
              </span>
              {isLinked && item.matchedProductInfo ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-xs font-bold whitespace-nowrap shrink-0">
                  <Scale className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Locked to product ({canonicalBaseUnit})</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1">
                  {(["KG", "L", "UNIT"] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() =>
                        onUpdateItem(index, {
                          baseUnit: unit,
                          newProductBaseUnit: unit,
                        })
                      }
                      className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold border transition-colors whitespace-nowrap shrink-0 ${
                        item.baseUnit === unit
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      {unit === "KG" ? "KG (€/kg)" : unit === "L" ? "L (€/L)" : "UNIT (€/unit)"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="text-xs font-mono font-bold text-emerald-400 tabular-nums break-words">
              €{Number(item.totalPrice).toFixed(2)} &divide; ({Number(item.quantity)} &times; {Number(item.unitMeasure)} {canonicalBaseUnit.toLowerCase()}) = {Number(item.pricePerBaseUnit).toFixed(2)} €/{canonicalBaseUnit.toLowerCase()}
            </div>
          </div>

          {/* Formato por unidad / envase control */}
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-300">
                  Pack / Unit Format:
                </span>
                {canonicalBaseUnit === "KG" && (
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateItem(index, { isVariableWeight: !item.isVariableWeight });
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors border whitespace-nowrap shrink-0 ${
                      item.isVariableWeight
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold"
                        : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    {item.isVariableWeight ? "⚖️ Variable Weight (Counter / Loose)" : "Fixed Pack"}
                  </button>
                )}
              </div>

              {/* Catalog Lookup trigger button */}
              <button
                type="button"
                onClick={handleCatalogLookup}
                disabled={isCatalogLoading}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
              >
                {isCatalogLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>Search format in catalog</span>
              </button>
            </div>

            {/* Readout of format math */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <span className="text-zinc-400">
                1 pack = <strong className="text-white tabular-nums">{packSize.toFixed(3)}</strong> {canonicalBaseUnit.toLowerCase()}
              </span>
              <span className="text-zinc-600">&rarr;</span>
              <span className="text-zinc-300">
                Line total: <strong className="text-emerald-400 tabular-nums">{Number(item.unitMeasure).toFixed(3)} {canonicalBaseUnit.toLowerCase()}</strong>
              </span>
              <span className="text-zinc-600">&bull;</span>
              <span className="text-emerald-400 font-bold tabular-nums">
                {Number(item.pricePerBaseUnit).toFixed(2)} €/{canonicalBaseUnit.toLowerCase()}
              </span>
            </div>

            {/* 1-Tap Spanish Format Preset Pills */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] font-mono">
              <span className="text-zinc-500 mr-1">Common presets:</span>
              {canonicalBaseUnit === "L" && (
                <>
                  {[
                    { label: "250ml", val: 0.25 },
                    { label: "330ml", val: 0.33 },
                    { label: "500ml", val: 0.5 },
                    { label: "750ml", val: 0.75 },
                    { label: "1L", val: 1.0 },
                    { label: "1.5L", val: 1.5 },
                    { label: "2L", val: 2.0 },
                    { label: "5L", val: 5.0 },
                    { label: "Pack 6×1L", val: 6.0 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        const newTot = Number((currentQty * p.val).toFixed(3));
                        onUpdateItem(index, { unitMeasure: newTot, isVariableWeight: false });
                      }}
                      className={`px-2 py-0.5 rounded border transition-colors whitespace-nowrap shrink-0 ${
                        Math.abs(packSize - p.val) < 0.01 && !item.isVariableWeight
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-bold"
                          : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </>
              )}
              {canonicalBaseUnit === "KG" && (
                <>
                  {[
                    { label: "100g", val: 0.1 },
                    { label: "200g", val: 0.2 },
                    { label: "250g", val: 0.25 },
                    { label: "400g", val: 0.4 },
                    { label: "500g", val: 0.5 },
                    { label: "Pack 4×125g (500g)", val: 0.5 },
                    { label: "Pack 6×125g (750g)", val: 0.75 },
                    { label: "1kg", val: 1.0 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        const newTot = Number((currentQty * p.val).toFixed(3));
                        onUpdateItem(index, { unitMeasure: newTot, isVariableWeight: false });
                      }}
                      className={`px-2 py-0.5 rounded border transition-colors whitespace-nowrap shrink-0 ${
                        Math.abs(packSize - p.val) < 0.01 && !item.isVariableWeight
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-bold"
                          : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateItem(index, { isVariableWeight: !item.isVariableWeight });
                    }}
                    className={`px-2 py-0.5 rounded border transition-colors whitespace-nowrap shrink-0 ${
                      item.isVariableWeight
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold"
                        : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white"
                    }`}
                  >
                    Variable Weight
                  </button>
                </>
              )}
              {canonicalBaseUnit === "UNIT" && (
                <>
                  {[
                    { label: "1 ud", val: 1 },
                    { label: "4 ud", val: 4 },
                    { label: "6 ud", val: 6 },
                    { label: "10 ud", val: 10 },
                    { label: "12 ud", val: 12 },
                    { label: "24 ud", val: 24 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        const newTot = Number((currentQty * p.val).toFixed(3));
                        onUpdateItem(index, { unitMeasure: newTot, isVariableWeight: false });
                      }}
                      className={`px-2 py-0.5 rounded border transition-colors whitespace-nowrap shrink-0 ${
                        Math.abs(packSize - p.val) < 0.01
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-bold"
                          : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* OpenFoodFacts ES Catalog Matches Drawer */}
          {isCatalogOpen && (
            <div className="p-3 rounded-xl bg-zinc-950 border border-emerald-500/30 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs font-mono pb-1 border-b border-zinc-800">
                <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Formats in Catalog (OpenFoodFacts ES)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsCatalogOpen(false)}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {isCatalogLoading && (
                <div className="flex items-center gap-2 py-3 text-xs text-zinc-400 font-mono">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  <span>Searching pack sizes for {storeName || "supermarket"}...</span>
                </div>
              )}

              {catalogError && !isCatalogLoading && (
                <div className="text-xs text-amber-400 font-mono py-1">{catalogError}</div>
              )}

              {!isCatalogLoading && catalogMatches.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {catalogMatches.map((m, mIdx) => (
                    <button
                      key={mIdx}
                      type="button"
                      onClick={() => handleApplyCatalogMatch(m)}
                      className="w-full text-left p-2 rounded-lg bg-zinc-900/80 hover:bg-zinc-800/80 border border-zinc-800 hover:border-emerald-500/40 transition-colors flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-zinc-200 truncate">
                          {m.productName}
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono">
                          {m.brand ? `${m.brand} • ` : ""}Pack: <strong className="text-emerald-300">{m.rawQuantityText}</strong>
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-mono text-[11px] font-bold whitespace-nowrap shrink-0">
                          {m.unitMeasurePerPack} {m.baseUnit.toLowerCase()}
                        </span>
                        <span className="text-emerald-400 font-mono text-xs font-bold whitespace-nowrap shrink-0">
                          Apply &rarr;
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Numeric Inputs Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            {/* Quantity */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-zinc-400 uppercase">
                Quantity (Packs)
              </label>
              <input
                type="number"
                min="0.01"
                step="any"
                value={item.quantity}
                onChange={(e) => {
                  const qty = parseFloat(e.target.value) || 1;
                  onUpdateItem(index, { quantity: qty });
                }}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 tabular-nums"
              />
            </div>

            {/* Unit Price */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-zinc-400 uppercase">
                Shelf Pack Price (€)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.unitPrice}
                onChange={(e) => {
                  const up = parseFloat(e.target.value) || 0;
                  onUpdateItem(index, {
                    unitPrice: up,
                    totalPrice: Math.round(up * (item.quantity || 1) * 100) / 100,
                  });
                }}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 tabular-nums"
              />
            </div>

            {/* Total Line Price */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-zinc-400 uppercase">
                Line Total (€)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.totalPrice}
                onChange={(e) => {
                  const tp = parseFloat(e.target.value) || 0;
                  onUpdateItem(index, { totalPrice: tp });
                }}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 tabular-nums"
              />
            </div>

            {/* Measure (Total weight / volume / units) */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-zinc-400 uppercase">
                {canonicalBaseUnit === "KG"
                  ? "Total Net Weight (kg)"
                  : canonicalBaseUnit === "L"
                  ? "Total Net Volume (L)"
                  : "Total Units"}
              </label>
              <input
                type="number"
                min="0.001"
                step="any"
                value={item.unitMeasure}
                onChange={(e) => {
                  const m = parseFloat(e.target.value) || 1;
                  onUpdateItem(index, { unitMeasure: m });
                }}
                placeholder={canonicalBaseUnit === "KG" ? "e.g. 0.500" : "1"}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 tabular-nums"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
