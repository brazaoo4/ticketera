"use client";

import React, { useState, useTransition } from "react";
import {
  Globe,
  Lock,
  Loader2,
  Check,
  AlertCircle,
  Eye,
  ShieldAlert,
  Cpu,
  Database,
  Sparkles,
  Trash2,
} from "lucide-react";
import { updatePublicCatalogAction } from "./actions";
import { clearDemoDataAction, loadDemoDataAction } from "@/lib/demo/actions";

interface SettingsClientProps {
  initialPublicCatalog: boolean;
  isDemoActive: boolean;
  systemInfo: {
    hasGemini: boolean;
    hasGroq: boolean;
    hasOpenAI: boolean;
    uploadDir: string;
  };
}

export function SettingsClient({
  initialPublicCatalog,
  isDemoActive,
  systemInfo,
}: SettingsClientProps) {
  const [isPublicCatalog, setIsPublicCatalog] = useState(initialPublicCatalog);
  const [demoActive, setDemoActive] = useState(isDemoActive);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleTogglePublicCatalog = () => {
    const nextState = !isPublicCatalog;
    setIsPublicCatalog(nextState);
    setFeedback(null);

    startTransition(async () => {
      const res = await updatePublicCatalogAction(nextState);
      if (res.success) {
        setFeedback({
          type: "success",
          message: res.message || "Setting updated successfully.",
        });
      } else {
        // Revert on failure
        setIsPublicCatalog(!nextState);
        setFeedback({
          type: "error",
          message: res.error || "Failed to update setting.",
        });
      }
    });
  };

  const handleToggleDemoData = () => {
    setFeedback(null);
    startTransition(async () => {
      if (demoActive) {
        const res = await clearDemoDataAction();
        if (res.success) {
          setDemoActive(false);
          setFeedback({
            type: "success",
            message: "Demo receipts and placeholder files cleared successfully.",
          });
        } else {
          setFeedback({
            type: "error",
            message: "error" in res ? (res.error as string) : "Failed to clear demo data.",
          });
        }
      } else {
        const res = await loadDemoDataAction();
        if (res.success) {
          setDemoActive(true);
          setFeedback({
            type: "success",
            message: "Spanish demo dataset loaded successfully.",
          });
        } else {
          setFeedback({
            type: "error",
            message: "error" in res ? (res.error as string) : "Failed to load demo dataset.",
          });
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 transition-all ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/30 text-rose-400"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <Check className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-zinc-400 hover:text-zinc-200 text-xs shrink-0 whitespace-nowrap"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Setting: Public vs Private Catalogue Policy */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">
                Catalogue Privacy & Access Policy
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 ${
                  isPublicCatalog
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : "bg-zinc-800 text-zinc-300 border border-zinc-700"
                }`}
              >
                {isPublicCatalog ? (
                  <>
                    <Globe className="w-3 h-3 shrink-0" />
                    <span>Public Catalogue</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3 h-3 shrink-0" />
                    <span>Private Instance</span>
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-zinc-400 max-w-xl">
              Control whether unauthenticated visitors can view public product prices,
              charts, and store directories or if full authentication is mandatory.
            </p>
          </div>

          {/* Toggle Switch */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-mono text-zinc-400">
              {isPublicCatalog ? "Public" : "Private"}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={isPublicCatalog}
              disabled={isPending}
              onClick={handleTogglePublicCatalog}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:opacity-50 ${
                isPublicCatalog ? "bg-emerald-500" : "bg-zinc-700"
              }`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isPublicCatalog ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
            {isPending && (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400 shrink-0" />
            )}
          </div>
        </div>

        {/* Access Matrix Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
              <Eye className="w-3.5 h-3.5 shrink-0" />
              <span>Public Pages (When Enabled)</span>
            </div>
            <p className="text-zinc-400 text-xs">
              Anyone with the link can view these read-only intelligence pages without signing in:
            </p>
            <ul className="list-disc list-inside space-y-1 text-zinc-300 text-xs">
              <li>Home Intelligence Dashboard (<code className="text-zinc-400">/</code>)</li>
              <li>Product Catalogue & Sparklines (<code className="text-zinc-400">/products</code>)</li>
              <li>Multi-Year Price Evolution Charts (<code className="text-zinc-400">/products/[slug]</code>)</li>
              <li>Supermarket Directory & Rankings (<code className="text-zinc-400">/stores</code>)</li>
              <li>Multi-Store Basket Comparator (<code className="text-zinc-400">/compare</code>)</li>
              <li>Instant Product Search API (<code className="text-zinc-400">/api/products/search</code>)</li>
            </ul>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-amber-400">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>Always Protected (Login Required)</span>
            </div>
            <p className="text-zinc-400 text-xs">
              These personal actions and views always require authentication regardless of catalogue mode:
            </p>
            <ul className="list-disc list-inside space-y-1 text-zinc-300 text-xs">
              <li>Receipt Upload Dropzone (<code className="text-zinc-400">/upload</code>)</li>
              <li>AI Verification & Review Workstation (<code className="text-zinc-400">/receipts/[id]/review</code>)</li>
              <li>Receipt Vault Archive (<code className="text-zinc-400">/my-receipts</code>)</li>
              <li>Personal Inflation & Shrinkflation (<code className="text-zinc-400">/my-stats</code>)</li>
              <li>Admin Catalogue & User Management (<code className="text-zinc-400">/admin/*</code>)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Demo Dataset Controls */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">Spanish Demo Dataset</span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 ${
                demoActive
                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                  : "bg-zinc-800 text-zinc-400 border border-zinc-700"
              }`}
            >
              {demoActive ? "Active (Sample Data Loaded)" : "Disabled (Real Data Only)"}
            </span>
          </div>
          <p className="text-xs text-zinc-400 max-w-xl">
            Pre-loads 6 months of historical receipts across Mercadona, Lidl, Carrefour, Consum, and DIA
            with real Spanish tax breakdowns and a shrinkflation benchmark.
          </p>
        </div>

        <button
          type="button"
          disabled={isPending}
          onClick={handleToggleDemoData}
          className={`px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-all whitespace-nowrap shrink-0 disabled:opacity-50 ${
            demoActive
              ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30"
              : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
          }`}
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : demoActive ? (
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          )}
          <span>{demoActive ? "Purge Demo Dataset" : "Load Demo Dataset"}</span>
        </button>
      </div>

      {/* AI Vision & Storage Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
          <div className="flex items-center gap-2 text-zinc-300 font-semibold text-xs uppercase tracking-wide">
            <Cpu className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>AI Multimodal Vision Providers</span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">1. Google Gemini 2.5 Flash</span>
              <span
                className={`font-mono text-xs px-2 py-0.5 rounded whitespace-nowrap shrink-0 ${
                  systemInfo.hasGemini
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {systemInfo.hasGemini ? "Active (Primary)" : "Not Configured"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">2. Groq Multimodal</span>
              <span
                className={`font-mono text-xs px-2 py-0.5 rounded whitespace-nowrap shrink-0 ${
                  systemInfo.hasGroq
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {systemInfo.hasGroq ? "Active (Failover)" : "Not Configured"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">3. OpenAI GPT-4o-mini</span>
              <span
                className={`font-mono text-xs px-2 py-0.5 rounded whitespace-nowrap shrink-0 ${
                  systemInfo.hasOpenAI
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {systemInfo.hasOpenAI ? "Active (Fallback)" : "Not Configured"}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
          <div className="flex items-center gap-2 text-zinc-300 font-semibold text-xs uppercase tracking-wide">
            <Database className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Storage & Persistence</span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Storage Volume</span>
              <span className="font-mono text-xs text-zinc-200 whitespace-nowrap shrink-0">
                {systemInfo.uploadDir}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Image Compression</span>
              <span className="font-mono text-xs text-emerald-400 whitespace-nowrap shrink-0">
                WebP (Thermal Preprocess)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Background Worker</span>
              <span className="font-mono text-xs text-emerald-400 whitespace-nowrap shrink-0">
                BullMQ Receipt Queue
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
