"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  X,
  Star,
  Plus,
  Loader2,
  Check,
  ScanBarcode,
} from "lucide-react";
import { normalizeUnit } from "@/lib/format";
import { BarcodeScannerModal } from "@/components/common/barcode-scanner-modal";
import type { CatalogLookupResult } from "@/lib/catalog/parser";
import {
  getNovaGroupMeta,
  getNutriScoreBadgeStyle,
} from "@/lib/analytics/nutrition";

export interface SearchedProduct {
  id: string;
  displayName: string;
  category: string;
  baseUnit: "KG" | "L" | "UNIT";
  isStaple?: boolean;
  slug?: string;
  matchReason?: string;
}

interface ProductSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct: (product: SearchedProduct) => void;
  onSwitchToCreateNew: () => void;
  onApplyBarcodeLookup?: (match: CatalogLookupResult) => void;
  currentProductName?: string;
  initialQuery?: string;
}

export function ProductSearchModal({
  isOpen,
  onClose,
  onSelectProduct,
  onSwitchToCreateNew,
  onApplyBarcodeLookup,
  currentProductName,
  initialQuery = "",
}: ProductSearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchedProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [barcodeMatch, setBarcodeMatch] = useState<{
    ean: string;
    offMatch: CatalogLookupResult | null;
    error?: string | null;
  } | null>(null);
  const [barcodeResults, setBarcodeResults] = useState<SearchedProduct[] | null>(
    null
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setBarcodeMatch(null);
    setBarcodeResults(null);
    const focusTimer = setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
    return () => clearTimeout(focusTimer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/products/search?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal }
        );
        if (res.ok) {
          const data = await res.json();
          setResults(Array.isArray(data.products) ? data.products : []);
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          setResults([]);
        }
      } finally {
        setIsLoading(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, query]);

  const handleBarcodeDetected = async (ean: string) => {
    setScannerOpen(false);
    setIsLoading(true);
    setBarcodeMatch(null);
    setBarcodeResults(null);
    try {
      const res = await fetch(
        `/api/catalog/lookup?barcode=${encodeURIComponent(ean)}`
      );
      if (!res.ok) {
        setBarcodeMatch({
          ean,
          offMatch: null,
          error: "Could not look up barcode right now.",
        });
        return;
      }
      const data = await res.json();
      const combined: SearchedProduct[] = [];
      const seenIds = new Set<string>();

      if (data.localProduct) {
        seenIds.add(data.localProduct.id);
        combined.push({
          ...data.localProduct,
          matchReason: "Exact barcode",
        });
      }
      if (Array.isArray(data.matchedLocalProducts)) {
        for (const p of data.matchedLocalProducts) {
          if (!seenIds.has(p.id)) {
            seenIds.add(p.id);
            combined.push({ ...p, matchReason: "Name match" });
          }
        }
      }

      if (combined.length > 0) {
        setBarcodeResults(combined);
      } else if (data.offMatch?.productName) {
        setQuery(data.offMatch.productName);
      }

      setBarcodeMatch({
        ean,
        offMatch: data.offMatch || null,
        error:
          combined.length === 0 && !data.offMatch
            ? `No pantry or OpenFoodFacts match for EAN ${ean}.`
            : null,
      });
    } catch {
      setBarcodeMatch({
        ean,
        offMatch: null,
        error: "Barcode lookup failed.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const displayedResults = barcodeResults ?? results;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Match grocery product"
    >
      <div
        className="fixed inset-0 bg-[var(--scrim)] backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl overflow-hidden flex flex-col max-h-[82vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-[18px] text-[var(--text-primary)]">
              Match to pantry product
            </h2>
            {currentProductName && (
              <p className="text-[13px] text-[var(--text-muted)] truncate">
                Currently matched to {currentProductName}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close product search"
            className="w-8 h-8 rounded-full hover:bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input + Barcode Lookup */}
        <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-page)]/50 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setBarcodeResults(null);
                  setQuery(e.target.value);
                }}
                placeholder="Search your pantry products..."
                className="w-full h-10 pl-10 pr-9 rounded-full bg-[var(--bg-card)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setBarcodeResults(null);
                    setQuery("");
                  }}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              title="Scan barcode / EAN"
              aria-label="Scan barcode"
              className="w-10 h-10 rounded-full border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] hover:border-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--primary)] inline-flex items-center justify-center whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <ScanBarcode className="w-4 h-4 shrink-0" />
            </button>
          </div>

          {barcodeMatch && (
            <div className="p-3 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary-tint)]/60 text-[13px] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[var(--primary)] tabular-nums">
                  EAN {barcodeMatch.ean}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setBarcodeMatch(null);
                    setBarcodeResults(null);
                  }}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5 cursor-pointer"
                  aria-label="Dismiss barcode result"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {barcodeMatch.offMatch ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="font-semibold text-[var(--text-primary)] truncate">
                      {barcodeMatch.offMatch.productName}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--text-muted)]">
                      {barcodeMatch.offMatch.brand && (
                        <span>{barcodeMatch.offMatch.brand}</span>
                      )}
                      {barcodeMatch.offMatch.rawQuantityText && (
                        <span className="font-semibold text-[var(--primary)] tabular-nums">
                          {barcodeMatch.offMatch.rawQuantityText}
                        </span>
                      )}
                      {(() => {
                        const ns = getNutriScoreBadgeStyle(
                          barcodeMatch.offMatch?.nutrition?.nutriScore
                        );
                        return ns ? (
                          <span
                            className={`px-1.5 py-0.5 rounded-full border text-[13px] leading-none font-semibold ${ns.className}`}
                          >
                            NS {ns.letter}
                          </span>
                        ) : null;
                      })()}
                      {(() => {
                        const nova = getNovaGroupMeta(
                          barcodeMatch.offMatch?.nutrition?.novaGroup
                        );
                        return nova ? (
                          <span
                            className={`px-1.5 py-0.5 rounded-full border text-[13px] leading-none font-semibold ${nova.className}`}
                          >
                            {nova.shortLabel}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  {onApplyBarcodeLookup && (
                    <button
                      type="button"
                      onClick={() => {
                        onApplyBarcodeLookup(barcodeMatch.offMatch!);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Use details</span>
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-[13px] text-[var(--accent)]">
                  {barcodeMatch.error || "No OpenFoodFacts match found."}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]">
          {isLoading ? (
            <div className="py-10 flex items-center justify-center gap-2 text-[14px] text-[var(--text-muted)]">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
              Searching products...
            </div>
          ) : displayedResults.length === 0 ? (
            <div className="py-10 px-5 text-center space-y-2">
              <p className="text-[14px] font-medium text-[var(--text-primary)]">
                No matching products found
              </p>
              <p className="text-[13px] text-[var(--text-muted)]">
                You can create a new product entry for this receipt item below.
              </p>
            </div>
          ) : (
            displayedResults.map((prod) => (
              <button
                key={prod.id}
                type="button"
                onClick={() => onSelectProduct(prod)}
                className="w-full text-left px-5 py-3 flex items-center justify-between gap-3 hover:bg-[var(--bg-subtle)]/70 transition-colors cursor-pointer"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 font-medium text-[14px] text-[var(--text-primary)] truncate">
                    {prod.isStaple && (
                      <Star className="w-3.5 h-3.5 text-[var(--accent)] fill-current shrink-0" />
                    )}
                    <span className="truncate">{prod.displayName}</span>
                    {prod.matchReason && (
                      <span className="px-2 py-0.5 rounded-full bg-[var(--primary-tint)] text-[var(--primary)] border border-[var(--primary)]/25 text-[13px] leading-none font-medium whitespace-nowrap shrink-0">
                        {prod.matchReason}
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] text-[var(--text-muted)]">
                    {prod.category} · priced per {normalizeUnit(prod.baseUnit)}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--primary)] shrink-0">
                  <Check className="w-4 h-4" />
                  Select
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[var(--border)] bg-[var(--bg-page)]/60 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onSwitchToCreateNew}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--primary)] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create new pantry product
          </button>

          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>

      <BarcodeScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => void handleBarcodeDetected(code)}
      />
    </div>
  );
}
