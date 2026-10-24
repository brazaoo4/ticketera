"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  ShoppingBag,
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
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { CANONICAL_CATEGORIES } from "@/lib/ai/schema";
import {
  toggleProductStapleAction,
  updateProductAction,
  mergeProductsAction,
  deleteProductAction,
  autoHealLegacyProductsAction,
} from "./actions";

export interface ManagedProduct {
  id: string;
  slug: string;
  displayName: string;
  category: string;
  baseUnit: "KG" | "L" | "UNIT";
  isStaple: boolean;
  sightingsCount: number;
  aliasesCount: number;
}

export function ProductManagementClient({
  initialProducts,
}: {
  initialProducts: ManagedProduct[];
}) {
  const [products, setProducts] = useState<ManagedProduct[]>(initialProducts);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [stapleFilter, setStapleFilter] = useState<"all" | "staple" | "non-staple">("all");

  // Feedback states
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isHealing, setIsHealing] = useState(false);

  // Edit Modal State
  const [editingProduct, setEditingProduct] = useState<ManagedProduct | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("Other");
  const [editBaseUnit, setEditBaseUnit] = useState<"KG" | "L" | "UNIT">("UNIT");
  const [editIsStaple, setEditIsStaple] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Merge Modal State
  const [mergingSource, setMergingSource] = useState<ManagedProduct | null>(null);
  const [mergeTargetQuery, setMergeTargetQuery] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [isMerging, setIsMerging] = useState(false);

  // Delete State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = p.displayName.toLowerCase().includes(q);
        const matchSlug = p.slug.toLowerCase().includes(q);
        const matchCat = p.category.toLowerCase().includes(q);
        if (!matchName && !matchSlug && !matchCat) return false;
      }

      if (categoryFilter !== "All" && p.category !== categoryFilter) {
        return false;
      }

      if (stapleFilter === "staple" && !p.isStaple) return false;
      if (stapleFilter === "non-staple" && p.isStaple) return false;

      return true;
    });
  }, [products, searchQuery, categoryFilter, stapleFilter]);

  // Merge target candidates
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
      .slice(0, 8);
  }, [products, mergingSource, mergeTargetQuery]);

  // 1-Tap Staple Toggle
  const handleToggleStaple = async (productId: string, currentVal: boolean) => {
    const nextVal = !currentVal;
    // Optimistic update
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, isStaple: nextVal } : p))
    );

    const res = await toggleProductStapleAction(productId, nextVal);
    if (!res.success) {
      // Revert on failure
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
  };

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setIsSavingEdit(true);
    setFeedback(null);

    const res = await updateProductAction(editingProduct.id, {
      displayName: editName,
      category: editCategory,
      baseUnit: editBaseUnit,
      isStaple: editIsStaple,
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
              }
            : p
        )
      );
      setEditingProduct(null);
      setFeedback({ type: "success", message: `Updated "${editName.trim()}" successfully.` });
    } else {
      setFeedback({ type: "error", message: res.error || "Failed to update product." });
    }
    setIsSavingEdit(false);
  };

  // Open Merge Modal
  const openMergeModal = (source: ManagedProduct) => {
    setMergingSource(source);
    setMergeTargetQuery("");
    setMergeTargetId("");
  };

  // Execute Merge
  const handleExecuteMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergingSource || !mergeTargetId) return;
    setIsMerging(true);
    setFeedback(null);

    const targetProduct = products.find((p) => p.id === mergeTargetId);
    const res = await mergeProductsAction(mergingSource.id, mergeTargetId);

    if (res.success) {
      // Remove source product from state and increment target sightings
      setProducts((prev) =>
        prev
          .filter((p) => p.id !== mergingSource.id)
          .map((p) =>
            p.id === mergeTargetId
              ? {
                  ...p,
                  sightingsCount: p.sightingsCount + mergingSource.sightingsCount,
                  aliasesCount: p.aliasesCount + mergingSource.aliasesCount,
                }
              : p
          )
      );
      setMergingSource(null);
      setFeedback({
        type: "success",
        message:
          res.message ||
          `Merged "${mergingSource.displayName}" into "${targetProduct?.displayName}".`,
      });
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

  return (
    <div className="space-y-6">
      {/* Top Banner & Auto-Healer CTA */}
      <div className="rounded-3xl border border-zinc-800/80 bg-gradient-to-r from-zinc-900/90 via-zinc-900/60 to-zinc-950 p-6 sm:p-8 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
            <Link href="/admin/users" className="hover:text-zinc-200 transition-colors flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Admin Console</span>
            </Link>
            <span>/</span>
            <span className="text-emerald-400 font-semibold">Catalogue Management</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <ShoppingBag className="w-6 h-6 text-emerald-400" />
            <span>Product Catalogue & Merger</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl">
            Manage canonical product definitions, toggle staple index items, fix units, and merge duplicate entries without data loss.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleAutoHeal}
            disabled={isHealing}
            className="px-4 py-2.5 rounded-xl bg-zinc-900 border border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400 hover:text-emerald-300 text-xs font-semibold shadow-lg shadow-emerald-500/10 inline-flex items-center gap-2 transition-all whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            {isHealing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-emerald-400" />
            )}
            <span>Auto-Heal Catalogue</span>
          </button>
        </div>
      </div>

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
            {feedback.type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-zinc-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
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
            placeholder="Search products or slugs..."
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
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                stapleFilter === "all" ? "bg-zinc-800 text-emerald-400 shadow-sm" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              All ({products.length})
            </button>
            <button
              type="button"
              onClick={() => setStapleFilter("staple")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1 transition-all ${
                stapleFilter === "staple" ? "bg-zinc-800 text-amber-400 shadow-sm" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              <span>Staples ({products.filter((p) => p.isStaple).length})</span>
            </button>
            <button
              type="button"
              onClick={() => setStapleFilter("non-staple")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
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
        </div>
      </div>

      {/* Products Table */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/80 text-zinc-400 font-mono uppercase text-[11px]">
                <th className="py-3 px-4 w-12 text-center">Staple</th>
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
                  <td colSpan={7} className="py-12 text-center text-zinc-500 font-mono">
                    No matching products found.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-800/30 transition-colors group">
                    {/* Staple Toggle */}
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleStaple(p.id, p.isStaple)}
                        className={`p-1.5 rounded-lg transition-colors inline-flex items-center justify-center ${
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
                          className="font-bold text-zinc-100 hover:text-emerald-400 transition-colors inline-flex items-center gap-1.5"
                        >
                          <span>{p.displayName}</span>
                          <ArrowRight className="w-3 h-3 text-zinc-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
                        </Link>
                        <div className="text-[10px] font-mono text-zinc-500">{p.slug}</div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700/60 text-[10px] font-medium whitespace-nowrap">
                        {p.category}
                      </span>
                    </td>

                    {/* Base Unit */}
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-zinc-800 text-emerald-400 border border-zinc-700/60">
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
                          className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                          title="Edit Product"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openMergeModal(p)}
                          className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-emerald-500/20 text-zinc-300 hover:text-emerald-400 transition-colors"
                          title="Merge into another product..."
                        >
                          <GitMerge className="w-3.5 h-3.5" />
                        </button>
                        {p.sightingsCount === 0 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(p.id)}
                            disabled={deletingId === p.id}
                            className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-rose-500/20 text-zinc-300 hover:text-rose-400 transition-colors"
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

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in-50">
          <div className="w-full max-w-lg rounded-3xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Edit Product</h3>
                  <p className="text-xs text-zinc-400">Canonical catalogue entry</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white"
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

              <div className="pt-4 border-t border-zinc-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  disabled={isSavingEdit}
                  className="px-4 py-2 rounded-xl border border-zinc-800 text-xs text-zinc-400 hover:bg-zinc-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold shadow-md shadow-emerald-500/20 inline-flex items-center gap-2"
                >
                  {isSavingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Merge Duplicate Product Modal */}
      {mergingSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in-50">
          <div className="w-full max-w-xl rounded-3xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <GitMerge className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Merge Duplicate Product</h3>
                  <p className="text-xs text-zinc-400">Atomically consolidate sightings and aliases</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMergingSource(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white"
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
              <div className="text-[11px] font-mono text-zinc-400">
                {mergingSource.sightingsCount} sightings · {mergingSource.aliasesCount} aliases · {mergingSource.category}
              </div>
            </div>

            <form onSubmit={handleExecuteMerge} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300">
                  Select Target Product (To keep and merge into)
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
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Candidate Selection List */}
                <div className="max-h-48 overflow-y-auto rounded-xl border border-zinc-800 divide-y divide-zinc-800/60 bg-zinc-900/60 p-1">
                  {mergeCandidates.length === 0 ? (
                    <div className="p-4 text-center text-xs text-zinc-500 font-mono">
                      No matching candidate products.
                    </div>
                  ) : (
                    mergeCandidates.map((c) => {
                      const isSelected = mergeTargetId === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setMergeTargetId(c.id)}
                          className={`w-full text-left p-2.5 rounded-lg transition-colors flex items-center justify-between ${
                            isSelected
                              ? "bg-emerald-500/20 border border-emerald-500/40 text-white"
                              : "hover:bg-zinc-800/60 text-zinc-300"
                          }`}
                        >
                          <div>
                            <div className="font-semibold text-xs text-zinc-100 flex items-center gap-1.5">
                              <span>{c.displayName}</span>
                              {c.isStaple && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                            </div>
                            <div className="text-[10px] font-mono text-zinc-500">
                              {c.category} · {c.baseUnit} · {c.sightingsCount} sightings
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setMergingSource(null)}
                  disabled={isMerging}
                  className="px-4 py-2 rounded-xl border border-zinc-800 text-xs text-zinc-400 hover:bg-zinc-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!mergeTargetId || isMerging}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold shadow-md shadow-emerald-500/20 inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {isMerging && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm Merge</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
