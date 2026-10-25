"use client";

import React, { useState } from "react";
import { Sparkles, Trash2, Loader2 } from "lucide-react";
import { clearDemoDataAction } from "@/lib/demo/actions";
import { useRouter } from "next/navigation";

export function DemoBanner() {
  const [isClearing, setIsClearing] = useState(false);
  const router = useRouter();

  const handleClear = async () => {
    if (!confirm("Are you sure you want to exit Demo Mode and purge all demonstration data?")) {
      return;
    }
    setIsClearing(true);
    try {
      await clearDemoDataAction();
      router.refresh();
    } catch {
      alert("Failed to purge demo data. Please try again.");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-200 px-4 py-2 text-xs font-medium">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong className="text-amber-300 font-semibold">Demo Mode Active</strong> — Viewing simulated dataset
          </span>
        </div>

        <button
          onClick={handleClear}
          disabled={isClearing}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
        >
          {isClearing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : (
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>Exit Demo Mode (Purge demo data)</span>
        </button>
      </div>
    </div>
  );
}
