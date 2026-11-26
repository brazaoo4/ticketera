"use client";

import React, { useState } from "react";
import { Sparkles, Trash2, Loader2 } from "lucide-react";
import { clearDemoDataAction } from "@/lib/demo/actions";
import { useRouter } from "next/navigation";

export function DemoBanner() {
  const [confirming, setConfirming] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();

  const handleClear = async () => {
    setIsClearing(true);
    setErrorMsg(null);
    try {
      await clearDemoDataAction();
      setConfirming(false);
      router.refresh();
    } catch {
      setErrorMsg("Could not remove demo data. Please try again.");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="bg-[var(--accent-tint)] border-b border-[var(--border)] text-[var(--text-primary)] px-4 py-2 text-[13px]">
      <div className="max-w-[1120px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--accent)] shrink-0" />
          <span>
            <strong className="font-semibold">Demo data active</strong> — viewing sample Spanish receipts
          </span>
          {errorMsg && (
            <span className="text-[var(--negative)] font-medium ml-2">
              {errorMsg}
            </span>
          )}
        </div>

        {confirming ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[var(--text-muted)]">Remove sample receipts?</span>
            <button
              type="button"
              onClick={handleClear}
              disabled={isClearing}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-[var(--negative)] text-[var(--negative-on)] text-[13px] font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              {isClearing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Confirm clear</span>
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={isClearing}
              className="h-7 px-3 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] text-[13px] font-medium whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full border border-[var(--border-strong)] bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] text-[13px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span>Clear demo data</span>
          </button>
        )}
      </div>
    </div>
  );
}
