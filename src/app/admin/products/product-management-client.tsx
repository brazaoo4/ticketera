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
  X,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Wand2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { CANONICAL_CATEGORIES } from "@/lib/ai/schema";
import { normalizeUnit } from "@/lib/format";
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
  const [stapleFilter, setStapleFilter] = useState<
    "all" | "staple" | "non-staple"
  >("all");

  // Suggested duplicate clusters & bulk merge state
  const [duplicatesExpanded, setDuplicatesExpanded] = useState(true);
  const [survivorOverrides, setSurvivorOverrides] = useState<
    Record<string, string>
  >({});
  const [mergingGroupKey, setMergingGroupKey] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTargetId, setBulkTargetId] = useState<string>("");
  const [isBulkMerging, setIsBulkMerging] = useState(false);

  const [editTarget, setEditTarget] = useState<ManagedProduct | null>(null);
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

  const [mergeSource, setMergeSource] = useState<ManagedProduct | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [mergeSearch, setMergeSearch] = useState("");
  const [isMerging, setIsMerging] = useState(false);

  const editDialogRef = useRef<HTMLDialogElement>(null);
  const editTitleId = useId();
  const mergeDialogRef = useRef<HTMLDialogElement>(null);
  const mergeTitleId = useId();

  useNativeDialog(editDialogRef, Boolean(editTarget), () =>
    setEditTarget(null)
  );
  useNativeDialog(mergeDialogRef, Boolean(mergeSource), () =>
    setMergeSource(null)
  );

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingStapleId, setTogglingStapleId] = useState<string | null>(null);

  const [showHealConfirm, setShowHealConfirm] = useState(false);
  const [isHealing, setIsHealing] = useState(false);

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const duplicateGroups = useMemo(
    () => findDuplicateProductGroups(products),
    [products]
  );

  const categories = useMemo(() => {
    const set = new Set<string>(CANONICAL_CATEGORIES);
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ["All", ...Array.from(set).sort()];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== "All" && p.category !== categoryFilter) {
        return false;
      }
      if (stapleFilter === "staple" && !p.isStaple) return false;
      if (stapleFilter === "non-staple" && p.isStaple) return false;
      if (
        q &&
        !p.displayName.toLowerCase().includes(q) &&
        !p.category.toLowerCase().includes(q) &&
        !(p.ean || "").toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [products, searchQuery, categoryFilter, stapleFilter]);

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

  const mergeCandidates = useMemo(() => {
    if (!mergeSource) return [];
    const q = mergeSearch.trim().toLowerCase();
    return products
      .filter((p) => p.id !== mergeSource.id)
      .filter((p) =>
        q
          ? p.displayName.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q)
          : true
      )
      .map((p) => ({
        product: p,
        similarity: computeNameSimilarity(mergeSource.displayName, p.displayName),
      }))
      .sort((a, b) => {
        if (Math.abs(b.similarity - a.similarity) > 0.05) {
          return b.similarity - a.similarity;
        }
        return b.product.sightingsCount - a.product.sightingsCount;
      })
      .slice(0, 24);
  }, [products, mergeSource, mergeSearch]);

  const selectedMergeTarget = useMemo(
    () => products.find((p) => p.id === mergeTargetId) || null,
    [products, mergeTargetId]
  );

  function applyMergedState(sourceIds: string[], targetId: string) {
    const sourceSet = new Set(sourceIds);
    const mergedSources = products.filter((p) => sourceSet.has(p.id));
    const addedSightings = mergedSources.reduce(
      (sum, s) => sum + s.sightingsCount,
      0
    );
    const addedAliases = mergedSources.reduce(
      (sum, s) => sum + s.aliasesCount,
      0
    );
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
  }

  function toggleSelectRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleToggleStaple(product: ManagedProduct) {
    const nextVal = !product.isStaple;
    setTogglingStapleId(product.id);
    setFeedback(null);
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, isStaple: nextVal } : p))
    );

    try {
      const res = await toggleProductStapleAction(product.id, nextVal);
      if (!res.success) {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === product.id ? { ...p, isStaple: !nextVal } : p
          )
        );
        setFeedback({
          type: "error",
          text: res.error || "Could not update staple setting.",
        });
      } else {
        router.refresh();
      }
    } catch {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id ? { ...p, isStaple: !nextVal } : p
        )
      );
      setFeedback({
        type: "error",
        text: "Could not update staple setting.",
      });
    } finally {
      setTogglingStapleId(null);
    }
  }

  function openEditModal(product: ManagedProduct) {
    setEditTarget(product);
    setEditName(product.displayName);
    setEditCategory(product.category || "Other");
    setEditBaseUnit(product.baseUnit);
    setEditIsStaple(product.isStaple);
    setEditNutriScore(product.nutriScore || "");
    setEditNovaGroup(product.novaGroup ? String(product.novaGroup) : "");
    setEditProtein(
      product.proteinPer100g !== null && product.proteinPer100g !== undefined
        ? String(product.proteinPer100g)
        : ""
    );
    setEditKcal(
      product.kcalPer100g !== null && product.kcalPer100g !== undefined
        ? String(product.kcalPer100g)
        : ""
    );
    setEditEan(product.ean || "");
    setFeedback(null);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget || !editName.trim()) return;

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

    setIsSavingEdit(true);
    setFeedback(null);
    try {
      const res = await updateProductAction(editTarget.id, {
        displayName: editName.trim(),
        category: editCategory,
        baseUnit: editBaseUnit,
        isStaple: editIsStaple,
        nutriScore: parsedNutri,
        novaGroup: parsedNova,
        proteinPer100g: parsedProtein,
        kcalPer100g: parsedKcal,
        ean: cleanEan,
      });
      if (!res.success) {
        setFeedback({
          type: "error",
          text: res.error || "Could not save product changes.",
        });
        return;
      }

      setProducts((prev) =>
        prev.map((p) =>
          p.id === editTarget.id
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
      setFeedback({
        type: "success",
        text: `Updated ${editName.trim()}.`,
      });
      setEditTarget(null);
      router.refresh();
    } catch {
      setFeedback({
        type: "error",
        text: "Could not save product changes.",
      });
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleMergeDuplicateGroup(
    groupKey: string,
    clusterProducts: ManagedProduct[],
    survivorId: string
  ) {
    const sourceIds = clusterProducts
      .filter((p) => p.id !== survivorId)
      .map((p) => p.id);
    if (sourceIds.length === 0) return;

    setMergingGroupKey(groupKey);
    setFeedback(null);
    try {
      const res = await mergeProductsBatchAction(sourceIds, survivorId);
      if (res.success) {
        applyMergedState(sourceIds, survivorId);
        setFeedback({
          type: "success",
          text: res.message || "Merged duplicate products.",
        });
        router.refresh();
      } else {
        setFeedback({
          type: "error",
          text: res.error || "Could not merge duplicate products.",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        text: "Could not merge duplicate products right now.",
      });
    } finally {
      setMergingGroupKey(null);
    }
  }

  async function handleBulkMerge() {
    if (selectedProducts.length < 2 || !effectiveBulkTargetId) return;
    const sourceIds = selectedProducts
      .filter((p) => p.id !== effectiveBulkTargetId)
      .map((p) => p.id);
    if (sourceIds.length === 0) return;

    setIsBulkMerging(true);
    setFeedback(null);
    try {
      const res = await mergeProductsBatchAction(
        sourceIds,
        effectiveBulkTargetId
      );
      if (res.success) {
        applyMergedState(sourceIds, effectiveBulkTargetId);
        setFeedback({
          type: "success",
          text: res.message || "Merged selected products.",
        });
        router.refresh();
      } else {
        setFeedback({
          type: "error",
          text: res.error || "Could not merge selected products.",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        text: "Could not merge selected products right now.",
      });
    } finally {
      setIsBulkMerging(false);
    }
  }

  async function handleConfirmMerge(e: React.FormEvent) {
    e.preventDefault();
    if (!mergeSource || !mergeTargetId) return;

    setIsMerging(true);
    setFeedback(null);
    try {
      const res = await mergeProductsBatchAction([mergeSource.id], mergeTargetId);
      if (!res.success) {
        setFeedback({
          type: "error",
          text: res.error || "Could not merge products.",
        });
        return;
      }

      const targetProd = products.find((p) => p.id === mergeTargetId);
      applyMergedState([mergeSource.id], mergeTargetId);
      setFeedback({
        type: "success",
        text:
          res.message ||
          `Merged "${mergeSource.displayName}" into "${
            targetProd?.displayName || "selected product"
          }".`,
      });
      setMergeSource(null);
      setMergeTargetId("");
      setMergeSearch("");
      router.refresh();
    } catch {
      setFeedback({
        type: "error",
        text: "Could not merge products right now.",
      });
    } finally {
      setIsMerging(false);
    }
  }

  async function handleConfirmDelete(product: ManagedProduct) {
    setDeletingId(product.id);
    setFeedback(null);
    try {
      const res = await deleteProductAction(product.id);
      if (!res.success) {
        setFeedback({
          type: "error",
          text: res.error || "Could not delete this product.",
        });
        return;
      }
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      setConfirmDeleteId(null);
      setFeedback({
        type: "success",
        text: `Removed "${product.displayName}" from the catalogue.`,
      });
      router.refresh();
    } catch {
      setFeedback({
        type: "error",
        text: "Could not delete this product right now.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRunCleanUp() {
    setIsHealing(true);
    setFeedback(null);
    try {
      const res = await autoHealLegacyProductsAction();
      if (!res.success) {
        setFeedback({
          type: "error",
          text: res.error || "Could not run catalogue clean-up.",
        });
        return;
      }
      setShowHealConfirm(false);
      setFeedback({
        type: "success",
        text:
          ("message" in res && res.message) ||
          "Updated pack units and staple tags across your grocery catalogue.",
      });
      router.refresh();
    } catch {
      setFeedback({
        type: "error",
        text: "Could not run catalogue clean-up.",
      });
    } finally {
      setIsHealing(false);
    }
  }

  return (
    <div className="space-y-5">
      {feedback && (
        <div
          role={feedback.type === "error" ? "alert" : "status"}
          className={`rounded-2xl border px-4 py-3 flex items-center justify-between gap-3 text-[14px] ${
            feedback.type === "error"
              ? "border-[var(--negative)]/30 bg-[var(--negative-tint)] text-[var(--negative)]"
              : "border-[var(--positive)]/30 bg-[var(--positive-tint)] text-[var(--positive)]"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === "error" ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss notification"
            className="p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Suggested Duplicate Products (One-Click Cluster Merge) */}
      {duplicateGroups.length > 0 && (
        <section className="rounded-2xl border border-[var(--accent)]/35 bg-[var(--accent-tint)]/55 overflow-hidden">
          <button
            type="button"
            onClick={() => setDuplicatesExpanded((prev) => !prev)}
            className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[var(--accent-tint)] transition-colors cursor-pointer"
          >
            <div className="flex flex-wrap items-center gap-2.5">
              <GitMerge className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <span className="font-display font-semibold text-[15px] text-[var(--text-primary)]">
                Possible duplicate groceries
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-[13px] font-medium text-[var(--text-primary)] tabular-nums whitespace-nowrap shrink-0">
                {duplicateGroups.length}{" "}
                {duplicateGroups.length === 1 ? "group" : "groups"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-muted)] whitespace-nowrap shrink-0">
              <span>{duplicatesExpanded ? "Hide" : "Review"}</span>
              {duplicatesExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </div>
          </button>

          {duplicatesExpanded && (
            <div className="px-5 pb-5 pt-3 border-t border-[var(--border)] space-y-3 bg-[var(--bg-card)]/60">
              <p className="text-[13px] text-[var(--text-muted)]">
                Choose the product name you want to keep in each group, then
                combine its purchases and receipt matches in one click.
              </p>

              <div className="space-y-2.5">
                {duplicateGroups.slice(0, 8).map((group) => {
                  const chosenSurvivorId =
                    survivorOverrides[group.groupKey] &&
                    group.products.some(
                      (p) => p.id === survivorOverrides[group.groupKey]
                    )
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
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
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
                                    ? "Main item to keep"
                                    : "Click to keep this name instead"
                                }
                                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[13px] transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
                                  isSurvivor
                                    ? "bg-[var(--primary-tint)] border-[var(--primary)]/40 text-[var(--primary)] font-semibold"
                                    : "bg-[var(--bg-page)] border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                                }`}
                              >
                                {isSurvivor && (
                                  <span className="font-semibold">Keep:</span>
                                )}
                                <span>{p.displayName}</span>
                                <span className="text-[var(--text-muted)] font-normal">
                                  ({p.sightingsCount} ·{" "}
                                  {normalizeUnit(p.baseUnit)})
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {hasMismatch && (
                          <div className="flex items-center gap-1.5 text-[13px] text-[var(--accent)]">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>
                              Units differ across these entries — merged
                              purchases will use{" "}
                              {normalizeUnit(survivor.baseUnit)}.
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
                        className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {isGroupMerging ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        ) : (
                          <GitMerge className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>
                          Merge {group.products.length - 1} into &ldquo;
                          {survivor.displayName}&rdquo;
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products, categories, or EAN..."
              className="w-full h-10 pl-10 pr-8 rounded-full bg-[var(--bg-card)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="h-10 px-3.5 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-[13px] font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "All" ? "All categories" : c}
              </option>
            ))}
          </select>

          <select
            value={stapleFilter}
            onChange={(e) =>
              setStapleFilter(
                e.target.value as "all" | "staple" | "non-staple"
              )
            }
            aria-label="Filter by staple status"
            className="h-10 px-3.5 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-[13px] font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
          >
            <option value="all">All products</option>
            <option value="staple">Staples only</option>
            <option value="non-staple">Non-staples</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => setShowHealConfirm((prev) => !prev)}
          className="h-10 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-strong)] text-[13px] font-medium text-[var(--text-primary)] inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Wand2 className="w-4 h-4 text-[var(--primary)] shrink-0" />
          Fix units and staples
        </button>
      </div>

      {/* Inline Confirm for Catalogue Clean-up */}
      {showHealConfirm && (
        <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[13px] text-[var(--text-primary)]">
            Check all products for weight/volume unit mismatches and tag common
            essentials as household staples?
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isHealing}
              onClick={handleRunCleanUp}
              className="h-9 px-4 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isHealing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Run clean-up
            </button>
            <button
              type="button"
              onClick={() => setShowHealConfirm(false)}
              className="h-9 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Multi-Select Bulk Merge Action Bar */}
      {selectedProducts.length >= 2 && (
        <div className="sticky top-[74px] z-30 rounded-2xl border border-[var(--primary)]/35 bg-[var(--bg-card)]/95 backdrop-blur-md p-4 shadow-[var(--shadow-soft)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 text-[13px]">
            <span className="px-3 py-1 rounded-full bg-[var(--primary-tint)] text-[var(--primary)] font-semibold whitespace-nowrap shrink-0 tabular-nums">
              {selectedProducts.length} selected
            </span>
            <span className="text-[var(--text-muted)]">Keep product:</span>
            <select
              value={effectiveBulkTargetId}
              onChange={(e) => setBulkTargetId(e.target.value)}
              aria-label="Choose product to keep in bulk merge"
              className="h-9 px-3 rounded-full bg-[var(--bg-page)] border border-[var(--border)] text-[13px] font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
            >
              {selectedProducts.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.displayName} ({sp.sightingsCount} ·{" "}
                  {normalizeUnit(sp.baseUnit)})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="h-9 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => void handleBulkMerge()}
              disabled={isBulkMerging}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
            >
              {isBulkMerging ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <GitMerge className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>Merge {selectedProducts.length - 1} selected</span>
            </button>
          </div>
        </div>
      )}

      {filteredProducts.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-6 py-12 text-center text-[14px] text-[var(--text-muted)]">
          No grocery items match your filters.
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
            <table className="w-full text-left border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-[13px] text-[var(--text-muted)]">
                  <th className="py-3.5 pl-5 pr-2 w-10 font-medium">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="py-3.5 px-3 font-medium">Product</th>
                  <th className="py-3.5 px-4 font-medium">Category</th>
                  <th className="py-3.5 px-4 font-medium">Unit</th>
                  <th className="py-3.5 px-4 font-medium text-right">
                    Purchases
                  </th>
                  <th className="py-3.5 px-4 font-medium text-right">
                    Receipt matches
                  </th>
                  <th className="py-3.5 px-5 font-medium text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredProducts.map((product) => {
                  const isDeleting = deletingId === product.id;
                  const confirmingDel = confirmDeleteId === product.id;

                  return (
                    <React.Fragment key={product.id}>
                      <tr className="hover:bg-[var(--bg-subtle)]/50 transition-colors">
                        <td className="py-3.5 pl-5 pr-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(product.id)}
                            onChange={() => toggleSelectRow(product.id)}
                            aria-label={`Select ${product.displayName} for merge`}
                            className="w-4 h-4 rounded accent-[var(--primary)] cursor-pointer"
                          />
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <button
                              type="button"
                              disabled={togglingStapleId === product.id}
                              onClick={() => handleToggleStaple(product)}
                              title={
                                product.isStaple
                                  ? "Remove from household staples"
                                  : "Mark as household staple"
                              }
                              aria-label={`Toggle staple status for ${product.displayName}`}
                              className={`p-1 rounded-lg hover:bg-[var(--bg-subtle)] shrink-0 cursor-pointer ${
                                product.isStaple
                                  ? "text-[var(--accent)]"
                                  : "text-[var(--text-muted)]/50 hover:text-[var(--text-muted)]"
                              }`}
                            >
                              <Star
                                className={`w-4 h-4 ${
                                  product.isStaple ? "fill-current" : ""
                                }`}
                              />
                            </button>
                            <div className="min-w-0">
                              <Link
                                href={`/products/${product.slug}`}
                                className="font-semibold text-[var(--text-primary)] hover:text-[var(--primary)] hover:underline truncate block"
                              >
                                {product.displayName}
                              </Link>
                              {product.ean && (
                                <div className="text-[13px] text-[var(--text-muted)] tabular-nums">
                                  EAN {product.ean}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-[13px] text-[var(--text-muted)]">
                          {product.category}
                        </td>
                        <td className="py-3.5 px-4 text-[13px] text-[var(--text-primary)]">
                          Per {normalizeUnit(product.baseUnit)}
                        </td>
                        <td className="py-3.5 px-4 text-right tabular-nums text-[var(--text-primary)]">
                          {product.sightingsCount}
                        </td>
                        <td className="py-3.5 px-4 text-right tabular-nums text-[var(--text-muted)]">
                          {product.aliasesCount}
                        </td>
                        <td className="py-3.5 px-5 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditModal(product)}
                              className="h-8 px-3 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)] text-[13px] font-medium text-[var(--text-primary)] inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMergeSource(product);
                                setMergeTargetId("");
                                setMergeSearch("");
                              }}
                              className="h-8 px-3 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)] text-[13px] font-medium text-[var(--text-primary)] inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <GitMerge className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                              Merge
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmDeleteId(
                                  confirmingDel ? null : product.id
                                )
                              }
                              aria-label={`Delete ${product.displayName}`}
                              className="w-8 h-8 rounded-full hover:bg-[var(--negative-tint)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--negative)] cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {confirmingDel && (
                        <tr className="bg-[var(--negative-tint)]/70">
                          <td colSpan={7} className="px-5 py-3">
                            <div className="flex items-center justify-between gap-3 text-[13px]">
                              <span className="text-[var(--text-primary)]">
                                Remove &ldquo;{product.displayName}&rdquo; from
                                the catalogue? Existing receipt lines stay intact
                                but unlinked.
                              </span>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  disabled={isDeleting}
                                  onClick={() => handleConfirmDelete(product)}
                                  className="h-8 px-3.5 rounded-full bg-[var(--negative)] text-[var(--negative-on)] text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  {isDeleting && (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  )}
                                  Yes, delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="h-8 px-3.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Product Cards */}
          <div className="md:hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] divide-y divide-[var(--border)] overflow-hidden">
            {filteredProducts.map((product) => {
              const confirmingDel = confirmDeleteId === product.id;
              const isDeleting = deletingId === product.id;

              return (
                <div key={product.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.id)}
                        onChange={() => toggleSelectRow(product.id)}
                        aria-label={`Select ${product.displayName} for merge`}
                        className="w-4 h-4 rounded mt-1 accent-[var(--primary)] shrink-0 cursor-pointer"
                      />
                      <button
                        type="button"
                        disabled={togglingStapleId === product.id}
                        onClick={() => handleToggleStaple(product)}
                        aria-label={`Toggle staple status for ${product.displayName}`}
                        className={`p-1 rounded-lg mt-0.5 shrink-0 cursor-pointer ${
                          product.isStaple
                            ? "text-[var(--accent)]"
                            : "text-[var(--text-muted)]/50"
                        }`}
                      >
                        <Star
                          className={`w-4 h-4 ${
                            product.isStaple ? "fill-current" : ""
                          }`}
                        />
                      </button>

                      <div className="min-w-0 space-y-0.5">
                        <Link
                          href={`/products/${product.slug}`}
                          className="font-semibold text-[15px] text-[var(--text-primary)] hover:text-[var(--primary)] block truncate"
                        >
                          {product.displayName}
                        </Link>
                        <div className="text-[13px] text-[var(--text-muted)] tabular-nums">
                          {product.category} · Per{" "}
                          {normalizeUnit(product.baseUnit)} ·{" "}
                          {product.sightingsCount}{" "}
                          {product.sightingsCount === 1
                            ? "purchase"
                            : "purchases"}
                          {product.ean ? ` · EAN ${product.ean}` : ""}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(product)}
                      className="h-9 px-3.5 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] text-[13px] font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMergeSource(product);
                        setMergeTargetId("");
                        setMergeSearch("");
                      }}
                      className="h-9 px-3.5 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] text-[13px] font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <GitMerge className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                      Merge
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmDeleteId(confirmingDel ? null : product.id)
                      }
                      className="h-9 px-3.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--negative)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>

                  {confirmingDel && (
                    <div className="rounded-xl bg-[var(--negative-tint)] p-3 space-y-2 text-[13px]">
                      <p className="text-[var(--text-primary)]">
                        Delete &ldquo;{product.displayName}&rdquo; from
                        catalogue?
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => handleConfirmDelete(product)}
                          className="h-8 px-3.5 rounded-full bg-[var(--negative)] text-[var(--negative-on)] text-[13px] font-semibold cursor-pointer"
                        >
                          Yes, delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="h-8 px-3.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Native <dialog> Edit Product Modal */}
      <dialog
        ref={editDialogRef}
        aria-labelledby={editTitleId}
        className="m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] p-0 shadow-2xl backdrop:bg-[var(--scrim)] backdrop:backdrop-blur-[2px]"
      >
        {editTarget && (
          <div className="p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3">
              <h2
                id={editTitleId}
                className="font-display font-semibold text-[20px] text-[var(--text-primary)]"
              >
                Edit product
              </h2>
              <button
                type="button"
                onClick={() => editDialogRef.current?.close("cancel")}
                aria-label="Close"
                className="w-8 h-8 rounded-full hover:bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-muted)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-[var(--text-primary)]">
                  Product name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] text-[var(--text-primary)] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-medium text-[var(--text-primary)]">
                    Category
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] text-[var(--text-primary)] focus:outline-none"
                  >
                    {CANONICAL_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[13px] font-medium text-[var(--text-primary)]">
                    Tracked unit
                  </label>
                  <select
                    value={editBaseUnit}
                    onChange={(e) =>
                      setEditBaseUnit(e.target.value as "KG" | "L" | "UNIT")
                    }
                    className="w-full h-10 px-3 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] text-[var(--text-primary)] focus:outline-none"
                  >
                    <option value="KG">Per kg</option>
                    <option value="L">Per L</option>
                    <option value="UNIT">Per unit</option>
                  </select>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-[14px] text-[var(--text-primary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={editIsStaple}
                  onChange={(e) => setEditIsStaple(e.target.checked)}
                  className="w-4 h-4 rounded accent-[var(--primary)]"
                />
                Include in household staples benchmark
              </label>

              {/* Optional Nutrition & Barcode Cache */}
              <div className="pt-3 border-t border-[var(--border)] space-y-3">
                <div className="text-[13px] font-medium text-[var(--text-muted)]">
                  Nutrition &amp; barcode details (optional)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[13px] text-[var(--text-muted)]">
                      Nutri-Score
                    </label>
                    <select
                      value={editNutriScore}
                      onChange={(e) => setEditNutriScore(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--primary)] text-[13px] text-[var(--text-primary)] focus:outline-none"
                    >
                      <option value="">—</option>
                      <option value="a">A</option>
                      <option value="b">B</option>
                      <option value="c">C</option>
                      <option value="d">D</option>
                      <option value="e">E</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[13px] text-[var(--text-muted)]">
                      NOVA
                    </label>
                    <select
                      value={editNovaGroup}
                      onChange={(e) => setEditNovaGroup(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--primary)] text-[13px] text-[var(--text-primary)] focus:outline-none"
                    >
                      <option value="">—</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[13px] text-[var(--text-muted)]">
                      Protein / 100g
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={editProtein}
                      onChange={(e) => setEditProtein(e.target.value)}
                      placeholder="g"
                      className="w-full h-9 px-2.5 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--primary)] text-[13px] tabular-nums text-[var(--text-primary)] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[13px] text-[var(--text-muted)]">
                      kcal / 100g
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="1000"
                      value={editKcal}
                      onChange={(e) => setEditKcal(e.target.value)}
                      placeholder="kcal"
                      className="w-full h-9 px-2.5 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--primary)] text-[13px] tabular-nums text-[var(--text-primary)] focus:outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-[13px] text-[var(--text-muted)]">
                    EAN / Barcode
                  </label>
                  <input
                    type="text"
                    value={editEan}
                    onChange={(e) => setEditEan(e.target.value)}
                    placeholder="e.g. 8480000105302"
                    className="w-full h-9 px-3 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--primary)] text-[13px] tabular-nums text-[var(--text-primary)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => editDialogRef.current?.close("cancel")}
                  disabled={isSavingEdit}
                  className="h-10 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="h-10 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  {isSavingEdit && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  Save changes
                </button>
              </div>
            </form>
          </div>
        )}
      </dialog>

      {/* Native <dialog> Merge Duplicate Modal */}
      <dialog
        ref={mergeDialogRef}
        aria-labelledby={mergeTitleId}
        className="m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] p-0 shadow-2xl backdrop:bg-[var(--scrim)] backdrop:backdrop-blur-[2px]"
      >
        {mergeSource && (
          <div className="p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h2
                  id={mergeTitleId}
                  className="font-display font-semibold text-[20px] text-[var(--text-primary)]"
                >
                  Merge duplicate product
                </h2>
                <p className="text-[13px] text-[var(--text-muted)]">
                  Move all {mergeSource.sightingsCount} recorded purchases and{" "}
                  {mergeSource.aliasesCount} receipt matches from{" "}
                  <strong className="text-[var(--text-primary)]">
                    {mergeSource.displayName}
                  </strong>{" "}
                  into the main entry below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => mergeDialogRef.current?.close("cancel")}
                aria-label="Close"
                className="w-8 h-8 rounded-full hover:bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-muted)] cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmMerge} className="space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  autoFocus
                  value={mergeSearch}
                  onChange={(e) => setMergeSearch(e.target.value)}
                  placeholder="Search target product to merge into..."
                  className="w-full h-10 pl-10 pr-4 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] text-[var(--text-primary)] focus:outline-none"
                />
              </div>

              <div className="max-h-56 overflow-y-auto rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
                {mergeCandidates.map(({ product: cand, similarity }) => {
                  const selected = mergeTargetId === cand.id;
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => setMergeTargetId(cand.id)}
                      className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 text-[13px] cursor-pointer transition-colors ${
                        selected
                          ? "bg-[var(--primary-tint)] text-[var(--text-primary)] font-semibold"
                          : "hover:bg-[var(--bg-subtle)]/70 text-[var(--text-primary)]"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{cand.displayName}</span>
                        {similarity >= 0.6 && (
                          <span className="px-2 py-0.5 rounded-full bg-[var(--primary-tint)] text-[var(--primary)] text-[13px] leading-none font-medium whitespace-nowrap shrink-0 tabular-nums">
                            {Math.round(similarity * 100)}% match
                          </span>
                        )}
                      </div>
                      <span className="text-[var(--text-muted)] tabular-nums shrink-0">
                        {cand.category} · {normalizeUnit(cand.baseUnit)} ·{" "}
                        {cand.sightingsCount}
                      </span>
                    </button>
                  );
                })}
              </div>

              {selectedMergeTarget &&
                selectedMergeTarget.baseUnit !== mergeSource.baseUnit && (
                  <div className="p-3 rounded-xl border border-[var(--accent)]/35 bg-[var(--accent-tint)] text-[13px] text-[var(--accent)] flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Unit difference ({normalizeUnit(mergeSource.baseUnit)} →{" "}
                      {normalizeUnit(selectedMergeTarget.baseUnit)}). Merged
                      purchases will adopt{" "}
                      {normalizeUnit(selectedMergeTarget.baseUnit)}.
                    </span>
                  </div>
                )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => mergeDialogRef.current?.close("cancel")}
                  className="h-10 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!mergeTargetId || isMerging}
                  className="h-10 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {isMerging && <Loader2 className="w-4 h-4 animate-spin" />}
                  Merge products
                </button>
              </div>
            </form>
          </div>
        )}
      </dialog>
    </div>
  );
}
