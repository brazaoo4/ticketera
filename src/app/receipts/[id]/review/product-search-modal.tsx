"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, X, ShoppingBag, Sparkles, Plus, Loader2 } from "lucide-react";

export interface SearchedProduct {
  id: string;
  displayName: string;
  category: string;
  baseUnit: "KG" | "L" | "UNIT";
  isStaple?: boolean;
  slug?: string;
}

interface ProductSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct: (product: SearchedProduct) => void;
  onSwitchToCreateNew: () => void;
  currentProductName?: string;
  initialQuery?: string;
}

export function ProductSearchModal({
  isOpen,
  onClose,
  onSelectProduct,
  onSwitchToCreateNew,
  currentProductName,
  initialQuery = "",
}: ProductSearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchedProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      fetchResults(initialQuery);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen, initialQuery]);

  const fetchResults = async (q: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.products || []);
      }
    } catch (err) {
      console.warn("Product search failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    fetchResults(val);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-lg rounded-t-3xl sm:rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Link to Canonical Product</h2>
              <p className="text-xs text-zinc-400">
                Map raw receipt text to an existing grocery item
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Box */}
        <div className="p-4 border-b border-zinc-800/80 bg-zinc-950/40">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
              <Search className="w-4 h-4" />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search product name (e.g. Leche Entera, Arroz)..."
              className="w-full pl-10 pr-9 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
            />
            {isLoading && (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              </div>
            )}
          </div>

          {currentProductName && (
            <div className="mt-2 text-[11px] text-zinc-400 flex items-center justify-between">
              <span>Current mapping: <strong className="text-zinc-200">{currentProductName}</strong></span>
              <button
                type="button"
                onClick={() => {
                  onSwitchToCreateNew();
                  onClose();
                }}
                className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>Create as new product</span>
              </button>
            </div>
          )}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 divide-y divide-zinc-800/40">
          {results.length === 0 && !isLoading && (
            <div className="p-8 text-center space-y-3">
              <p className="text-xs text-zinc-400">
                No existing products match &ldquo;{query}&rdquo;.
              </p>
              <button
                type="button"
                onClick={() => {
                  onSwitchToCreateNew();
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-all shadow-md shadow-emerald-500/20"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Create &ldquo;{query || "New Product"}&rdquo; instead</span>
              </button>
            </div>
          )}

          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onSelectProduct(p);
                onClose();
              }}
              className="w-full p-2.5 rounded-xl hover:bg-zinc-800/60 text-left transition-colors flex items-center justify-between group"
            >
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-zinc-200 group-hover:text-emerald-300 transition-colors flex items-center gap-1.5">
                  <span>{p.displayName}</span>
                  {p.isStaple && (
                    <span className="text-[10px] text-amber-400" title="Staple Basket Item">
                      ⭐
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-zinc-400">
                  {p.category}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-300 border border-zinc-700/60">
                  {p.baseUnit}
                </span>
                <span className="text-xs text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                  Select →
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => {
              onSwitchToCreateNew();
              onClose();
            }}
            className="text-zinc-400 hover:text-emerald-400 transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Switch to Create New</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors text-xs font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
