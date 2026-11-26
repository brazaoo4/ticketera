"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Globe,
  Lock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Database,
  Trash2,
} from "lucide-react";
import { updatePublicCatalogAction } from "./actions";
import { clearDemoDataAction, loadDemoDataAction } from "@/lib/demo/actions";
import { BackupRestorePanel } from "@/components/admin/backup-restore-panel";

interface SettingsClientProps {
  initialPublicCatalog: boolean;
  isDemoActive: boolean;
  systemInfo: {
    hasGemini: boolean;
    hasGroq: boolean;
    hasOpenAI: boolean;
    uploadDir: string;
  };
  backupSummary: {
    receiptsCount: number;
    productsCount: number;
    budgetsCount: number;
    artifactFilesCount: number;
    artifactTotalMb: string;
  };
}

export function SettingsClient({
  initialPublicCatalog,
  isDemoActive,
  systemInfo,
  backupSummary,
}: SettingsClientProps) {
  const router = useRouter();
  const [isPublicCatalog, setIsPublicCatalog] = useState(initialPublicCatalog);
  const [demoActive, setDemoActive] = useState(isDemoActive);
  const [confirmClearDemo, setConfirmClearDemo] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  function handleTogglePublicCatalog() {
    const nextState = !isPublicCatalog;
    setIsPublicCatalog(nextState);
    setFeedback(null);

    startTransition(async () => {
      const res = await updatePublicCatalogAction(nextState);
      if (!res.success) {
        setIsPublicCatalog(!nextState);
        setFeedback({
          type: "error",
          message: res.error || "Could not update household privacy setting.",
        });
      } else {
        setFeedback({
          type: "success",
          message: nextState
            ? "Public price tracker enabled for anyone opening your link."
            : "Tracker restricted to signed-in household members.",
        });
        router.refresh();
      }
    });
  }

  function handleLoadDemo() {
    setFeedback(null);
    startTransition(async () => {
      const res = await loadDemoDataAction();
      if (!res.success) {
        setFeedback({
          type: "error",
          message:
            ("error" in res && res.error) ||
            "Could not load sample household receipts.",
        });
      } else {
        setDemoActive(true);
        setConfirmClearDemo(false);
        setFeedback({
          type: "success",
          message:
            "Sample receipts and supermarket prices are now active across your views.",
        });
        router.refresh();
      }
    });
  }

  function handleClearDemo() {
    setFeedback(null);
    startTransition(async () => {
      const res = await clearDemoDataAction();
      if (!res.success) {
        setFeedback({
          type: "error",
          message:
            ("error" in res && res.error) || "Could not clear sample data.",
        });
      } else {
        setDemoActive(false);
        setConfirmClearDemo(false);
        setFeedback({
          type: "success",
          message:
            "Sample receipts and prices removed. Your own receipts remain untouched.",
        });
        router.refresh();
      }
    });
  }

  const readerCount = [
    systemInfo.hasGemini,
    systemInfo.hasGroq,
    systemInfo.hasOpenAI,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          role={feedback.type === "error" ? "alert" : "status"}
          className={`rounded-2xl border px-4 py-3 flex items-center gap-2.5 text-[14px] ${
            feedback.type === "error"
              ? "border-[var(--negative)]/30 bg-[var(--negative-tint)] text-[var(--negative)]"
              : "border-[var(--positive)]/30 bg-[var(--positive-tint)] text-[var(--positive)]"
          }`}
        >
          {feedback.type === "error" ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Privacy & Access */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 max-w-2xl">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isPublicCatalog
                  ? "bg-[var(--primary-tint)] text-[var(--primary)]"
                  : "bg-[var(--accent-tint)] text-[var(--accent)]"
              }`}
            >
              {isPublicCatalog ? (
                <Globe className="w-5 h-5" />
              ) : (
                <Lock className="w-5 h-5" />
              )}
            </div>
            <div className="space-y-1">
              <h2 className="font-display font-semibold text-[18px] text-[var(--text-primary)]">
                Public price browser
              </h2>
              <p className="text-[14px] text-[var(--text-muted)] leading-relaxed">
                {isPublicCatalog
                  ? "Enabled — guests can browse supermarket prices, item history, and store comparisons without signing in. Personal receipts and spending summaries always require sign-in."
                  : "Private — visitors must sign in before viewing any household prices, groceries, or supermarket comparisons."}
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={isPublicCatalog}
            disabled={isPending}
            onClick={handleTogglePublicCatalog}
            className={`inline-flex items-center gap-2.5 h-10 px-4 rounded-full border text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer disabled:opacity-60 ${
              isPublicCatalog
                ? "border-[var(--primary)] bg-[var(--primary-tint)] text-[var(--primary)]"
                : "border-[var(--border-strong)] bg-[var(--bg-subtle)] text-[var(--text-primary)]"
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isPublicCatalog ? "bg-[var(--primary)]" : "bg-[var(--text-muted)]"
              }`}
            />
            {isPublicCatalog ? "Public access on" : "Sign-in required"}
          </button>
        </div>
      </section>

      {/* Sample Household Data */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 max-w-2xl">
            <div className="w-10 h-10 rounded-xl bg-[var(--primary-tint)] text-[var(--primary)] flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="font-display font-semibold text-[18px] text-[var(--text-primary)]">
                Sample pantry data
              </h2>
              <p className="text-[14px] text-[var(--text-muted)] leading-relaxed">
                {demoActive
                  ? "Sample receipts and price histories from Spanish supermarkets are currently active so you can explore comparisons right away."
                  : "Load a ready-made set of Spanish grocery receipts to preview price history charts and supermarket basket comparisons."}
              </p>
            </div>
          </div>

          <div className="shrink-0">
            {demoActive ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => setConfirmClearDemo((prev) => !prev)}
                className="h-10 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] hover:border-[var(--negative)] text-[13px] font-semibold text-[var(--negative)] inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                <Trash2 className="w-4 h-4" />
                Clear sample data
              </button>
            ) : (
              <button
                type="button"
                disabled={isPending}
                onClick={handleLoadDemo}
                className="h-10 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Load sample data
              </button>
            )}
          </div>
        </div>

        {demoActive && confirmClearDemo && (
          <div className="rounded-xl border border-[var(--negative)]/30 bg-[var(--negative-tint)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-[13px] text-[var(--text-primary)]">
              Remove all sample receipts and products? Receipts you uploaded or
              synced yourself will stay safe.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isPending}
                onClick={handleClearDemo}
                className="h-9 px-4 rounded-full bg-[var(--negative)] text-[var(--negative-on)] text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Yes, clear sample data
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setConfirmClearDemo(false)}
                className="h-9 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Plain-English System Capabilities */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-2.5">
          <Database className="w-4 h-4 text-[var(--primary)]" />
          <h2 className="font-display font-semibold text-[18px] text-[var(--text-primary)]">
            Receipt reading & storage
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border)]">
          <div className="p-5 space-y-2">
            <div className="font-medium text-[15px] text-[var(--text-primary)]">
              Automatic receipt readers
            </div>
            <p className="text-[13px] text-[var(--text-muted)]">
              {readerCount > 0
                ? `${readerCount} configured reader ${
                    readerCount === 1 ? "provider is" : "providers are"
                  } active to extract supermarket line items and pack weights.`
                : "No automatic receipt reader key is currently configured on the server."}
            </p>
            <div className="pt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
              <span
                className={
                  systemInfo.hasGemini
                    ? "text-[var(--positive)] font-medium"
                    : "text-[var(--text-muted)]"
                }
              >
                Primary reader: {systemInfo.hasGemini ? "Ready" : "Not configured"}
              </span>
              <span
                className={
                  systemInfo.hasGroq
                    ? "text-[var(--positive)] font-medium"
                    : "text-[var(--text-muted)]"
                }
              >
                Backup reader 1: {systemInfo.hasGroq ? "Ready" : "Not configured"}
              </span>
              <span
                className={
                  systemInfo.hasOpenAI
                    ? "text-[var(--positive)] font-medium"
                    : "text-[var(--text-muted)]"
                }
              >
                Backup reader 2: {systemInfo.hasOpenAI ? "Ready" : "Not configured"}
              </span>
            </div>
          </div>

          <div className="p-5 space-y-2">
            <div className="font-medium text-[15px] text-[var(--text-primary)]">
              Receipt archive storage
            </div>
            <p className="text-[13px] text-[var(--text-muted)]">
              Uploaded photos and supermarket PDFs are stored privately on your
              server and optimized for fast drawer previews.
            </p>
            <div className="pt-1 text-[13px] text-[var(--text-primary)] font-medium break-all">
              Archive folder: {systemInfo.uploadDir}
            </div>
          </div>
        </div>
      </section>

      <BackupRestorePanel backupSummary={backupSummary} />
    </div>
  );
}
