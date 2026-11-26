"use client";

import React, { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Download,
  Upload,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  X,
  HardDrive,
  RefreshCw,
} from "lucide-react";
import { useNativeDialog } from "@/lib/ui/use-native-dialog";
import type {
  BackupInspectionResult,
  BackupRestoreResult,
} from "@/lib/backup/bundle";

interface BackupSummary {
  receiptsCount: number;
  productsCount: number;
  budgetsCount: number;
  artifactFilesCount: number;
  artifactTotalMb: string;
}

export function BackupRestorePanel({
  backupSummary,
}: {
  backupSummary: BackupSummary;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirmDialogRef = useRef<HTMLDialogElement>(null);
  const confirmTitleId = useId();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<BackupInspectionResult | null>(
    null
  );
  const [isInspecting, setIsInspecting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<BackupRestoreResult | null>(null);

  useNativeDialog(confirmDialogRef, confirmOpen, () => {
    setConfirmOpen(false);
    setConfirmText("");
  });

  const handleDownloadBundle = () => {
    window.location.href = "/api/export?format=bundle&range=all";
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setSelectedFile(file);
    setInspection(null);
    setReport(null);
    setError(null);
    setIsInspecting(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("action", "inspect");

      const res = await fetch("/api/export/restore", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Backup inspection failed.");
      } else {
        setInspection(data.inspection as BackupInspectionResult);
      }
    } catch {
      setError("Failed to upload and inspect backup archive.");
    } finally {
      setIsInspecting(false);
    }
  };

  const executeRestore = async (confirmKeyword = "") => {
    if (!selectedFile) return;
    setIsRestoring(true);
    setError(null);
    setReport(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("action", "restore");
      formData.append("mode", restoreMode);
      if (restoreMode === "replace") {
        formData.append("confirmReplace", confirmKeyword);
      }

      const res = await fetch("/api/export/restore", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Backup restore failed.");
      } else {
        setReport(data.report as BackupRestoreResult);
        setConfirmOpen(false);
        setConfirmText("");
        router.refresh();
      }
    } catch {
      setError("Network or server error while restoring backup.");
    } finally {
      setIsRestoring(false);
    }
  };

  const handleStartRestore = () => {
    if (!selectedFile || !inspection) return;
    if (restoreMode === "replace") {
      setConfirmText("");
      setConfirmOpen(true);
      return;
    }
    void executeRestore();
  };

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      {/* Header & Download CTA */}
      <div className="px-5 py-4 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Archive className="w-4 h-4 text-[var(--primary)] shrink-0" />
            <h2 className="font-display font-semibold text-[18px] text-[var(--text-primary)]">
              Portable backup &amp; restore (.zip)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-[var(--primary-tint)] text-[var(--primary)] border border-[var(--primary)]/25 text-[13px] leading-none font-medium whitespace-nowrap shrink-0">
              Full snapshot
            </span>
          </div>
          <p className="text-[13px] text-[var(--text-muted)] max-w-2xl">
            Export a portable archive containing database records alongside stored
            receipt photos, PDFs, and digital receipt files, or restore from a
            snapshot when migrating servers. Encrypted store sign-in sessions are
            excluded.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadBundle}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] font-semibold text-[13px] whitespace-nowrap shrink-0 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>Download backup (.zip)</span>
        </button>
      </div>

      {/* Current Vault Snapshot Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border-b border-[var(--border)]">
        <div className="p-4 sm:p-5 space-y-1">
          <div className="text-[13px] text-[var(--text-muted)]">Receipts</div>
          <div className="font-display font-bold text-[22px] text-[var(--text-primary)] tabular-nums">
            {backupSummary.receiptsCount}
          </div>
        </div>
        <div className="p-4 sm:p-5 space-y-1 border-l border-[var(--border)]">
          <div className="text-[13px] text-[var(--text-muted)]">Products</div>
          <div className="font-display font-bold text-[22px] text-[var(--text-primary)] tabular-nums">
            {backupSummary.productsCount}
          </div>
        </div>
        <div className="p-4 sm:p-5 space-y-1 border-t lg:border-t-0 lg:border-l border-[var(--border)]">
          <div className="text-[13px] text-[var(--text-muted)]">
            Monthly budgets
          </div>
          <div className="font-display font-bold text-[22px] text-[var(--text-primary)] tabular-nums">
            {backupSummary.budgetsCount}
          </div>
        </div>
        <div className="p-4 sm:p-5 space-y-1 border-t border-l lg:border-t-0 border-[var(--border)]">
          <div className="text-[13px] text-[var(--text-muted)] flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
            <span>Stored files</span>
          </div>
          <div className="font-display font-bold text-[22px] text-[var(--primary)] tabular-nums">
            {backupSummary.artifactFilesCount}{" "}
            <span className="text-[13px] font-sans font-normal text-[var(--text-muted)]">
              ({backupSummary.artifactTotalMb.replace(".", ",")} MB)
            </span>
          </div>
        </div>
      </div>

      {/* Restore Upload Area */}
      <div className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              Restore or import backup archive
            </h3>
            <p className="text-[13px] text-[var(--text-muted)]">
              Choose a .zip archive or .json backup to verify file integrity and
              preview changes before writing.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isInspecting || isRestoring}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)] text-[var(--text-primary)] text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors disabled:opacity-50 cursor-pointer self-start sm:self-auto"
          >
            {isInspecting ? (
              <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)] shrink-0" />
            ) : (
              <Upload className="w-4 h-4 text-[var(--primary)] shrink-0" />
            )}
            <span>
              {selectedFile ? "Choose another file" : "Select backup file"}
            </span>
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl border border-[var(--negative)]/30 bg-[var(--negative-tint)] text-[13px] text-[var(--negative)] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {report && (
          <div className="p-4 rounded-xl border border-[var(--positive)]/30 bg-[var(--positive-tint)] space-y-2 text-[13px]">
            <div className="flex items-center gap-2 font-semibold text-[var(--positive)]">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Restore completed (
                {report.mode === "replace" ? "Full replace" : "Safe merge"})
              </span>
            </div>
            <div className="text-[13px] text-[var(--text-primary)] flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
              <span>Receipts restored: {report.restoredReceipts}</span>
              <span>Duplicates skipped: {report.skippedReceipts}</span>
              <span>New products: {report.restoredProducts}</span>
              <span>Receipt matches: {report.restoredAliases}</span>
              <span>Budgets: {report.restoredBudgets}</span>
              <span>Files written: {report.restoredArtifacts}</span>
            </div>
          </div>
        )}

        {/* Inspection Preview Card */}
        {inspection && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-page)]/60 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <ShieldCheck
                  className={`w-4 h-4 shrink-0 ${
                    inspection.checksumsVerified
                      ? "text-[var(--positive)]"
                      : "text-[var(--accent)]"
                  }`}
                />
                <span className="font-semibold text-[var(--text-primary)]">
                  {selectedFile?.name}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-muted)] text-[13px] leading-none tabular-nums whitespace-nowrap shrink-0">
                  v{inspection.formatVersion} · {inspection.scope}
                </span>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full border text-[13px] leading-none font-medium whitespace-nowrap shrink-0 ${
                  inspection.checksumsVerified
                    ? "bg-[var(--positive-tint)] text-[var(--positive)] border-[var(--positive)]/30"
                    : "bg-[var(--accent-tint)] text-[var(--accent)] border-[var(--accent)]/30"
                }`}
              >
                {inspection.checksumsVerified
                  ? "Checksums verified"
                  : "JSON import (no media)"}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[13px] tabular-nums">
              <div>
                <div className="text-[var(--text-muted)]">Receipts</div>
                <div className="text-[var(--text-primary)] font-semibold">
                  {inspection.newReceipts} new{" "}
                  <span className="text-[var(--text-muted)] font-normal">
                    / {inspection.duplicateReceipts} existing
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[var(--text-muted)]">Products</div>
                <div className="text-[var(--text-primary)] font-semibold">
                  {inspection.newProducts} new{" "}
                  <span className="text-[var(--text-muted)] font-normal">
                    / {inspection.existingProducts} existing
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[var(--text-muted)]">
                  Budgets &amp; stores
                </div>
                <div className="text-[var(--text-primary)] font-semibold">
                  {inspection.budgetsCount} budgets · {inspection.newStores} new
                  stores
                </div>
              </div>
              <div>
                <div className="text-[var(--text-muted)]">Receipt files</div>
                <div className="text-[var(--primary)] font-semibold">
                  {inspection.artifactFilesCount} files (
                  {(inspection.totalArtifactBytes / (1024 * 1024))
                    .toFixed(2)
                    .replace(".", ",")}{" "}
                  MB)
                </div>
              </div>
            </div>

            {inspection.warnings.length > 0 && (
              <div className="text-[13px] text-[var(--accent)] space-y-1">
                {inspection.warnings.map((w, idx) => (
                  <div key={idx}>• {w}</div>
                ))}
              </div>
            )}

            {/* Mode Selector & Execute */}
            <div className="pt-3 border-t border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="inline-flex rounded-full p-1 bg-[var(--bg-subtle)] border border-[var(--border)] self-start">
                <button
                  type="button"
                  onClick={() => setRestoreMode("merge")}
                  className={`h-8 px-3 rounded-full text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    restoreMode === "merge"
                      ? "bg-[var(--bg-card)] text-[var(--text-primary)] font-semibold shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Safe merge
                </button>
                <button
                  type="button"
                  onClick={() => setRestoreMode("replace")}
                  className={`h-8 px-3 rounded-full text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    restoreMode === "replace"
                      ? "bg-[var(--negative)] text-[var(--negative-on)] font-semibold shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Replace all data
                </button>
              </div>

              <button
                type="button"
                onClick={handleStartRestore}
                disabled={isRestoring}
                className={`inline-flex items-center gap-2 h-10 px-4 rounded-full text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors disabled:opacity-50 cursor-pointer ${
                  restoreMode === "replace"
                    ? "bg-[var(--negative)] text-[var(--negative-on)]"
                    : "bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)]"
                }`}
              >
                {isRestoring ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                ) : (
                  <RefreshCw className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {isRestoring
                    ? "Restoring..."
                    : restoreMode === "replace"
                    ? "Overwrite & restore snapshot"
                    : "Run safe merge restore"}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Native <dialog> Confirmation for Full Replace */}
      <dialog
        ref={confirmDialogRef}
        aria-labelledby={confirmTitleId}
        className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-2xl border border-[var(--negative)]/40 bg-[var(--bg-card)] text-[var(--text-primary)] p-0 shadow-2xl backdrop:bg-[var(--scrim)] backdrop:backdrop-blur-[2px]"
      >
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 text-[var(--negative)]">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h2
                id={confirmTitleId}
                className="font-display font-semibold text-[18px] text-[var(--text-primary)]"
              >
                Confirm full data replacement
              </h2>
            </div>
            <button
              type="button"
              onClick={() => confirmDialogRef.current?.close("cancel")}
              className="w-8 h-8 rounded-full hover:bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
              aria-label="Close confirmation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">
            This will replace all existing receipts, products, receipt matches,
            and monthly budgets with the snapshot inside{" "}
            <strong className="text-[var(--text-primary)]">
              {selectedFile?.name}
            </strong>
            . Your current admin session stays signed in.
          </p>

          <div className="space-y-1.5">
            <label
              htmlFor="confirm-restore-word"
              className="block text-[13px] font-medium text-[var(--text-primary)]"
            >
              Type RESTORE to proceed
            </label>
            <input
              id="confirm-restore-word"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESTORE"
              autoFocus
              className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--negative)] text-[14px] text-[var(--text-primary)] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => confirmDialogRef.current?.close("cancel")}
              disabled={isRestoring}
              className="h-10 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={confirmText.trim() !== "RESTORE" || isRestoring}
              onClick={() => void executeRestore(confirmText.trim())}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-[var(--negative)] text-[var(--negative-on)] text-[13px] font-semibold whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer"
            >
              {isRestoring && (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              )}
              <span>Confirm replace</span>
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
