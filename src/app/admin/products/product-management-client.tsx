"use client";

import React, { useState, useMemo, useRef, useId } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Star,
  Pencil,
  GitMerge,
  Trash2,
  Sparkles,
  ArrowRight,
  X,
  Check,
  AlertCircle,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { CANONICAL_CATEGORIES } from "@/lib/ai/schema";
import {
  toggleProductStapleAction,
  updateProductAction,
  mergeProductsBatchAction,
  deleteProductAction,
  autoHealLegacyProductsAction,
} from "./actions";
import {
  computeNameSimilarity,
  findDuplicateProductGroups,
} from "@/lib/catalog/duplicates";
import { useNativeDialog } from "@/lib/ui/use-native-dialog";

export interface ManagedProduct {
  id: string;
  slug: string;
  displayName: string;
  category: string;
  baseUnit: "KG" | "L" | "UNIT";
  isStaple: boolean;
  sightingsCount: number;
  aliasesCount: number;
  nutriScore?: string | null;
  novaGroup?: number | null;
  proteinPer100g?: number | null;
  kcalPer100g?: number | null;
  ean?: string | null;
}

export function ProductManagementClient({
  initialProducts,
}: {
  initialProducts: ManagedProduct[];
}) {
  const router = useRouter();
  const [products, setProducts] = useState<ManagedProduct[]>(initialProducts);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [stapleFilter, setStapleFilter] = useState<"all" | "staple" | "non-staple">("all");

  // Feedback states
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isHealing, setIsHealing] = useState(false);

  // Suggested duplicate clusters & one-click merge state
  const [duplicatesExpanded, setDuplicatesExpanded] = useState(true);
  const [survivorOverrides, setSurvivorOverrides] = useState<Record<string, string>>({});
  const [mergingGroupKey, setMergingGroupKey] = useState<string | null>(null);

  // Multi-select bulk merge state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTargetId, setBulkTargetId] = useState<string>("");
  const [isBulkMerging, setIsBulkMerging] = useState(false);

  // Edit Modal State
  const [editingProduct, setEditingProduct] = useState<ManagedProduct | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("Other");
  const [editBaseUnit, setEditBaseUnit] = useState<"KG" | "L" | "UNIT">("UNIT");
  const [editIsStaple, setEditIsStaple] = useState(false);
  const [editNutriScore, setEditNutriScore] = useState("");
  const [editNovaGroup, setEditNovaGroup] = useState("");
  const [editProtein, setEditProtein] = useState("");
  const [editKcal, setEditKcal] = useState("");
  const [editEan, setEditEan] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Merge Modal State (native <dialog>)
  const [mergingSource, setMergingSource] = useState<ManagedProduct | null>(null);
  const [mergeTargetQuery, setMergeTargetQuery] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [isMerging, setIsMerging] = useState(false);
  const mergeDialogRef = useRef<HTMLDialogElement>(null);
  const mergeTitleId = useId();
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const editTitleId = useId();

  useNativeDialog(mergeDialogRef, Boolean(mergingSource), () => setMergingSource(null));
  useNativeDialog(editDialogRef, Boolean(editingProduct), () => setEditingProduct(null));

  // Delete State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Compute duplicate clusters dynamically from active product catalogue
  const duplicateGroups = useMemo(
    () => findDuplicateProductGroups(products),
    [products]
  );

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = p.displayName.toLowerCase().includes(q);
        const matchSlug = p.slug.toLowerCase().includes(q);
        const matchCat = p.category.toLowerCase().includes(q);
        const matchEan = (p.ean || "").toLowerCase().includes(q);
        if (!matchName && !matchSlug && !matchCat && !matchEan) return false;
      }

      if (categoryFilter !== "All" && p.category !== categoryFilter) {
        return false;
      }

      if (stapleFilter === "staple" && !p.isStaple) return false;
      if (stapleFilter === "non-staple" && p.isStaple) return false;

      return true;
    });
  }, [products, searchQuery, categoryFilter, stapleFilter]);

  // Selected products for bulk merge
  const selectedProducts = useMemo(() => {
    return products
      .filter((p) => selectedIds.has(p.id))
      .sort((a, b) => b.sightingsCount - a.sightingsCount);
  }, [products, selectedIds]);

  const effectiveBulkTargetId = useMemo(() => {
    if (selectedProducts.length === 0) return "";
    if (selectedProducts.some((p) => p.id === bulkTargetId)) return bulkTargetId;
    return selectedProducts[0].id;
  }, [selectedProducts, bulkTargetId]);

  // Merge target candidates ranked by name similarity to mergingSource
  const mergeCandidates = useMemo(() => {
    if (!mergingSource) return [];
    const q = mergeTargetQuery.toLowerCase().trim();
    return products
      .filter((p) => p.id !== mergingSource.id)
      .filter((p) => {
        if (!q) return true;
        return (
          p.displayName.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
        );
      })
      .map((p) => ({
        product: p,
        similarity: computeNameSimilarity(mergingSource.displayName, p.displayName),
      }))
      .sort((a, b) => {
        if (Math.abs(b.similarity - a.similarity) > 0.05) {
          return b.similarity - a.similarity;
        }
        return b.product.sightingsCount - a.product.sightingsCount;
      })
      .slice(0, 12);
  }, [products, mergingSource, mergeTargetQuery]);

  const selectedMergeTarget = useMemo(
    () => products.find((p) => p.id === mergeTargetId) || null,
    [products, mergeTargetId]
  );

  // Unified client state reconciliation after merging `sourceIds` into `targetId`
  const applyMergedState = (sourceIds: string[], targetId: string) => {
    const sourceSet = new Set(sourceIds);
    const mergedSources = products.filter((p) => sourceSet.has(p.id));
    const addedSightings = mergedSources.reduce((sum, s) => sum + s.sightingsCount, 0);
    const addedAliases = mergedSources.reduce((sum, s) => sum + s.aliasesCount, 0);
    const anyStaple = mergedSources.some((s) => s.isStaple);

    setProducts((prev) =>
      prev
        .filter((p) => !sourceSet.has(p.id))
        .map((p) =>
          p.id === targetId
            ? {
                ...p,
                isStaple: p.isStaple || anyStaple,
                sightingsCount: p.sightingsCount + addedSightings,
                aliasesCount: p.aliasesCount + addedAliases,
              }
            : p
        )
    );
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of sourceIds) next.delete(id);
      next.delete(targetId);
      return next;
    });
  };

  // 1-Tap Staple Toggle
  const handleToggleStaple = async (productId: string, currentVal: boolean) => {
    const nextVal = !currentVal;
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, isStaple: nextVal } : p))
    );

    const res = await toggleProductStapleAction(productId, nextVal);
    if (!res.success) {
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, isStaple: currentVal } : p))
      );
      setFeedback({ type: "error", message: res.error || "Failed to toggle staple." });
    }
  };

  // Open Edit Modal
  const openEditModal = (p: ManagedProduct) => {
    setEditingProduct(p);
    setEditName(p.displayName);
    setEditCategory(p.category);
    setEditBaseUnit(p.baseUnit);
    setEditIsStaple(p.isStaple);
    setEditNutriScore(p.nutriScore || "");
    setEditNovaGroup(p.novaGroup ? String(p.novaGroup) : "");
    setEditProtein(
      p.proteinPer100g !== null && p.proteinPer100g !== undefined
        ? String(p.proteinPer100g)
        : ""
    );
    setEditKcal(
      p.kcalPer100g !== null && p.kcalPer100g !== undefined
        ? String(p.kcalPer100g)
        : ""
    );
    setEditEan(p.ean || "");
  };

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setIsSavingEdit(true);
    setFeedback(null);

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

    const res = await updateProductAction(editingProduct.id, {
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
      setProducts((prev) =>
        prev.map((p) =>
          p.id === editingProduct.id
            ? {
                ...p,
                displayName: editName.trim(),
                category: editCategory,
                baseUnit: editBaseUnit,
                isStaple: editIsStaple,
                nutriScore: parsedNutri,
                novaGroup: parsedNova,
                proteinPer100g: parsedProtein,
                kcalPer100g: parsedKcal,
                ean: cleanEan,
              }
            : p
        )
      );
      setEditingProduct(null);
      setFeedback({ type: "success", message: `Updated "${editName.trim()}" successfully.` });
      router.refresh();
    } else {
      setFeedback({ type: "error", message: res.error || "Failed to update product." });
    }
    setIsSavingEdit(false);
  };

  // One-Click Suggested Duplicate Cluster Merge
  const handleMergeDuplicateGroup = async (
    groupKey: string,
    clusterProducts: ManagedProduct[],
    survivorId: string
  ) => {
    const sourceIds = clusterProducts
      .filter((p) => p.id !== survivorId)
      .map((p) => p.id);
    if (sourceIds.length === 0) return;

    setMergingGroupKey(groupKey);
    setFeedback(null);

    const res = await mergeProductsBatchAction(sourceIds, survivorId);
    if (res.success) {
      applyMergedState(sourceIds, survivorId);
      setFeedback({
        type: "success",
        message: res.message || "Merged duplicate products successfully.",
      });
      router.refresh();
    } else {
      setFeedback({ type: "error", message: res.error || "Failed to merge duplicates." });
    }
    setMergingGroupKey(null);
  };

  // Multi-select Bulk Merge
  const handleBulkMerge = async () => {
    if (selectedProducts.length < 2 || !effectiveBulkTargetId) return;
    const sourceIds = selectedProducts
      .filter((p) => p.id !== effectiveBulkTargetId)
      .map((p) => p.id);
    if (sourceIds.length === 0) return;

    setIsBulkMerging(true);
    setFeedback(null);

    const res = await mergeProductsBatchAction(sourceIds, effectiveBulkTargetId);
    if (res.success) {
      applyMergedState(sourceIds, effectiveBulkTargetId);
      setFeedback({
        type: "success",
        message: res.message || "Merged selected products successfully.",
      });
      router.refresh();
    } else {
      setFeedback({ type: "error", message: res.error || "Bulk merge failed." });
    }
    setIsBulkMerging(false);
  };

  // Open Single-Row Merge Modal
  const openMergeModal = (source: ManagedProduct) => {
    setMergingSource(source);
    setMergeTargetQuery("");
    setMergeTargetId("");
  };

  // Execute Single-Row Merge
  const handleExecuteMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergingSource || !mergeTargetId) return;
    setIsMerging(true);
    setFeedback(null);

    const targetProduct = products.find((p) => p.id === mergeTargetId);
    const res = await mergeProductsBatchAction([mergingSource.id], mergeTargetId);

    if (res.success) {
      applyMergedState([mergingSource.id], mergeTargetId);
      setMergingSource(null);
      setFeedback({
        type: "success",
        message:
          res.message ||
          `Merged "${mergingSource.displayName}" into "${targetProduct?.displayName}".`,
      });
      router.refresh();
    } else {
      setFeedback({ type: "error", message: res.error || "Failed to merge products." });
    }
    setIsMerging(false);
  };

  // Delete product
  const handleDeleteProduct = async (productId: string) => {
    setDeletingId(productId);
    const res = await deleteProductAction(productId);
    if (res.success) {
      setProducts((prev) => prev.filter((p) => p.id !== productId));
      setFeedback({ type: "success", message: "Product deleted successfully." });
    } else {
      setFeedback({ type: "error", message: res.error || "Could not delete product." });
    }
    setDeletingId(null);
  };

  // Auto-Heal Legacy Products
  const handleAutoHeal = async () => {
    if (!confirm("Run catalogue auto-healer? This will correct legacy UNIT mismatches on meat, produce, and liquids, and automatically flag staple groceries.")) {
      return;
    }
    setIsHealing(true);
    setFeedback(null);

    const res = await autoHealLegacyProductsAction();
    if (res.success) {
      setFeedback({ type: "success", message: res.message || "Catalogue healed successfully!" });
      setTimeout(() => window.location.reload(), 1500);
    } else {
      setFeedback({ type: "error", message: res.error || "Failed to heal catalogue." });
    }
    setIsHealing(false);
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Global Alert Notification */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/30 text-rose-400"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-zinc-400 hover:text-white whitespace-nowrap shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* One-Click Suggested Duplicate Clusters */}
      {duplicateGroups.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <button
            type="button"
            onClick={() => setDuplicatesExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between px-5 py-3.5 bg-amber-500/10 hover:bg-amber-500/15 text-amber-200 text-xs font-bold font-mono transition-colors"
          >
            <div className="flex items-center gap-2">
              <GitMerge className="w-4 h-4 text-amber-400 shrink-0" />
              <span>SUGGESTED DUPLICATE PRODUCTS</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 text-[11px] whitespace-nowrap shrink-0 tabular-nums">
                {duplicateGroups.length} {duplicateGroups.length === 1 ? "cluster" : "clusters"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-amber-300/80 whitespace-nowrap shrink-0">
              <span>{duplicatesExpanded ? "Hide" : "Review"}</span>
              {duplicatesExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {duplicatesExpanded && (
            <div className="p-4 space-y-3">
              <p className="text-xs text-zinc-400">
                Click any item in a cluster to designate it as the surviving canonical product, then merge all sightings and store aliases atomically in one click.
              </p>

              <div className="space-y-3">
                {duplicateGroups.slice(0, 8).map((group) => {
                  const chosenSurvivorId =
                    survivorOverrides[group.groupKey] &&
                    group.products.some((p) => p.id === survivorOverrides[group.groupKey])
                      ? survivorOverrides[group.groupKey]
                      : group.survivorId;
                  const survivor =
                    group.products.find((p) => p.id === chosenSurvivorId) ||
                    group.products[0];
                  const hasMismatch = group.products.some(
                    (p) => p.baseUnit !== survivor.baseUnit
                  );
                  const isGroupMerging = mergingGroupKey === group.groupKey;

                  return (
                    <div
                      key={group.groupKey}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                    >
                      <div className="space-y-2 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {group.products.map((p) => {
                            const isSurvivor = p.id === survivor.id;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() =>
                                  setSurvivorOverrides((prev) => ({
                                    ...prev,
                                    [group.groupKey]: p.id,
                                  }))
                                }
                                title={
                                  isSurvivor
                                    ? "Surviving product (click another to swap)"
                                    : "Click to make this product the survivor"
                                }
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                                  isSurvivor
                                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-bold"
                                    : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                                }`}
                              >
                                {isSurvivor && (
                                  <span className="text-[10px] font-mono uppercase text-emerald-400">
                                    Keep:
                                  </span>
                                )}
                                <span>{p.displayName}</span>
                                <span className="text-[10px] font-mono text-zinc-400">
                                  ({p.sightingsCount}·{p.aliasesCount}a·{p.baseUnit})
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {hasMismatch && (
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-amber-300">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              Base unit differs across duplicates — merged sightings will adopt {survivor.baseUnit}.
                            </span>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={isGroupMerging || mergingGroupKey !== null}
                        onClick={() =>
                          void handleMergeDuplicateGroup(
                            group.groupKey,
                            group.products as ManagedProduct[],
                            survivor.id
                          )
                        }
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
                      >
                        {isGroupMerging ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        ) : (
                          <GitMerge className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>
                          Merge {group.products.length - 1} into &ldquo;{survivor.displayName}&rdquo;
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Search products, slugs, or EAN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Staple Filter */}
          <div className="inline-flex rounded-xl p-1 bg-zinc-900 border border-zinc-800">
            <button
              type="button"
              onClick={() => setStapleFilter("all")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                stapleFilter === "all" ? "bg-zinc-800 text-emerald-400 shadow-sm" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              All ({products.length})
            </button>
            <button
              type="button"
              onClick={() => setStapleFilter("staple")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1 transition-all ${
                stapleFilter === "staple" ? "bg-zinc-800 text-amber-400 shadow-sm" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              <span>Staples ({products.filter((p) => p.isStaple).length})</span>
            </button>
            <button
              type="button"
              onClick={() => setStapleFilter("non-staple")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                stapleFilter === "non-staple" ? "bg-zinc-800 text-zinc-200 shadow-sm" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Regular ({products.filter((p) => !p.isStaple).length})
            </button>
          </div>

          {/* Category Dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
          >
            <option value="All">All Categories</option>
            {CANONICAL_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Auto-Heal Button */}
          <button
            type="button"
            onClick={handleAutoHeal}
            disabled={isHealing}
            className="px-3 py-2 rounded-xl bg-zinc-900 border border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400 hover:text-emerald-300 text-xs font-semibold shadow-sm inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
          >
            {isHealing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
            <span>Auto-Heal Catalogue</span>
          </button>
        </div>
      </div>

      {/* Multi-Select Bulk Merge Action Bar */}
      {selectedProducts.length >= 2 && (
        <div className="sticky top-20 z-30 rounded-2xl border border-emerald-500/40 bg-zinc-950/95 backdrop-blur-md p-3.5 shadow-2xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 font-mono font-bold whitespace-nowrap shrink-0 tabular-nums">
              {selectedProducts.length} selected
            </span>
            <span className="text-zinc-400">Surviving product:</span>
            <select
              value={effectiveBulkTargetId}
              onChange={(e) => setBulkTargetId(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white font-semibold focus:outline-none focus:border-emerald-500"
            >
              {selectedProducts.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.displayName} ({sp.sightingsCount} sightings · {sp.baseUnit})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 rounded-xl border border-zinc-800 text-xs text-zinc-400 hover:text-white whitespace-nowrap shrink-0"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => void handleBulkMerge()}
              disabled={isBulkMerging}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              {isBulkMerging ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <GitMerge className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>Merge {selectedProducts.length - 1} into Survivor</span>
            </button>
          </div>
        </div>
      )}

      {/* Products Table */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/80 text-zinc-400 font-mono uppercase text-[11px]">
                <th className="py-3 px-3 w-10 text-center">Sel</th>
                <th className="py-3 px-3 w-12 text-center">Staple</th>
                <th className="py-3 px-4">Canonical Product</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-center">Base Unit</th>
                <th className="py-3 px-4 text-right">Sightings</th>
                <th className="py-3 px-4 text-right">Aliases</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-sans">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-zinc-500 font-mono">
                    No matching products found.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-800/30 transition-colors group">
                    {/* Bulk Merge Select Checkbox */}
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleSelectRow(p.id)}
                        aria-label={`Select ${p.displayName} for merge`}
                        className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-950 text-emerald-500 cursor-pointer"
                      />
                    </td>

                    {/* Staple Toggle */}
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleStaple(p.id, p.isStaple)}
                        className={`p-1.5 rounded-lg transition-colors inline-flex items-center justify-center whitespace-nowrap shrink-0 ${
                          p.isStaple
                            ? "text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                            : "text-zinc-600 hover:text-amber-400 hover:bg-zinc-800"
                        }`}
                        title={p.isStaple ? "Remove from staple basket" : "Flag as everyday staple"}
                      >
                        <Star className={`w-4 h-4 ${p.isStaple ? "fill-amber-400" : ""}`} />
                      </button>
                    </td>

                    {/* Display Name & Slug */}
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <Link
                          href={`/products/${p.slug}`}
                          className="font-bold text-zinc-100 hover:text-emerald-400 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          <span>{p.displayName}</span>
                          <ArrowRight className="w-3 h-3 text-zinc-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
                        </Link>
                        <div className="text-[10px] font-mono text-zinc-500">
                          {p.slug}
                          {p.ean ? ` · EAN ${p.ean}` : ""}
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700/60 text-[10px] font-medium whitespace-nowrap shrink-0">
                        {p.category}
                      </span>
                    </td>

                    {/* Base Unit */}
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-zinc-800 text-emerald-400 border border-zinc-700/60 whitespace-nowrap shrink-0">
                        {p.baseUnit}
                      </span>
                    </td>

                    {/* Sightings */}
                    <td className="py-3 px-4 text-right font-mono font-bold text-zinc-200 tabular-nums">
                      {p.sightingsCount}
                    </td>

                    {/* Aliases */}
                    <td className="py-3 px-4 text-right font-mono text-zinc-400 tabular-nums">
                      {p.aliasesCount}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(p)}
                          className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors whitespace-nowrap shrink-0"
                          title="Edit Product"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openMergeModal(p)}
                          className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-emerald-500/20 text-zinc-300 hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0"
                          title="Merge into another product..."
                        >
                          <GitMerge className="w-3.5 h-3.5" />
                        </button>
                        {p.sightingsCount === 0 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(p.id)}
                            disabled={deletingId === p.id}
                            className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-rose-500/20 text-zinc-300 hover:text-rose-400 transition-colors whitespace-nowrap shrink-0"
                            title="Delete unused product"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Native <dialog> Edit Product Modal */}
      <dialog
        ref={editDialogRef}
        aria-labelledby={editTitleId}
        className="m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-3xl border border-zinc-800 bg-zinc-950 text-zinc-100 p-0 shadow-2xl backdrop:bg-black/80 backdrop:backdrop-blur-sm"
      >
        {editingProduct && (
          <div className="p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h1 id={editTitleId} className="text-base font-bold text-white">
                    Edit Product
                  </h1>
                  <p className="text-xs text-zinc-400">Canonical catalogue entry</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => editDialogRef.current?.close("cancel")}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white whitespace-nowrap shrink-0"
                aria-label="Close edit dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Display Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-emerald-500"
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
                        className={`py-1.5 text-xs font-bold rounded-lg whitespace-nowrap shrink-0 transition-all ${
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
                    className="w-4 h-4 rounded border-zinc-700 text-emerald-500 bg-zinc-950"
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

              {/* Optional Nutrition & Barcode Fields */}
              <div className="pt-2 border-t border-zinc-800/80 space-y-2.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Nutrition & Barcode Cache (Optional)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="text-[10px] font-mono text-zinc-500">Nutri-Score</label>
                    <select
                      value={editNutriScore}
                      onChange={(e) => setEditNutriScore(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white"
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
                    <label className="text-[10px] font-mono text-zinc-500">NOVA</label>
                    <select
                      value={editNovaGroup}
                      onChange={(e) => setEditNovaGroup(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white"
                    >
                      <option value="">—</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-zinc-500">Prot/100g</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={editProtein}
                      onChange={(e) => setEditProtein(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-white tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-zinc-500">kcal/100g</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="1000"
                      value={editKcal}
                      onChange={(e) => setEditKcal(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-white tabular-nums"
                    />
                  </div>
                </div>
                <input
                  type="text"
                  value={editEan}
                  onChange={(e) => setEditEan(e.target.value)}
                  placeholder="Optional EAN / Barcode"
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-white tabular-nums"
                />
              </div>

              <div className="pt-4 border-t border-zinc-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => editDialogRef.current?.close("cancel")}
                  disabled={isSavingEdit}
                  className="px-4 py-2 rounded-xl border border-zinc-800 text-xs text-zinc-400 hover:bg-zinc-900 whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold shadow-md shadow-emerald-500/20 inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                >
                  {isSavingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </dialog>

      {/* Native <dialog> Merge Duplicate Product Modal */}
      <dialog
        ref={mergeDialogRef}
        aria-labelledby={mergeTitleId}
        className="m-auto w-[calc(100%-1.5rem)] max-w-xl rounded-3xl border border-zinc-800 bg-zinc-950 text-zinc-100 p-0 shadow-2xl backdrop:bg-black/80 backdrop:backdrop-blur-sm"
      >
        {mergingSource && (
          <div className="p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <GitMerge className="w-4 h-4" />
                </div>
                <div>
                  <h1 id={mergeTitleId} className="text-base font-bold text-white">
                    Merge Duplicate Product
                  </h1>
                  <p className="text-xs text-zinc-400">
                    Reassigns all sightings and POS aliases in one transaction
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => mergeDialogRef.current?.close("cancel")}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white whitespace-nowrap shrink-0"
                aria-label="Close merge dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Source Product Info */}
            <div className="p-4 rounded-2xl border border-rose-500/20 bg-rose-500/5 space-y-1">
              <div className="text-[10px] font-mono text-rose-400 uppercase font-semibold">
                Product to be Deleted (Source)
              </div>
              <div className="text-sm font-bold text-white">{mergingSource.displayName}</div>
              <div className="text-[11px] font-mono text-zinc-400 tabular-nums">
                {mergingSource.sightingsCount} sightings · {mergingSource.aliasesCount} aliases ·{" "}
                {mergingSource.category} · {mergingSource.baseUnit}
              </div>
            </div>

            <form onSubmit={handleExecuteMerge} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300">
                  Select Surviving Product (Ranked by similarity)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                    <Search className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search target product name..."
                    value={mergeTargetQuery}
                    onChange={(e) => setMergeTargetQuery(e.target.value)}
                    autoFocus
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Candidate Selection List */}
                <div className="max-h-52 overflow-y-auto rounded-xl border border-zinc-800 divide-y divide-zinc-800/60 bg-zinc-900/60 p-1">
                  {mergeCandidates.length === 0 ? (
                    <div className="p-4 text-center text-xs text-zinc-500 font-mono">
                      No matching candidate products.
                    </div>
                  ) : (
                    mergeCandidates.map(({ product: c, similarity }) => {
                      const isSelected = mergeTargetId === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setMergeTargetId(c.id)}
                          className={`w-full text-left p-2.5 rounded-lg transition-colors flex items-center justify-between gap-2 ${
                            isSelected
                              ? "bg-emerald-500/20 border border-emerald-500/40 text-white"
                              : "hover:bg-zinc-800/60 text-zinc-300"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-xs text-zinc-100 flex items-center gap-1.5 truncate">
                              <span className="truncate">{c.displayName}</span>
                              {c.isStaple && <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />}
                              {similarity >= 0.6 && (
                                <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 font-mono text-[10px] whitespace-nowrap shrink-0">
                                  {Math.round(similarity * 100)}% match
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-zinc-500 tabular-nums">
                              {c.category} · {c.baseUnit} · {c.sightingsCount} sightings · {c.aliasesCount} aliases
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {selectedMergeTarget &&
                selectedMergeTarget.baseUnit !== mergingSource.baseUnit && (
                  <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-[11px] font-mono text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Base unit mismatch ({mergingSource.baseUnit} → {selectedMergeTarget.baseUnit}). Reassigned sightings will adopt {selectedMergeTarget.baseUnit}.
                    </span>
                  </div>
                )}

              <div className="pt-4 border-t border-zinc-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => mergeDialogRef.current?.close("cancel")}
                  disabled={isMerging}
                  className="px-4 py-2 rounded-xl border border-zinc-800 text-xs text-zinc-400 hover:bg-zinc-900 whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!mergeTargetId || isMerging}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold shadow-md shadow-emerald-500/20 inline-flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  {isMerging && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm Merge</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </dialog>
    </div>
  );
}
