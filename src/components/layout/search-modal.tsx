"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles, ArrowRight, X, Loader2 } from "lucide-react";

interface SearchProduct {
  id: string;
  displayName: string;
  category: string;
  slug: string;
  isStaple: boolean;
}

export function SearchModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<SearchProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setQuery("");
    }
  }, [isOpen]);

  // Fetch dynamic suggestions when open or query changes
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const trimmed = query.trim();
        const url = trimmed
          ? `/api/products/search?q=${encodeURIComponent(trimmed)}`
          : `/api/products/search`;
        const res = await fetch(url);
        if (res.ok && active) {
          const data = await res.json();
          setProducts(data.products || []);
        }
      } catch (err) {
        console.warn("Search fetch error:", err);
      } finally {
        if (active) setIsLoading(false);
      }
    }, query.trim() ? 200 : 0);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isOpen, query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSearchSubmit = (term: string) => {
    if (!term.trim()) return;
    onClose();
    router.push(`/products?q=${encodeURIComponent(term.trim())}`);
  };

  const handleProductClick = (slug: string) => {
    onClose();
    router.push(`/products/${slug}`);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search products"
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden text-zinc-100 animate-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="relative flex items-center border-b border-zinc-800 px-4 py-3 bg-zinc-900/90">
          <Search className="w-5 h-5 text-emerald-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearchSubmit(query);
              }
            }}
            placeholder="Search products by name or category..."
            className="w-full bg-transparent text-sm placeholder:text-zinc-500 focus:outline-none text-zinc-100"
          />
          {isLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-zinc-500 mr-2 shrink-0" />
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors ml-1"
            aria-label="Close search"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Dynamic Suggestion / Results List */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <div className="flex items-center justify-between text-xs font-mono font-medium text-zinc-400 mb-2">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {query.trim() ? "SEARCH RESULTS" : "POPULAR TRACKED PRODUCTS"}
                </span>
              </span>
              {products.length > 0 && (
                <span className="text-[10px] text-zinc-500">
                  {products.length} {products.length === 1 ? "item" : "items"}
                </span>
              )}
            </div>

            {products.length === 0 && !isLoading ? (
              <div className="py-8 text-center text-xs text-zinc-500 font-mono">
                {query.trim()
                  ? `No products found matching "${query.trim()}". Press Enter to view full catalogue.`
                  : "No products tracked in database yet."}
              </div>
            ) : (
              <div className="space-y-1">
                {products.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleProductClick(item.slug)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-sm text-zinc-300 hover:text-emerald-300 hover:bg-zinc-800/80 transition-colors group"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 group-hover:bg-emerald-400 shrink-0" />
                      <span className="truncate">{item.displayName}</span>
                    </span>
                    <span className="text-[11px] text-zinc-500 group-hover:text-zinc-400 flex items-center gap-1 font-mono shrink-0 ml-3">
                      <span>{item.category}</span>
                      <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Helper Bar */}
        <div className="border-t border-zinc-800/80 bg-zinc-950/60 px-4 py-2.5 flex items-center justify-between text-xs text-zinc-500 font-mono">
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 text-[10px]">
              ↵ Enter
            </kbd>
            <span>to search full catalogue</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 text-[10px]">
              Esc
            </kbd>
            <span>to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
