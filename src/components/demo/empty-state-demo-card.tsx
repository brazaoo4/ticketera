"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Upload, Sparkles, Loader2, Receipt } from "lucide-react";
import { loadDemoDataAction } from "@/lib/demo/actions";
import { useRouter } from "next/navigation";

export function EmptyStateDemoCard({
  title = "Welcome to Ticketera",
  description = "No saved receipts yet. Upload your first grocery receipt or load the sample Spanish dataset to explore price comparisons.",
}: {
  title?: string;
  description?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();

  const handleLoadDemo = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await loadDemoDataAction();
      if (res?.success) {
        router.refresh();
      } else {
        const errMsg =
          res && "error" in res && typeof res.error === "string"
            ? res.error
            : "Could not load sample data.";
        setErrorMsg(errMsg);
      }
    } catch {
      setErrorMsg("Unexpected error loading sample data.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-6">
      <div className="w-14 h-14 rounded-2xl bg-[var(--primary-tint)] text-[var(--primary)] flex items-center justify-center mx-auto">
        <Receipt className="w-7 h-7" />
      </div>

      <div className="space-y-2">
        <h1 className="font-display text-2xl sm:text-[30px] font-bold text-[var(--text-primary)]">
          {title}
        </h1>
        <p className="text-[15px] text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      </div>

      {errorMsg && (
        <p className="text-[13px] text-[var(--negative)] font-medium">
          {errorMsg}
        </p>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
        <Link
          href="/upload"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] font-semibold text-[13px] transition-colors whitespace-nowrap shrink-0"
        >
          <Upload className="w-4 h-4 shrink-0" />
          <span>Add first receipt</span>
        </Link>

        <button
          type="button"
          onClick={handleLoadDemo}
          disabled={isLoading}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border)] font-medium text-[13px] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin shrink-0 text-[var(--accent)]" />
          ) : (
            <Sparkles className="w-4 h-4 text-[var(--accent)] shrink-0" />
          )}
          <span>Load sample data</span>
        </button>
      </div>
    </div>
  );
}
