"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Loader2, X } from "lucide-react";
import { createStoreAction, deleteStoreAction } from "./actions";
import { getStoreBrand } from "@/lib/format";

interface StoreItem {
  id: string;
  name: string;
  slug: string;
  brandHex: string;
  productsCount: number;
  receiptsCount: number;
}

const PRESET_COLORS = [
  { name: "Mercadona Green", hex: "#15803D" },
  { name: "Carrefour Blue", hex: "#2563EB" },
  { name: "Lidl Yellow", hex: "#EAB308" },
  { name: "DIA Red", hex: "#DC2626" },
  { name: "Consum Orange", hex: "#C2410C" },
  { name: "Aldi Sky", hex: "#0284C7" },
  { name: "MAS Crimson", hex: "#B91C1C" },
  { name: "Amber", hex: "#D97706" },
];

export function StoresClient({
  initialStores,
  isLoggedIn,
}: {
  initialStores: StoreItem[];
  isLoggedIn: boolean;
}) {
  const [stores, setStores] = useState<StoreItem[]>(initialStores);
  const [showUntracked, setShowUntracked] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [brandHex, setBrandHex] = useState("#15803D");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const activeStores = stores
    .filter((s) => s.receiptsCount > 0)
    .sort((a, b) => {
      if (b.receiptsCount !== a.receiptsCount) {
        return b.receiptsCount - a.receiptsCount;
      }
      if (b.productsCount !== a.productsCount) {
        return b.productsCount - a.productsCount;
      }
      return a.name.localeCompare(b.name);
    });

  const untrackedStores = stores
    .filter((s) => s.receiptsCount === 0)
    .sort((a, b) => a.name.localeCompare(b.name));

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
        setShowUntracked(true);
        setName("");
        setBrandHex("#15803D");
        setIsAddModalOpen(false);
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Error adding supermarket."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setDeleteError(null);
    try {
      const res = await deleteStoreAction(id);
      if (res?.error) {
        setDeleteError(res.error);
        return;
      }
      setStores((prev) => prev.filter((s) => s.id !== id));
      setConfirmDeleteId(null);
    } catch {
      setDeleteError("Could not remove supermarket.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[25px] sm:text-[30px] font-bold leading-tight text-[var(--text-primary)]">
            Supermarkets
          </h1>
          <p className="mt-1.5 text-[15px] text-[var(--text-muted)]">
            Stores you track and how many receipts you have from each.
          </p>
        </div>

        {isLoggedIn && (
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setIsAddModalOpen(true);
            }}
            className="h-10 px-4 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add supermarket</span>
          </button>
        )}
      </div>

      {/* Active Supermarkets Grid */}
      {activeStores.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center text-[15px] text-[var(--text-muted)]">
          No supermarket receipts uploaded yet. Upload a receipt to see store
          summaries here.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeStores.map((store) => {
            const brand = getStoreBrand(store.name, store.brandHex);
            return (
              <Link
                key={store.slug}
                href={`/stores/${store.slug}`}
                className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-strong)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)] p-5 flex flex-col justify-between gap-4 transition-[transform,border-color,box-shadow] duration-150"
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center font-display font-bold text-[15px] shrink-0"
                    style={{
                      backgroundColor: brand.color,
                      color: brand.fg,
                    }}
                  >
                    {brand.monogram}
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-display text-[18px] font-semibold text-[var(--text-primary)] truncate">
                      {store.name}
                    </h2>
                    <p className="text-[13px] text-[var(--text-muted)] tabular-nums">
                      {store.productsCount} tracked{" "}
                      {store.productsCount === 1 ? "item" : "items"} ·{" "}
                      {store.receiptsCount}{" "}
                      {store.receiptsCount === 1 ? "receipt" : "receipts"}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-[13px] font-semibold text-[var(--primary)]">
                  <span>View prices</span>
                  <span>→</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Expandable Untracked Chains */}
      {untrackedStores.length > 0 && (
        <div className="space-y-4">
          <button
            type="button"
            aria-expanded={showUntracked}
            onClick={() => setShowUntracked((prev) => !prev)}
            className="text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            {showUntracked
              ? "Hide chains with no receipts yet"
              : `Show ${untrackedStores.length} ${untrackedStores.length === 1 ? "chain" : "chains"} with no receipts yet`}
          </button>

          {deleteError && (
            <p className="text-[13px] text-[var(--negative)]">{deleteError}</p>
          )}

          {showUntracked && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {untrackedStores.map((store) => {
                const brand = getStoreBrand(store.name, store.brandHex);
                return (
                  <div
                    key={store.id}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 flex items-center justify-between gap-3"
                  >
                    <Link
                      href={`/stores/${store.slug}`}
                      className="flex items-center gap-3 min-w-0 flex-1"
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center font-display font-bold text-[13px] shrink-0"
                        style={{
                          backgroundColor: brand.color,
                          color: brand.fg,
                        }}
                      >
                        {brand.monogram}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-[15px] text-[var(--text-primary)] truncate">
                          {store.name}
                        </div>
                        <div className="text-[13px] text-[var(--text-muted)]">
                          No receipts uploaded yet
                        </div>
                      </div>
                    </Link>

                    {isLoggedIn && (
                      <div className="shrink-0">
                        {confirmDeleteId === store.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleDelete(store.id)}
                              disabled={deletingId === store.id}
                              className="h-7 px-2.5 rounded-full bg-[var(--negative)] text-[var(--negative-on)] text-[13px] font-semibold cursor-pointer"
                            >
                              {deletingId === store.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                "Remove"
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="h-7 px-2 rounded-full border border-[var(--border)] text-[13px] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(store.id)}
                            aria-label={`Remove ${store.name}`}
                            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--negative)] hover:bg-[var(--negative-tint)] cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add Supermarket Modal */}
      {isAddModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-store-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--scrim)]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddModalOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h2
                id="add-store-title"
                className="font-display text-[18px] font-semibold text-[var(--text-primary)]"
              >
                Add a supermarket
              </h2>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                aria-label="Close"
                className="w-9 h-9 rounded-full border border-[var(--border)] inline-flex items-center justify-center hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-[var(--negative-tint)] text-[13px] text-[var(--negative)]">
                  {errorMsg}
                </div>
              )}

              <div>
                <label
                  htmlFor="new-store-name"
                  className="block text-[13px] font-semibold mb-1.5"
                >
                  Supermarket name
                </label>
                <input
                  id="new-store-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Eroski or El Corte Inglés"
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[13px] text-[var(--text-primary)]"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-semibold">Brand color</span>
                  <span className="text-[var(--text-muted)]">
                    {brandHex.toUpperCase()}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setBrandHex(c.hex)}
                      title={c.name}
                      className={`h-8 rounded-lg cursor-pointer transition-transform ${
                        brandHex.toLowerCase() === c.hex.toLowerCase()
                          ? "ring-2 ring-[var(--primary)] ring-offset-2"
                          : ""
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="h-9 px-4 rounded-full border border-[var(--border)] text-[13px] font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="h-9 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  <span>Add store</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
