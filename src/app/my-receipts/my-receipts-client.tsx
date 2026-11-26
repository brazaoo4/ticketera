"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  ReceiptText,
  ChevronRight,
  Image as ImageIcon,
  Pencil,
  Trash2,
  Loader2,
  ExternalLink,
  AlertCircle,
  Clock,
  CheckCircle2,
  Camera,
} from "lucide-react";
import {
  formatCurrency,
  formatUnitPrice,
  formatLineMeasure,
  formatDate,
  formatMonthYear,
  formatMonthShort,
  getUTCMonthKey,
  getStoreBrand,
} from "@/lib/format";
import { ExportDataMenu } from "@/components/common/export-data-menu";
import { deleteReceiptAction } from "@/app/receipts/[id]/review/actions";

export interface ReceiptTaxLine {
  rate: number;
  baseAmount: number;
  taxAmount: number;
}

export interface SerializedMyReceiptItem {
  id: string;
  rawName: string;
  suggestedName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  baseUnit: "KG" | "L" | "UNIT";
  unitMeasure: number;
  pricePerBaseUnit: number;
  isDiscount: boolean;
  excluded: boolean;
  productSlug: string | null;
  productName: string | null;
}

export interface SerializedMyReceipt {
  id: string;
  purchaseDate: string;
  totalAmount: number;
  status: string;
  sourceFile: string;
  errorMessage: string | null;
  store: {
    id: string;
    name: string;
    slug: string;
    brandHex: string;
  };
  uploaderUsername: string | null;
  itemCount: number;
  taxBreakdown: ReceiptTaxLine[] | null;
  items: SerializedMyReceiptItem[];
}

export interface DiaConnectionSummary {
  id: string;
  status: string;
  syncEnabled: boolean;
  totalSyncedCount: number;
}

interface MyReceiptsClientProps {
  initialReceipts: SerializedMyReceipt[];
  diaConn: DiaConnectionSummary | null;
  isAdmin: boolean;
}

type SortOption = "newest" | "highest" | "lowest";
type StatusFilter = "ALL" | "REVIEW" | "CONFIRMED" | "FAILED";

function getStatusLabel(status: string): {
  label: string;
  tone: "review" | "processing" | "failed" | "confirmed";
} {
  switch (status) {
    case "REVIEW":
      return { label: "Needs review", tone: "review" };
    case "PROCESSING":
      return { label: "Reading receipt", tone: "processing" };
    case "FAILED":
      return { label: "Could not read", tone: "failed" };
    default:
      return { label: "Confirmed", tone: "confirmed" };
  }
}

