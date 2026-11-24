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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-6">
      {/* Header & Download CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Archive className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-sm font-semibold text-white">
              Portable Backup & Restore (.zip)
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-semibold whitespace-nowrap shrink-0">
              Full Snapshot
            </span>
          </div>
          <p className="text-xs text-zinc-400 max-w-2xl">
            Export a portable archive containing database records alongside stored receipt artifacts (WebP, PDF, and JSON files from <code className="text-zinc-300">UPLOAD_DIR</code>), or restore from a snapshot during server migrations. Encrypted store sync tokens are excluded.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadBundle}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs whitespace-nowrap shrink-0 shadow-md shadow-emerald-500/20 transition-colors"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>Download Full Backup (.zip)</span>
        </button>
      </div>

      {/* Current Vault Snapshot Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-1">
          <div className="text-[10px] uppercase text-zinc-500">Receipts</div>
          <div className="text-lg font-bold text-white tabular-nums">
            {backupSummary.receiptsCount}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-1">
          <div className="text-[10px] uppercase text-zinc-500">Products</div>
          <div className="text-lg font-bold text-white tabular-nums">
            {backupSummary.productsCount}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-1">
          <div className="text-[10px] uppercase text-zinc-500">Monthly Budgets</div>
          <div className="text-lg font-bold text-white tabular-nums">
            {backupSummary.budgetsCount}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-1">
          <div className="text-[10px] uppercase text-zinc-500 flex items-center gap-1">
            <HardDrive className="w-3 h-3 text-emerald-400 shrink-0" />
            <span>Stored Artifacts</span>
          </div>
          <div className="text-lg font-bold text-emerald-400 tabular-nums">
            {backupSummary.artifactFilesCount}{" "}
            <span className="text-[11px] font-normal text-zinc-400">
              ({backupSummary.artifactTotalMb} MB)
            </span>
          </div>
        </div>
      </div>

      {/* Restore Upload Area */}
      <div className="rounded-2xl border border-dashed border-zinc-700/80 bg-zinc-950/50 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h3 className="text-xs font-bold uppercase font-mono tracking-wider text-zinc-200">
              Restore / Import Backup Archive
            </h3>
            <p className="text-xs text-zinc-400">
              Select a <code className="text-zinc-300">.zip</code> portable bundle (or legacy <code className="text-zinc-300">.json</code> export) to inspect checksums and preview changes before writing.
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
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
          >
            {isInspecting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400 shrink-0" />
            ) : (
              <Upload className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
            <span>{selectedFile ? "Choose Different File" : "Select Backup File"}</span>
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {report && (
          <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Restore completed ({report.mode === "replace" ? "Full Replace" : "Safe Merge"})
              </span>
            </div>
            <div className="font-mono text-[11px] text-zinc-200 flex flex-wrap gap-3 tabular-nums">
              <span>Receipts restored: {report.restoredReceipts}</span>
              <span>Duplicates skipped: {report.skippedReceipts}</span>
              <span>New products: {report.restoredProducts}</span>
              <span>Aliases: {report.restoredAliases}</span>
              <span>Budgets: {report.restoredBudgets}</span>
              <span>Files written: {report.restoredArtifacts}</span>
            </div>
          </div>
        )}

        {/* Inspection Preview Card */}
        {inspection && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-xs font-mono">
                <ShieldCheck
                  className={`w-4 h-4 shrink-0 ${
                    inspection.checksumsVerified ? "text-emerald-400" : "text-amber-400"
                  }`}
                />
                <span className="font-bold text-white">{selectedFile?.name}</span>
                <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] whitespace-nowrap shrink-0">
                  v{inspection.formatVersion} · {inspection.scope}
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold whitespace-nowrap shrink-0 ${
                  inspection.checksumsVerified
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : "bg-amber-500/10 text-amber-300 border border-amber-500/30"
                }`}
              >
                {inspection.checksumsVerified
                  ? "SHA-256 Verified"
                  : "JSON Import (No Media)"}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
              <div>
                <div className="text-[10px] text-zinc-500">Receipts</div>
                <div className="text-zinc-200 font-bold">
                  {inspection.newReceipts} new{" "}
                  <span className="text-zinc-500 font-normal">
                    / {inspection.duplicateReceipts} existing
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500">Products</div>
                <div className="text-zinc-200 font-bold">
                  {inspection.newProducts} new{" "}
                  <span className="text-zinc-500 font-normal">
                    / {inspection.existingProducts} existing
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500">Budgets & Stores</div>
                <div className="text-zinc-200 font-bold">
                  {inspection.budgetsCount} budgets · {inspection.newStores} new stores
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500">Receipt Files</div>
                <div className="text-emerald-400 font-bold">
                  {inspection.artifactFilesCount} files (
                  {(inspection.totalArtifactBytes / (1024 * 1024)).toFixed(2)} MB)
                </div>
              </div>
            </div>

            {inspection.warnings.length > 0 && (
              <div className="text-[11px] font-mono text-amber-300 space-y-1">
                {inspection.warnings.map((w, idx) => (
                  <div key={idx}>• {w}</div>
                ))}
              </div>
            )}

            {/* Mode Selector & Execute */}
            <div className="pt-3 border-t border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="inline-flex rounded-xl p-1 bg-zinc-950 border border-zinc-800 self-start">
                <button
                  type="button"
                  onClick={() => setRestoreMode("merge")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                    restoreMode === "merge"
                      ? "bg-emerald-500 text-zinc-950 shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Safe Merge (Skip Duplicates)
                </button>
                <button
                  type="button"
                  onClick={() => setRestoreMode("replace")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                    restoreMode === "replace"
                      ? "bg-rose-500 text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Full Replace (Overwrite DB)
                </button>
              </div>

              <button
                type="button"
                onClick={handleStartRestore}
                disabled={isRestoring}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-colors disabled:opacity-50 ${
                  restoreMode === "replace"
                    ? "bg-rose-600 hover:bg-rose-500 text-white"
                    : "bg-emerald-500 hover:bg-emerald-400 text-zinc-950"
                }`}
              >
                {isRestoring ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>
                  {isRestoring
                    ? "Restoring..."
                    : restoreMode === "replace"
                    ? "Overwrite & Restore Snapshot"
                    : "Run Safe Merge Restore"}
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
        className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-2xl border border-rose-500/40 bg-zinc-950 text-zinc-100 p-0 shadow-2xl backdrop:bg-black/80 backdrop:backdrop-blur-sm"
      >
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 text-rose-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h1 id={confirmTitleId} className="text-base font-bold text-white">
                Confirm Full Replace Restore
              </h1>
            </div>
            <button
              type="button"
              onClick={() => confirmDialogRef.current?.close("cancel")}
              className="p-1 rounded-lg text-zinc-400 hover:text-white whitespace-nowrap shrink-0"
              aria-label="Close confirmation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            This will replace all existing receipts, products, aliases, and monthly budgets with the snapshot inside{" "}
            <strong className="text-zinc-200">{selectedFile?.name}</strong>. Your current admin account session remains intact.
          </p>

          <div className="space-y-1.5">
            <label
              htmlFor="confirm-restore-word"
              className="block text-[11px] font-mono uppercase text-zinc-400"
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
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono text-white focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => confirmDialogRef.current?.close("cancel")}
              disabled={isRestoring}
              className="px-4 py-2 rounded-xl border border-zinc-800 text-xs text-zinc-300 hover:bg-zinc-900 whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={confirmText.trim() !== "RESTORE" || isRestoring}
              onClick={() => void executeRestore(confirmText.trim())}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold whitespace-nowrap shrink-0 disabled:opacity-40"
            >
              {isRestoring && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
              <span>Confirm Replace</span>
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
