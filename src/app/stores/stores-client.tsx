"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Store as StoreIcon,
  ShoppingBag,
  FileText,
  ArrowRight,
  Plus,
  Trash2,
  X,
  Loader2,
} from "lucide-react";
import { createStoreAction, deleteStoreAction } from "./actions";

interface StoreItem {
  id: string;
  name: string;
  slug: string;
  brandHex: string;
  productsCount: number;
  receiptsCount: number;
}

const PRESET_COLORS = [
  { name: "Mercadona Green", hex: "#00754A" },
  { name: "Lidl Blue", hex: "#0050AA" },
  { name: "Carrefour Blue", hex: "#0E51A0" },
  { name: "Alcampo Red", hex: "#E2001A" },
  { name: "Consum Orange", hex: "#E65300" },
  { name: "DIA Red", hex: "#D52B1E" },
  { name: "Aldi Cyan", hex: "#00B4E5" },
  { name: "Emerald", hex: "#10B981" },
  { name: "Indigo", hex: "#6366F1" },
  { name: "Rose", hex: "#F43F5E" },
  { name: "Amber", hex: "#F59E0B" },
  { name: "Purple", hex: "#8B5CF6" },
];

function getStoreMonogram(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  const upper = name.toUpperCase();
  if (upper.startsWith("CARR")) return "CR";
  if (upper.startsWith("MERC")) return "MC";
  if (upper.startsWith("ALC")) return "AC";
  if (upper.startsWith("ALD")) return "AL";
  return name.substring(0, 2).toUpperCase();
}

export function StoresClient({
  initialStores,
  isLoggedIn,
}: {
  initialStores: StoreItem[];
  isLoggedIn: boolean;
}) {
  const [stores, setStores] = useState<StoreItem[]>(initialStores);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [brandHex, setBrandHex] = useState("#10B981");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("Please enter a supermarket name.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await createStoreAction({ name, brandHex });
      if (res?.error) {
        setErrorMsg(res.error);
        setIsSubmitting(false);
        return;
      }

      if (res?.store) {
        setStores((prev) => [
          ...prev,
          {
            id: res.store.id,
            name: res.store.name,
            slug: res.store.slug,
            brandHex: res.store.brandHex,
            productsCount: 0,
            receiptsCount: 0,
          },
        ]);
        setName("");
        setBrandHex("#10B981");
        setIsAddModalOpen(false);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error creating supermarket");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, storeName: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`Are you sure you want to delete "${storeName}"?`)) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await deleteStoreAction(id);
      if (res?.error) {
        alert(res.error);
        return;
      }
      setStores((prev) => prev.filter((s) => s.id !== id));
    } catch {
      alert("Error deleting supermarket.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="border-b border-zinc-800/80 pb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <StoreIcon className="w-6 h-6 text-emerald-400" />
            <span>Supermarkets</span>
          </h1>
          <p className="text-sm text-zinc-400 max-w-2xl">
            National supermarket chains tracked across Spain. Compare product coverage, store pricing, and verified receipt history.
          </p>
        </div>

        {isLoggedIn && (
          <button
            onClick={() => {
              setErrorMsg(null);
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Supermarket</span>
          </button>
        )}
      </div>

      {/* Stores Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stores.map((store) => (
          <Link
            key={store.slug}
            href={`/stores/${store.slug}`}
            className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all hover:shadow-xl flex flex-col justify-between"
          >
            <div>
              {/* Top Store Badge */}
              <div className="flex items-center justify-between mb-4">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white shadow-md text-sm shrink-0"
                  style={{ backgroundColor: store.brandHex }}
                >
                  {getStoreMonogram(store.name)}
                </div>
                <div className="flex items-center gap-2">
                  {isLoggedIn && store.receiptsCount === 0 && (
                    <button
                      onClick={(e) => handleDelete(store.id, store.name, e)}
                      disabled={deletingId === store.id}
                      className="p-1 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Delete unused supermarket"
                    >
                      {deletingId === store.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: store.brandHex }}
                    title="Brand indicator"
                  />
                </div>
              </div>

              {/* Store Name */}
              <h2 className="text-lg font-bold text-zinc-100 group-hover:text-emerald-300 transition-colors mb-4">
                {store.name}
              </h2>

              {/* Real PostgreSQL Metrics */}
              <div className="border-t border-zinc-800/80 pt-3 grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="space-y-0.5">
                  <div className="text-[11px] text-zinc-400 flex items-center gap-1 font-sans">
                    <ShoppingBag className="w-3 h-3 text-zinc-400" />
                    <span>Tracked</span>
                  </div>
                  <div className="font-semibold text-zinc-200 tabular-nums">
                    {store.productsCount} products
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="text-[11px] text-zinc-400 flex items-center gap-1 font-sans">
                    <FileText className="w-3 h-3 text-zinc-400" />
                    <span>Receipts</span>
                  </div>
                  <div className="font-semibold text-zinc-200 tabular-nums">
                    {store.receiptsCount}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Link */}
            <div className="mt-5 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-xs font-semibold text-emerald-400 group-hover:text-emerald-300">
              <span className="whitespace-nowrap shrink-0">View Store Intelligence</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </div>
          </Link>
        ))}
      </div>

      {/* Add Supermarket Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <StoreIcon className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-white text-lg">Add Supermarket</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium">
                  {errorMsg}
                </div>
              )}

              {/* Store Name Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Supermarket Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Eroski, Ahorramas, BM Supermercados"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-950 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Brand Color Picker */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                  <span>Brand Color</span>
                  <span className="font-mono text-zinc-400">{brandHex.toUpperCase()}</span>
                </label>

                {/* Preset Swatches */}
                <div className="grid grid-cols-6 gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color.hex}
                      type="button"
                      onClick={() => setBrandHex(color.hex)}
                      className={`h-7 rounded-lg transition-transform ${
                        brandHex.toLowerCase() === color.hex.toLowerCase()
                          ? "ring-2 ring-white scale-110 shadow-lg"
                          : "hover:scale-105 opacity-80 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: color.hex }}
                      title={color.name}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <input
                    type="color"
                    value={brandHex}
                    onChange={(e) => setBrandHex(e.target.value)}
                    className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                  />
                  <span className="text-xs text-zinc-400">
                    Or pick a custom hex color
                  </span>
                </div>
              </div>

              {/* Live Preview Card */}
              <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-950/60 flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-md text-sm shrink-0"
                  style={{ backgroundColor: brandHex }}
                >
                  {name.trim() ? getStoreMonogram(name) : "TT"}
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-zinc-500 font-medium">Live Preview</div>
                  <div className="text-sm font-bold text-white truncate">
                    {name.trim() || "Supermarket name"}
                  </div>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-zinc-400 hover:text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                  <span>Save Supermarket</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