export function MyReceiptsClient({
  initialReceipts,
  diaConn,
  isAdmin,
}: MyReceiptsClientProps) {
  const router = useRouter();
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const receipts = useMemo(
    () => initialReceipts.filter((r) => !deletedIds.includes(r.id)),
    [initialReceipts, deletedIds]
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStoreSlug, setSelectedStoreSlug] = useState<string>("all");
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(
    null
  );
  const [showPhoto, setShowPhoto] = useState(false);
  const [photoFailedIds, setPhotoFailedIds] = useState<Record<string, boolean>>(
    {}
  );
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const selectedReceipt = useMemo(
    () => receipts.find((r) => r.id === selectedReceiptId) ?? null,
    [receipts, selectedReceiptId]
  );

  useEffect(() => {
    if (!selectedReceiptId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelectedReceiptId(null);
        setConfirmDeleteId(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedReceiptId]);

  const totalSpend = useMemo(
    () => receipts.reduce((acc, r) => acc + r.totalAmount, 0),
    [receipts]
  );

  const storeTabs = useMemo(() => {
    const map = new Map<
      string,
      { slug: string; name: string; brandHex: string; count: number }
    >();
    receipts.forEach((r) => {
      const existing = map.get(r.store.slug);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(r.store.slug, {
          slug: r.store.slug,
          name: r.store.name,
          brandHex: r.store.brandHex,
          count: 1,
        });
      }
    });
    return Array.from(map.values()).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name)
    );
  }, [receipts]);

  const monthlyStrip = useMemo(() => {
    const map = new Map<
      string,
      { key: string; label: string; count: number; total: number }
    >();
    receipts.forEach((r) => {
      const key = getUTCMonthKey(r.purchaseDate);
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.total += r.totalAmount;
      } else {
        map.set(key, {
          key,
          label: formatMonthShort(r.purchaseDate),
          count: 1,
          total: r.totalAmount,
        });
      }
    });
    return Array.from(map.values())
      .sort((a, b) => b.key.localeCompare(a.key))
      .slice(0, 8);
  }, [receipts]);

  const statusCounts = useMemo(() => {
    let review = 0;
    let failed = 0;
    receipts.forEach((r) => {
      if (r.status === "REVIEW") review += 1;
      if (r.status === "FAILED") failed += 1;
    });
    return { review, failed };
  }, [receipts]);

  const filteredReceipts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = receipts.filter((r) => {
      if (selectedStoreSlug !== "all" && r.store.slug !== selectedStoreSlug) {
        return false;
      }
      if (
        selectedMonthKey !== "all" &&
        getUTCMonthKey(r.purchaseDate) !== selectedMonthKey
      ) {
        return false;
      }
      if (statusFilter !== "ALL" && r.status !== statusFilter) {
        return false;
      }
      if (q) {
        const matchesStore = r.store.name.toLowerCase().includes(q);
        const matchesItem = r.items.some(
          (it) =>
            it.rawName.toLowerCase().includes(q) ||
            it.suggestedName.toLowerCase().includes(q) ||
            (it.productName && it.productName.toLowerCase().includes(q))
        );
        if (!matchesStore && !matchesItem) return false;
      }
      return true;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortBy === "highest") return b.totalAmount - a.totalAmount;
      if (sortBy === "lowest") return a.totalAmount - b.totalAmount;
      return (
        new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()
      );
    });
    return sorted;
  }, [
    receipts,
    searchQuery,
    selectedStoreSlug,
    selectedMonthKey,
    statusFilter,
    sortBy,
  ]);

  const monthGroups = useMemo(() => {
    if (sortBy !== "newest") {
      return [
        {
          key: "sorted",
          label:
            sortBy === "highest"
              ? "Highest totals first"
              : "Lowest totals first",
          count: filteredReceipts.length,
          total: filteredReceipts.reduce((s, r) => s + r.totalAmount, 0),
          items: filteredReceipts,
        },
      ];
    }

    const groups: Array<{
      key: string;
      label: string;
      count: number;
      total: number;
      items: SerializedMyReceipt[];
    }> = [];
    const byKey = new Map<string, number>();

    filteredReceipts.forEach((r) => {
      const key = getUTCMonthKey(r.purchaseDate);
      const idx = byKey.get(key);
      if (idx === undefined) {
        byKey.set(key, groups.length);
        groups.push({
          key,
          label: formatMonthYear(r.purchaseDate),
          count: 1,
          total: r.totalAmount,
          items: [r],
        });
      } else {
        groups[idx].items.push(r);
        groups[idx].count += 1;
        groups[idx].total += r.totalAmount;
      }
    });

    return groups;
  }, [filteredReceipts, sortBy]);

  function openReceiptDrawer(receipt: SerializedMyReceipt) {
    if (receipt.status === "PROCESSING") {
      router.push(`/upload?receiptId=${receipt.id}`);
      return;
    }
    setSelectedReceiptId(receipt.id);
    setShowPhoto(false);
    setConfirmDeleteId(null);
    setDeleteError(null);
  }

  async function handleConfirmDelete(receiptId: string) {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await deleteReceiptAction(receiptId);
      if (!res.success) {
        setDeleteError(res.error || "Could not delete this receipt.");
        return;
      }
      setDeletedIds((prev) =>
        prev.includes(receiptId) ? prev : [...prev, receiptId]
      );
      setSelectedReceiptId(null);
      setConfirmDeleteId(null);
      router.refresh();
    } catch {
      setDeleteError("Could not delete this receipt. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedStoreSlug !== "all" ||
    selectedMonthKey !== "all" ||
    statusFilter !== "ALL";

  return (
    <div className="max-w-[1120px] mx-auto px-4 sm:px-6 py-7 sm:py-10 space-y-6">
      {/* Direct H1 Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="font-display font-bold text-[28px] sm:text-[34px] leading-tight text-[var(--text-primary)]">
            My receipts
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-[var(--text-muted)]">
            <span className="tabular-nums">
              {receipts.length}{" "}
              {receipts.length === 1 ? "receipt" : "receipts"} ·{" "}
              {formatCurrency(totalSpend)}
            </span>
            {diaConn && (
              <>
                <span aria-hidden="true">·</span>
                {diaConn.status === "ACTIVE" ||
                diaConn.status === "SYNCING" ||
                diaConn.status === "IDLE" ? (
                  <span className="inline-flex items-center gap-1.5 text-[var(--positive)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--positive)]" />
                    Dia auto-sync active
                    {diaConn.totalSyncedCount > 0
                      ? ` (${diaConn.totalSyncedCount})`
                      : ""}
                  </span>
                ) : isAdmin ? (
                  <Link
                    href="/admin/integrations"
                    className="inline-flex items-center gap-1.5 text-[var(--accent)] hover:underline font-medium"
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    Dia session needs renewal
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[var(--accent)]">
                    Dia session needs renewal
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ExportDataMenu label="Export CSV" />
        </div>
      </div>

      {receipts.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-6 py-14 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--primary-tint)] text-[var(--primary)] flex items-center justify-center mx-auto">
            <ReceiptText className="w-6 h-6" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="font-display font-semibold text-[20px] text-[var(--text-primary)]">
              No receipts uploaded yet
            </h2>
            <p className="text-[14px] text-[var(--text-muted)] leading-relaxed">
              Snap a supermarket till slip or upload a PDF receipt to start
              tracking prices, pack sizes, and monthly household spending.
            </p>
          </div>
          <div className="pt-1 flex justify-center">
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[14px] font-semibold whitespace-nowrap shrink-0 transition-colors"
            >
              <Camera className="w-4 h-4 shrink-0" />
              Add your first receipt
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Search + Store Filter + Sort Controls */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search supermarket or item on receipt..."
                  className="w-full h-10 pl-10 pr-9 rounded-full bg-[var(--bg-card)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {(statusCounts.review > 0 || statusCounts.failed > 0) && (
                  <select
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as StatusFilter)
                    }
                    aria-label="Filter by status"
                    className="h-10 px-3.5 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-[13px] font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                  >
                    <option value="ALL">All receipts</option>
                    {statusCounts.review > 0 && (
                      <option value="REVIEW">
                        Needs review ({statusCounts.review})
                      </option>
                    )}
                    <option value="CONFIRMED">Confirmed</option>
                    {statusCounts.failed > 0 && (
                      <option value="FAILED">
                        Failed ({statusCounts.failed})
                      </option>
                    )}
                  </select>
                )}

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  aria-label="Sort receipts"
                  className="h-10 px-3.5 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-[13px] font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                >
                  <option value="newest">Newest first</option>
                  <option value="highest">Highest total</option>
                  <option value="lowest">Lowest total</option>
                </select>
              </div>
            </div>

            {/* Store Filter Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              <button
                type="button"
                onClick={() => setSelectedStoreSlug("all")}
                className={`inline-flex items-center gap-2 h-8 px-3.5 rounded-full text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  selectedStoreSlug === "all"
                    ? "bg-[var(--text-primary)] text-[var(--bg-page)]"
                    : "bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                All stores
                <span
                  className={`tabular-nums ${
                    selectedStoreSlug === "all"
                      ? "opacity-80"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  {receipts.length}
                </span>
              </button>

              {storeTabs.map((st) => {
                const brand = getStoreBrand(st.slug || st.name, st.brandHex);
                const active = selectedStoreSlug === st.slug;
                return (
                  <button
                    key={st.slug}
                    type="button"
                    onClick={() =>
                      setSelectedStoreSlug(active ? "all" : st.slug)
                    }
                    className={`inline-flex items-center gap-2 h-8 px-3.5 rounded-full text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      active
                        ? "bg-[var(--text-primary)] text-[var(--bg-page)]"
                        : "bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: brand.color }}
                    />
                    {st.name}
                    <span
                      className={`tabular-nums ${
                        active ? "opacity-80" : "text-[var(--text-muted)]"
                      }`}
                    >
                      {st.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Monthly Spend Strip */}
          {monthlyStrip.length > 1 && (
            <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-1">
              {monthlyStrip.map((m) => {
                const active = selectedMonthKey === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() =>
                      setSelectedMonthKey(active ? "all" : m.key)
                    }
                    className={`min-w-[126px] text-left rounded-xl px-3.5 py-2.5 border transition-colors shrink-0 cursor-pointer ${
                      active
                        ? "border-[var(--primary)] bg-[var(--primary-tint)]"
                        : "border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <div className="text-[13px] text-[var(--text-muted)] flex items-center justify-between gap-2">
                      <span>{m.label}</span>
                      <span className="tabular-nums">{m.count}</span>
                    </div>
                    <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--text-primary)]">
                      {formatCurrency(m.total)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Month-Grouped Receipt Rows */}
          {filteredReceipts.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-6 py-12 text-center space-y-3">
              <p className="text-[15px] font-medium text-[var(--text-primary)]">
                No receipts match your filters
              </p>
              <p className="text-[13px] text-[var(--text-muted)]">
                Try clearing your search or choosing another supermarket.
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedStoreSlug("all");
                    setSelectedMonthKey("all");
                    setStatusFilter("ALL");
                  }}
                  className="inline-flex items-center justify-center h-9 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] text-[13px] font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-7">
              {monthGroups.map((group) => (
                <section key={group.key} className="space-y-2.5">
                  <div className="flex items-baseline justify-between gap-4 px-1">
                    <h2 className="font-display font-semibold text-[18px] text-[var(--text-primary)]">
                      {group.label}
                    </h2>
                    <span className="text-[13px] tabular-nums text-[var(--text-muted)]">
                      {group.count} {group.count === 1 ? "receipt" : "receipts"}{" "}
                      · {formatCurrency(group.total)}
                    </span>
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] divide-y divide-[var(--border)] overflow-hidden">
                    {group.items.map((receipt) => {
                      const brand = getStoreBrand(
                        receipt.store.slug || receipt.store.name,
                        receipt.store.brandHex
                      );
                      const statusInfo = getStatusLabel(receipt.status);
                      const isSelected = selectedReceiptId === receipt.id;

                      return (
                        <button
                          key={receipt.id}
                          type="button"
                          onClick={() => openReceiptDrawer(receipt)}
                          className={`w-full text-left px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-[var(--bg-subtle)]"
                              : "hover:bg-[var(--bg-subtle)]/70"
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <span
                              className="w-9 h-9 rounded-xl flex items-center justify-center text-[13px] font-bold shrink-0"
                              style={{
                                backgroundColor: brand.color,
                                color: brand.fg,
                              }}
                              aria-hidden="true"
                            >
                              {brand.monogram}
                            </span>

                            <div className="min-w-0 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="font-semibold text-[15px] text-[var(--text-primary)] truncate">
                                  {receipt.store.name}
                                </span>

                                {statusInfo.tone === "review" && (
                                  <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--accent)]">
                                    <Clock className="w-3.5 h-3.5 shrink-0" />
                                    {statusInfo.label}
                                  </span>
                                )}
                                {statusInfo.tone === "processing" && (
                                  <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--primary)]">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                    {statusInfo.label}
                                  </span>
                                )}
                                {statusInfo.tone === "failed" && (
                                  <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--negative)]">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    {statusInfo.label}
                                  </span>
                                )}
                              </div>

                              <div className="text-[13px] text-[var(--text-muted)] tabular-nums truncate">
                                {formatDate(receipt.purchaseDate)}
                                {" · "}
                                {receipt.itemCount}{" "}
                                {receipt.itemCount === 1 ? "item" : "items"}
                                {isAdmin && receipt.uploaderUsername
                                  ? ` · ${receipt.uploaderUsername}`
                                  : ""}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="font-semibold text-[15px] tabular-nums text-[var(--text-primary)]">
                              {receipt.totalAmount > 0
                                ? formatCurrency(receipt.totalAmount)
                                : "—"}
                            </span>
                            <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {/* Slide-over Receipt Detail Drawer */}
      {selectedReceipt && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedReceipt.store.name} receipt details`}
        >
          <div
            className="fixed inset-0 bg-[var(--scrim)] backdrop-blur-[2px]"
            onClick={() => {
              setSelectedReceiptId(null);
              setConfirmDeleteId(null);
            }}
          />

          <div className="relative z-10 w-full max-w-xl h-full bg-[var(--bg-card)] border-l border-[var(--border)] shadow-2xl flex flex-col">
            {/* Drawer Header */}
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {(() => {
                  const brand = getStoreBrand(
                    selectedReceipt.store.slug || selectedReceipt.store.name,
                    selectedReceipt.store.brandHex
                  );
                  return (
                    <span
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-[13px] font-bold shrink-0"
                      style={{
                        backgroundColor: brand.color,
                        color: brand.fg,
                      }}
                    >
                      {brand.monogram}
                    </span>
                  );
                })()}
                <div className="min-w-0">
                  <h2 className="font-display font-semibold text-[18px] text-[var(--text-primary)] truncate">
                    {selectedReceipt.store.name}
                  </h2>
                  <p className="text-[13px] text-[var(--text-muted)] tabular-nums">
                    {formatDate(selectedReceipt.purchaseDate)} ·{" "}
                    {formatCurrency(selectedReceipt.totalAmount)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedReceiptId(null);
                  setConfirmDeleteId(null);
                }}
                aria-label="Close receipt details"
                className="w-9 h-9 rounded-full hover:bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Scroll Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              {/* Review / Failed Notice */}
              {selectedReceipt.status === "REVIEW" && (
                <div className="rounded-xl bg-[var(--accent-tint)] border border-[var(--accent)]/30 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="text-[13px] text-[var(--text-primary)]">
                    <span className="font-semibold">Waiting for your review.</span>{" "}
                    Confirm items and pack sizes to add them to price tracking.
                  </div>
                  <Link
                    href={`/receipts/${selectedReceipt.id}/review`}
                    className="h-8 px-3.5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold inline-flex items-center whitespace-nowrap shrink-0"
                  >
                    Review now
                  </Link>
                </div>
              )}

              {selectedReceipt.status === "FAILED" && (
                <div className="rounded-xl bg-[var(--negative-tint)] border border-[var(--negative)]/30 px-4 py-3 text-[13px] text-[var(--text-primary)] space-y-1">
                  <div className="font-semibold text-[var(--negative)]">
                    Could not finish reading this receipt
                  </div>
                  {selectedReceipt.errorMessage && (
                    <p className="text-[var(--text-muted)]">
                      {selectedReceipt.errorMessage}
                    </p>
                  )}
                </div>
              )}

              {/* Photo Toggle Button */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowPhoto((prev) => !prev)}
                  className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)] text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <ImageIcon className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  {showPhoto
                    ? "Hide original receipt photo"
                    : "Show original receipt photo"}
                </button>

                {selectedReceipt.status === "CONFIRMED" && (
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-[var(--positive)]">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Confirmed
                  </span>
                )}
              </div>

              {/* Photo / Thermal Paper Fallback */}
              {showPhoto && (
                <div className="rounded-2xl border border-[var(--paper-rule)] bg-[var(--paper-bg)] p-4 text-[var(--paper-ink)] space-y-3">
                  {!photoFailedIds[selectedReceipt.id] ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/receipts/${selectedReceipt.id}/file?v=1`}
                        alt={`${selectedReceipt.store.name} original receipt`}
                        className="w-full max-h-[420px] object-contain rounded-lg mx-auto"
                        onError={() =>
                          setPhotoFailedIds((prev) => ({
                            ...prev,
                            [selectedReceipt.id]: true,
                          }))
                        }
                      />
                      <div className="flex justify-end">
                        <a
                          href={`/api/receipts/${selectedReceipt.id}/file?original=true`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--primary)] hover:underline"
                        >
                          Open full file
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3 py-2 text-[13px] text-[var(--paper-ink)]">
                      <div className="text-center border-b border-dashed border-[var(--paper-rule)] pb-3 space-y-0.5">
                        <div className="font-semibold text-[15px]">
                          {selectedReceipt.store.name}
                        </div>
                        <div className="text-[var(--paper-muted)] tabular-nums">
                          {formatDate(selectedReceipt.purchaseDate)} · Digital
                          receipt
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {selectedReceipt.items
                          .filter((it) => !it.excluded)
                          .map((it) => (
                            <div
                              key={it.id}
                              className="flex justify-between gap-3 tabular-nums"
                            >
                              <span className="truncate">
                                {it.quantity !== 1 ? `${it.quantity}× ` : ""}
                                {it.rawName}
                              </span>
                              <span className="shrink-0">
                                {formatCurrency(it.totalPrice)}
                              </span>
                            </div>
                          ))}
                      </div>
                      <div className="border-t border-dashed border-[var(--paper-rule)] pt-2.5 flex justify-between font-bold tabular-nums">
                        <span>Total</span>
                        <span>{formatCurrency(selectedReceipt.totalAmount)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Line Items */}
              <div className="space-y-2">
                <h3 className="font-display font-semibold text-[16px] text-[var(--text-primary)]">
                  Items purchased
                </h3>

                {selectedReceipt.items.length === 0 ? (
                  <p className="text-[13px] text-[var(--text-muted)] py-3">
                    No itemized lines saved on this receipt.
                  </p>
                ) : (
                  <div className="border-y border-[var(--border)] divide-y divide-[var(--border)]">
                    {selectedReceipt.items
                      .filter((it) => !it.isDiscount && !it.excluded)
                      .map((item) => {
                        const displayTitle =
                          item.productName || item.suggestedName || item.rawName;
                        return (
                          <div
                            key={item.id}
                            className="py-3 flex items-start justify-between gap-3"
                          >
                            <div className="min-w-0 space-y-0.5">
                              {item.productSlug ? (
                                <Link
                                  href={`/products/${item.productSlug}`}
                                  className="font-medium text-[14px] text-[var(--text-primary)] hover:text-[var(--primary)] hover:underline block truncate"
                                >
                                  {displayTitle}
                                </Link>
                              ) : (
                                <span className="font-medium text-[14px] text-[var(--text-primary)] block truncate">
                                  {displayTitle}
                                </span>
                              )}
                              <div className="text-[13px] text-[var(--text-muted)] tabular-nums">
                                {item.rawName !== displayTitle
                                  ? `${item.rawName} · `
                                  : ""}
                                {formatLineMeasure(
                                  item.unitMeasure,
                                  item.quantity,
                                  item.baseUnit
                                )}{" "}
                                ·{" "}
                                {formatUnitPrice(
                                  item.pricePerBaseUnit,
                                  item.baseUnit
                                )}
                              </div>
                            </div>

                            <span className="font-semibold text-[14px] tabular-nums text-[var(--text-primary)] shrink-0">
                              {formatCurrency(item.totalPrice)}
                            </span>
                          </div>
                        );
                      })}

                    {selectedReceipt.items
                      .filter((it) => it.isDiscount || it.excluded)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="py-2.5 flex items-center justify-between gap-3 text-[13px] text-[var(--text-muted)]"
                        >
                          <span className="truncate">
                            {item.suggestedName || item.rawName}
                          </span>
                          <span
                            className={`tabular-nums font-medium shrink-0 ${
                              item.totalPrice < 0
                                ? "text-[var(--positive)]"
                                : ""
                            }`}
                          >
                            {formatCurrency(item.totalPrice)}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Tax Breakdown */}
              {selectedReceipt.taxBreakdown &&
                selectedReceipt.taxBreakdown.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-display font-semibold text-[16px] text-[var(--text-primary)]">
                      VAT summary
                    </h3>
                    <div className="border-y border-[var(--border)] divide-y divide-[var(--border)]">
                      {selectedReceipt.taxBreakdown.map((t, idx) => (
                        <div
                          key={`${t.rate}-${idx}`}
                          className="py-2.5 flex items-center justify-between text-[13px] tabular-nums"
                        >
                          <span className="text-[var(--text-muted)]">
                            {t.rate}% VAT · Base {formatCurrency(t.baseAmount)}
                          </span>
                          <span className="font-medium text-[var(--text-primary)]">
                            {formatCurrency(t.taxAmount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            {/* Drawer Footer (Inline Delete Confirm Pinned In-Viewport) */}
            {confirmDeleteId === selectedReceipt.id ? (
              <div className="px-5 py-4 border-t border-[var(--negative)]/30 bg-[var(--negative-tint)] space-y-3 shrink-0">
                {deleteError && (
                  <div className="text-[13px] font-medium text-[var(--negative)]">
                    {deleteError}
                  </div>
                )}
                <p className="text-[13px] text-[var(--text-primary)]">
                  Remove this {selectedReceipt.store.name} receipt? All price
                  records from it will be deleted.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => handleConfirmDelete(selectedReceipt.id)}
                    className="h-9 px-4 rounded-full bg-[var(--negative)] text-[var(--negative-on)] text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                  >
                    {isDeleting && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    Yes, remove receipt
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => {
                      setConfirmDeleteId(null);
                      setDeleteError(null);
                    }}
                    className="h-9 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-5 py-4 border-t border-[var(--border)] bg-[var(--bg-page)]/60 flex items-center justify-between gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setConfirmDeleteId(selectedReceipt.id);
                  }}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-medium text-[var(--negative)] hover:bg-[var(--negative-tint)] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  Delete
                </button>

                <Link
                  href={`/receipts/${selectedReceipt.id}/review`}
                  className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[14px] font-semibold whitespace-nowrap shrink-0 transition-colors"
                >
                  <Pencil className="w-4 h-4 shrink-0" />
                  Edit receipt
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
