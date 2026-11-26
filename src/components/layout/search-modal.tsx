"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, X, Loader2 } from "lucide-react";

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

  const handleClose = useCallback(() => {
    setQuery("");
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    const timer = setTimeout(
      async () => {
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
      },
      query.trim() ? 200 : 0
    );

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isOpen, query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k" && isOpen) {
        e.preventDefault();
        handleClose();
      }
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const handleSearchSubmit = (term: string) => {
    if (!term.trim()) return;
    handleClose();
    router.push(`/products?q=${encodeURIComponent(term.trim())}`);
  };

  const handleProductClick = (slug: string) => {
    handleClose();
    router.push(`/products/${slug}`);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search groceries"
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 px-4 bg-[var(--scrim)]"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-soft)] overflow-hidden text-[var(--text-primary)]">
        <div className="flex items-center border-b border-[var(--border)] px-4 py-3 gap-3">
          <Search className="w-[18px] h-[18px] text-[var(--primary)] shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearchSubmit(query);
              }
            }}
            placeholder="Search groceries by name or category..."
            className="w-full bg-transparent text-[15px] placeholder:text-[var(--text-muted)] focus:outline-none text-[var(--text-primary)]"
          />
          {isLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)] shrink-0" />
          )}
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] inline-flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            aria-label="Close search"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="flex items-center justify-between text-[13px] font-medium text-[var(--text-muted)]">
            <span>{query.trim() ? "Search results" : "Popular groceries"}</span>
            {products.length > 0 && (
              <span className="tabular-nums">
                {products.length} {products.length === 1 ? "item" : "items"}
              </span>
            )}
          </div>

          {products.length === 0 && !isLoading ? (
            <div className="py-8 text-center text-[13px] text-[var(--text-muted)]">
              {query.trim()
                ? `No groceries matching "${query.trim()}". Press Enter to view all groceries.`
                : "No groceries tracked yet."}
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {products.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleProductClick(item.slug)}
                  className="w-full flex items-center justify-between px-2 py-2.5 text-left text-[15px] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] rounded-xl transition-colors group cursor-pointer"
                >
                  <span className="font-medium truncate pr-3">
                    {item.displayName}
                  </span>
                  <span className="text-[13px] text-[var(--text-muted)] flex items-center gap-1.5 shrink-0">
                    <span>{item.category}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[var(--primary)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-2.5 flex items-center justify-between text-[13px] text-[var(--text-muted)]">
          <span>Press Enter to search all groceries</span>
          <span>Press Esc to close</span>
        </div>
      </div>
    </div>
  );
}
