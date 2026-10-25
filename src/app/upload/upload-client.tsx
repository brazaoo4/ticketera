"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  UploadCloud,
  FileText,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  Store as StoreIcon,
  ArrowRight,
  X,
  Layers,
  Zap,
  Plus,
  Trash2,
} from "lucide-react";
import { deleteReceiptAction } from "@/app/receipts/[id]/review/actions";

interface StoreOption {
  id: string;
  name: string;
  slug: string;
  brandHex: string;
}

interface BatchReceiptItem {
  receiptId: string;
  fileName: string;
  status: "PENDING" | "PROCESSING" | "REVIEW" | "CONFIRMED" | "FAILED";
  duplicate?: boolean;
  errorMessage?: string;
}

export function UploadClient({
  stores,
  initialReceiptId,
  initialDuplicateId,
  initialError,
}: {
  stores: StoreOption[];
  initialReceiptId?: string | null;
  initialDuplicateId?: string | null;
  initialError?: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Staged files & mode
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadMode, setUploadMode] = useState<"batch" | "stitch">("batch");
  const [filePreviews, setFilePreviews] = useState<Record<string, string>>({});

  // Metadata overrides
  const [selectedStoreId, setSelectedStoreId] = useState<string>("auto");
  const [purchaseDate, setPurchaseDate] = useState<string>("");

  // Upload & error states
  const [isUploading, setIsUploading] = useState(Boolean(initialReceiptId));
  const [uploadError, setUploadError] = useState<string | null>(
    initialError === "nofile"
      ? "No receipt file was received. Please try sharing again."
      : initialError === "toolarge"
      ? "Shared file exceeds the 50MB limit."
      : initialError === "processing"
      ? "Error processing the shared ticket. Please try uploading manually."
      : null
  );
  const [duplicateNotice, setDuplicateNotice] = useState<{
    receiptId: string;
    message: string;
  } | null>(
    initialDuplicateId
      ? {
          receiptId: initialDuplicateId,
          message: "Receipt has already been uploaded previously (SHA-256 duplicate match).",
        }
      : null
  );

  // Single / Stitched Processing state
  const [activeReceiptId, setActiveReceiptId] = useState<string | null>(initialReceiptId || null);
  const [receiptStatus, setReceiptStatus] = useState<string | null>(initialReceiptId ? "PENDING" : null);
  const [processingStep, setProcessingStep] = useState<number>(initialReceiptId ? 2 : 1);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Batch Processing Queue state
  const [batchQueue, setBatchQueue] = useState<BatchReceiptItem[]>([]);
  const [isBatchActive, setIsBatchActive] = useState<boolean>(false);

  // Check if all staged files are images for stitch mode eligibility
  const allStagedAreImages =
    selectedFiles.length >= 2 &&
    selectedFiles.every((f) => f.type.startsWith("image/"));

  // Generate object URL previews for staged images
  useEffect(() => {
    const urls: Record<string, string> = {};
    selectedFiles.forEach((file) => {
      if (file.type.startsWith("image/")) {
        urls[file.name] = URL.createObjectURL(file);
      }
    });
    setFilePreviews(urls);

    return () => {
      Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
    };
  }, [selectedFiles]);

  // Elapsed time counter during single processing
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (activeReceiptId && (receiptStatus === "PENDING" || receiptStatus === "PROCESSING")) {
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [activeReceiptId, receiptStatus]);

  // Single Receipt Status Polling Effect
  useEffect(() => {
    if (!activeReceiptId) return;
    if (receiptStatus === "REVIEW" || receiptStatus === "CONFIRMED") {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/receipts/${activeReceiptId}/status`);
        if (!res.ok) return;

        const data = await res.json();
        setReceiptStatus(data.status);

        if (data.status === "PROCESSING") {
          setProcessingStep(3);
        }

        if (data.status === "REVIEW") {
          setProcessingStep(4);
          setUploadError(null);

          // Redirect to review workstation after brief success animation
          setTimeout(() => {
            router.push(`/receipts/${activeReceiptId}/review`);
          }, 1400);
        } else if (data.status === "FAILED") {
          setUploadError(data.errorMessage || "Failed to process receipt.");
        }
      } catch (err) {
        console.warn("Status polling error:", err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeReceiptId, receiptStatus, router]);

  // Batch Progress Polling Effect
  useEffect(() => {
    if (!isBatchActive || batchQueue.length === 0) return;

    // Check if any receipt still pending or processing
    const hasPending = batchQueue.some(
      (item) => item.status === "PENDING" || item.status === "PROCESSING"
    );
    if (!hasPending) return;

    const interval = setInterval(async () => {
      try {
        const updated = await Promise.all(
          batchQueue.map(async (item) => {
            if (item.status === "REVIEW" || item.status === "CONFIRMED" || item.status === "FAILED") {
              return item;
            }
            if (!item.receiptId) return item;

            try {
              const res = await fetch(`/api/receipts/${item.receiptId}/status`);
              if (res.ok) {
                const data = await res.json();
                return {
                  ...item,
                  status: data.status,
                  errorMessage: data.errorMessage,
                };
              }
            } catch {
              // Ignore single polling error
            }
            return item;
          })
        );

        setBatchQueue(updated);
      } catch (batchErr) {
        console.warn("Batch status polling error:", batchErr);
      }
    }, 1200);

    return () => clearInterval(interval);
  }, [isBatchActive, batchQueue]);

  const addFilesToSelection = (incoming: File[]) => {
    const validFiles: File[] = [];
    let tooLarge = false;

    incoming.forEach((file) => {
      if (file.size > 50 * 1024 * 1024) {
        tooLarge = true;
      } else {
        validFiles.push(file);
      }
    });

    if (tooLarge) {
      setUploadError("One or more files exceed the 50 MB limit and were skipped.");
    } else {
      setUploadError(null);
    }

    setSelectedFiles((prev) => {
      const merged = [...prev, ...validFiles];
      // Limit to max 15 files
      return merged.slice(0, 15);
    });
    setDuplicateNotice(null);
  };

  const removeFileFromSelection = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
    setUploadError(null);
    setDuplicateNotice(null);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToSelection(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToSelection(Array.from(e.target.files));
    }
  };

  const handleUploadSubmit = async () => {
    if (selectedFiles.length === 0) {
      setUploadError("Please select at least one receipt photo or PDF first.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setDuplicateNotice(null);
    setElapsedSeconds(0);
    setProcessingStep(1);

    const formData = new FormData();
    formData.append("mode", uploadMode);

    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });

    if (selectedStoreId && selectedStoreId !== "auto") {
      formData.append("storeId", selectedStoreId);
    }
    if (purchaseDate) {
      formData.append("purchaseDate", purchaseDate);
    }

    try {
      setProcessingStep(2);
      const res = await fetch("/api/receipts/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setIsUploading(false);

      if (!res.ok) {
        setUploadError(data.error || "Upload failed. Please try again.");
        return;
      }

      if (data.duplicate && (!data.receipts || data.receipts.length <= 1)) {
        setDuplicateNotice({
          receiptId: data.receiptId,
          message: data.message || "Receipt was already uploaded previously.",
        });
        return;
      }

      // Check if Long Receipt Stitch mode was selected OR single file
      if (uploadMode === "stitch" || selectedFiles.length === 1) {
        setActiveReceiptId(data.receiptId);
        setReceiptStatus(data.status || "PENDING");
        setProcessingStep(3);
      } else {
        // Batch Mode: populate batch queue
        const incomingQueue: BatchReceiptItem[] = (data.receipts || []).map(
          (r: { receiptId: string; fileName: string; status: string; duplicate?: boolean; error?: string }) => ({
            receiptId: r.receiptId,
            fileName: r.fileName,
            status: r.status as BatchReceiptItem["status"],
            duplicate: r.duplicate,
            errorMessage: r.error,
          })
        );

        setBatchQueue(incomingQueue);
        setIsBatchActive(true);
      }
    } catch (err: unknown) {
      setIsUploading(false);
      setUploadError(
        err instanceof Error ? err.message : "Error connecting to upload server."
      );
    }
  };

  // Batch summary metrics
  const readyBatchReceipts = batchQueue.filter(
    (item) => item.status === "REVIEW" || item.status === "CONFIRMED"
  );
  const firstReadyBatchReceipt = readyBatchReceipts[0] || null;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b border-zinc-800 pb-6 space-y-2">
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
          <span>ADD RECEIPT</span>
          <span>/</span>
          <span className="text-emerald-400">SCAN & DIGITIZE</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Camera className="w-6 h-6 text-emerald-400" />
              <span>Upload Grocery Receipt</span>
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Supports single tickets, multi-file batch uploads (up to 15 receipts), or multi-photo long receipt stitching.
            </p>
          </div>
        </div>
      </div>

      {/* Duplicate Notice Banner */}
      {duplicateNotice && (
        <div
          role="alert"
          className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs space-y-2 animate-in fade-in"
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Duplicate Receipt Detected</span>
          </div>
          <p className="leading-relaxed text-zinc-300">
            {duplicateNotice.message}
          </p>
          <div className="pt-1">
            <button
              onClick={() => router.push(`/receipts/${duplicateNotice.receiptId}/review`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-950 font-bold text-xs whitespace-nowrap shrink-0 hover:bg-amber-400 transition-colors"
            >
              <span>View Existing Receipt</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Upload Error Banner */}
      {uploadError && (
        <div
          role="alert"
          className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in"
        >
          <div className="flex items-start gap-3 flex-1">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-rose-300">Error processing receipt</div>
              <p className="leading-relaxed text-rose-200/90">{uploadError}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            {activeReceiptId && (
              <button
                type="button"
                onClick={async () => {
                  const idToDelete = activeReceiptId;
                  setActiveReceiptId(null);
                  setReceiptStatus(null);
                  setUploadError(null);
                  await deleteReceiptAction(idToDelete).catch(() => null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-300" />
                <span>Discard</span>
              </button>
            )}
            <button
              onClick={() => {
                setUploadError(null);
                setActiveReceiptId(null);
                setReceiptStatus(null);
              }}
              className="p-1 text-rose-400 hover:text-rose-200 whitespace-nowrap shrink-0"
              title="Dismiss alert"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* BATCH PROGRESS QUEUE (when batch processing is active) */}
      {isBatchActive && batchQueue.length > 0 && (
        <div className="rounded-2xl border border-emerald-500/40 bg-zinc-900/90 p-6 sm:p-8 space-y-6 shadow-2xl backdrop-blur animate-in zoom-in-95">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>Batch Processing Queue</span>
                </h3>
              </div>
              <p className="text-xs text-zinc-400">
                {readyBatchReceipts.length} of {batchQueue.length} receipts ready for review
              </p>
            </div>

            {/* Quick Review Jump CTA */}
            {firstReadyBatchReceipt && (
              <button
                type="button"
                onClick={() => router.push(`/receipts/${firstReadyBatchReceipt.receiptId}/review`)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs sm:text-sm whitespace-nowrap shrink-0 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
              >
                <Zap className="w-4 h-4 fill-zinc-950" />
                <span>
                  ⚡ Start Rapid Review ({readyBatchReceipts.length}{" "}
                  {readyBatchReceipts.length === 1 ? "receipt ready" : "receipts ready"}) →
                </span>
              </button>
            )}
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-zinc-950 rounded-full h-2 overflow-hidden border border-zinc-800">
            <div
              className="bg-emerald-500 h-full transition-all duration-500"
              style={{
                width: `${Math.round((readyBatchReceipts.length / batchQueue.length) * 100)}%`,
              }}
            />
          </div>

          {/* Queue Item Cards */}
          <div className="grid grid-cols-1 gap-2.5 font-mono text-xs">
            {batchQueue.map((item, idx) => (
              <div
                key={item.receiptId || idx}
                className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-800 bg-zinc-950/70 gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                    <FileText className="w-3.5 h-3.5 text-zinc-400" />
                  </div>
                  <div className="truncate">
                    <div className="text-zinc-200 font-semibold truncate">
                      {item.fileName}
                    </div>
                    {item.errorMessage ? (
                      <div className="text-[11px] text-rose-300 font-medium truncate max-w-xs sm:max-w-md">
                        {item.errorMessage}
                      </div>
                    ) : item.receiptId ? (
                      <div className="text-[10px] text-zinc-500">
                        ID: #{item.receiptId.slice(-8)}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  {item.status === "REVIEW" || item.status === "CONFIRMED" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold whitespace-nowrap shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Ready</span>
                    </span>
                  ) : item.status === "PROCESSING" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[11px] font-bold whitespace-nowrap shrink-0">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Extracting</span>
                    </span>
                  ) : item.status === "FAILED" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[11px] font-bold whitespace-nowrap shrink-0">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Failed</span>
                    </span>
                  ) : item.duplicate ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[11px] font-bold whitespace-nowrap shrink-0">
                      <span>Duplicate</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700/60 text-[11px] font-bold whitespace-nowrap shrink-0">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />
                      <span>Queued</span>
                    </span>
                  )}

                  {item.status === "FAILED" && (
                    <button
                      type="button"
                      onClick={async () => {
                        const idToDelete = item.receiptId;
                        setBatchQueue((prev) => prev.filter((b) => b !== item));
                        if (idToDelete) {
                          await deleteReceiptAction(idToDelete).catch(() => null);
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors flex items-center gap-1"
                      title="Discard failed receipt"
                    >
                      <Trash2 className="w-3 h-3 text-rose-300" />
                      <span>Discard</span>
                    </button>
                  )}

                  {item.receiptId && (item.status === "REVIEW" || item.status === "CONFIRMED") && (
                    <button
                      type="button"
                      onClick={() => router.push(`/receipts/${item.receiptId}/review`)}
                      className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors flex items-center gap-1"
                    >
                      <span>Review</span>
                      <ArrowRight className="w-3 h-3 text-emerald-400" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setIsBatchActive(false);
                setBatchQueue([]);
                setSelectedFiles([]);
              }}
              className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
            >
              Upload More Tickets
            </button>
          </div>
        </div>
      )}

      {/* SINGLE / STITCH PROCESSING TELEMETRY (when actively parsing 1 ticket) */}
      {!isBatchActive && activeReceiptId && receiptStatus !== "FAILED" && (
        <div className="rounded-2xl border border-emerald-500/40 bg-zinc-900/90 p-6 sm:p-8 space-y-6 shadow-2xl backdrop-blur animate-in zoom-in-95">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Processing Receipt</span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-emerald-400 border border-zinc-700/60">
                    {activeReceiptId.slice(-8)}
                  </span>
                </h3>
                <p className="text-xs text-zinc-400">
                  Extracting line items, prices, and unit measurements
                </p>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] font-mono text-zinc-500 uppercase">Elapsed Time</div>
              <div className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
                {elapsedSeconds}s
              </div>
            </div>
          </div>

          {/* Stepper Progress */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs font-mono">
            {/* Step 1 */}
            <div
              className={`p-3 rounded-xl border flex flex-col gap-1 ${
                processingStep >= 1
                  ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-300"
                  : "border-zinc-800 bg-zinc-950/60 text-zinc-500"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">1. UPLOAD & PREP</span>
                {processingStep > 1 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                )}
              </div>
              <span className="text-[11px] text-zinc-400">
                {uploadMode === "stitch" ? "Stitched & hashed" : "Deduplication verified"}
              </span>
            </div>

            {/* Step 2 */}
            <div
              className={`p-3 rounded-xl border flex flex-col gap-1 ${
                processingStep >= 2
                  ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-300"
                  : "border-zinc-800 bg-zinc-950/60 text-zinc-500"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">2. SHARP / PDF</span>
                {processingStep > 2 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : processingStep === 2 ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                ) : (
                  <span className="text-[10px] text-zinc-600">Pending</span>
                )}
              </div>
              <span className="text-[11px] text-zinc-400">Contrast enhanced</span>
            </div>

            {/* Step 3 */}
            <div
              className={`p-3 rounded-xl border flex flex-col gap-1 ${
                processingStep >= 3
                  ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-300"
                  : "border-zinc-800 bg-zinc-950/60 text-zinc-500"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">3. AI FAILOVER</span>
                {processingStep > 3 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : processingStep === 3 ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                ) : (
                  <span className="text-[10px] text-zinc-600">Pending</span>
                )}
              </div>
              <span className="text-[11px] text-zinc-400">Gemini/Groq/OpenAI</span>
            </div>

            {/* Step 4 */}
            <div
              className={`p-3 rounded-xl border flex flex-col gap-1 ${
                processingStep >= 4
                  ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-300"
                  : "border-zinc-800 bg-zinc-950/60 text-zinc-500"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs">4. PRODUCT MATCHING</span>
                {processingStep >= 4 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <span className="text-[10px] text-zinc-600">Pending</span>
                )}
              </div>
              <span className="text-[11px] text-zinc-400">Catalogue cross-reference</span>
            </div>
          </div>

          {/* Extraction Success Pill */}
          {receiptStatus === "REVIEW" && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-emerald-300 animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <span className="font-bold">Extraction Complete!</span> All receipt items are ready for your review.
                </div>
              </div>
              <button
                onClick={() => router.push(`/receipts/${activeReceiptId}/review`)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 text-zinc-950 font-bold whitespace-nowrap shrink-0 hover:bg-emerald-400 transition-colors"
              >
                <span>Proceed to Review</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* MAIN UPLOAD FORM (when not currently parsing in active state) */}
      {!isBatchActive && (!activeReceiptId || receiptStatus === "FAILED") && (
        <div className="space-y-6">
          {/* Dropzone Card */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative overflow-hidden rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-all cursor-pointer group ${
              selectedFiles.length > 0
                ? "border-emerald-500/60 bg-emerald-500/5"
                : "border-zinc-800 bg-zinc-900/40 hover:border-emerald-500/40 hover:bg-zinc-900/70"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            <input
              ref={cameraInputRef}
              type="file"
              multiple
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />

            <div className="max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center mx-auto text-zinc-400 group-hover:text-emerald-400 group-hover:scale-105 transition-all">
                {selectedFiles.length > 1 ? (
                  <Layers className="w-8 h-8 stroke-[1.8] text-emerald-400" />
                ) : (
                  <UploadCloud className="w-8 h-8 stroke-[1.8]" />
                )}
              </div>

              <div className="space-y-1">
                {selectedFiles.length > 0 ? (
                  <>
                    <h2 className="text-base font-semibold text-zinc-100">
                      {selectedFiles.length === 1
                        ? selectedFiles[0].name
                        : `${selectedFiles.length} files selected for upload`}
                    </h2>
                    <p className="text-xs text-zinc-400 font-mono">
                      Total size:{" "}
                      {(
                        selectedFiles.reduce((sum, f) => sum + f.size, 0) /
                        (1024 * 1024)
                      ).toFixed(2)}{" "}
                      MB
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-base font-semibold text-zinc-100">
                      Drag and drop your receipt photos or PDFs here
                    </h2>
                    <p className="text-xs text-zinc-400">
                      Select up to 15 receipts at once, or take multiple photos of a long receipt.
                    </p>
                  </>
                )}
              </div>

              {/* Action Buttons inside Dropzone */}
              <div
                className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-zinc-950 font-semibold text-xs whitespace-nowrap shrink-0 shadow-md shadow-emerald-500/20 transition-all"
                >
                  <Camera className="w-4 h-4 stroke-[2.2]" />
                  <span>Take Photo with Camera</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-medium text-xs whitespace-nowrap shrink-0 transition-colors"
                >
                  <FileText className="w-4 h-4 text-zinc-400" />
                  <span>Choose Files</span>
                </button>

                {selectedFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAllFiles}
                    className="p-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-rose-400 whitespace-nowrap shrink-0 transition-colors"
                    title="Clear selection"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Staged Files List (when 1+ files are chosen) */}
          {selectedFiles.length > 0 && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
                <span className="font-semibold text-zinc-200 text-xs flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>Staged Files ({selectedFiles.length})</span>
                </span>

                {/* Sleek Mode Toggle (when 2+ images are staged) */}
                {selectedFiles.length >= 2 && (
                  <div className="flex items-center gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-xl overflow-x-auto">
                    <button
                      type="button"
                      onClick={() => setUploadMode("batch")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                        uploadMode === "batch"
                          ? "bg-emerald-500 text-zinc-950 shadow-sm"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      📦 Batch: Process separately ({selectedFiles.length} receipts)
                    </button>

                    <button
                      type="button"
                      disabled={!allStagedAreImages}
                      onClick={() => setUploadMode("stitch")}
                      title={
                        !allStagedAreImages
                          ? "Long receipt stitch mode is only available for images"
                          : undefined
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        uploadMode === "stitch"
                          ? "bg-emerald-500 text-zinc-950 shadow-sm"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      📜 Long Receipt: Stitch photos into 1 receipt
                    </button>
                  </div>
                )}
              </div>

              {/* List of staged cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {selectedFiles.map((file, idx) => {
                  const preview = filePreviews[file.name];
                  return (
                    <div
                      key={`${file.name}-${idx}`}
                      className="flex items-center gap-3 p-2.5 rounded-xl border border-zinc-800 bg-zinc-950/60 relative group"
                    >
                      {preview ? (
                        <div className="w-12 h-14 rounded-lg overflow-hidden border border-zinc-700/80 shrink-0 bg-zinc-900">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={preview}
                            alt={file.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-14 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center shrink-0 text-zinc-400">
                          <FileText className="w-6 h-6 stroke-[1.8]" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-zinc-200 truncate">
                          {file.name}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400 mt-0.5">
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFileFromSelection(idx)}
                        className="p-1 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-800/80 transition-colors whitespace-nowrap shrink-0"
                        title="Remove file"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}

                {/* Add More button */}
                {selectedFiles.length < 15 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-zinc-800 hover:border-emerald-500/40 bg-zinc-950/30 hover:bg-zinc-900/40 text-xs font-semibold text-zinc-400 hover:text-emerald-400 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add more photos</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Optional Metadata Overrides Box */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <span className="font-semibold text-zinc-200 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Optional Extraction Overrides</span>
              </span>
              <span className="text-[11px] font-mono text-zinc-500">
                AI will detect automatically if left untouched
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Store Override */}
              <div className="space-y-1.5">
                <label className="text-zinc-400 font-mono flex items-center gap-1.5">
                  <StoreIcon className="w-3.5 h-3.5 text-zinc-500" />
                  <span>SUPERMARKET CHAIN</span>
                </label>
                <select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                >
                  <option value="auto">✨ Auto-Detect Supermarket with AI</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Purchase Date Override */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-zinc-400 font-mono flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                    <span>PURCHASE DATE</span>
                  </label>
                  {!purchaseDate && (
                    <span className="text-[10px] font-mono text-emerald-400">✨ Auto-detect with AI</span>
                  )}
                </div>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* Main Submit Button */}
          <button
            type="button"
            onClick={() => handleUploadSubmit()}
            disabled={selectedFiles.length === 0 || isUploading}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-zinc-950 font-bold text-sm shadow-xl shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0 transition-all"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>
                  {uploadMode === "stitch"
                    ? "Stitching photos and processing long receipt..."
                    : selectedFiles.length > 1
                    ? `Uploading batch (${selectedFiles.length} receipts)...`
                    : "Processing receipt..."}
                </span>
              </>
            ) : (
              <>
                <UploadCloud className="w-5 h-5 stroke-[2.2]" />
                <span>
                  {uploadMode === "stitch"
                    ? `Stitch ${selectedFiles.length} photos into 1 Long Receipt & Extract`
                    : selectedFiles.length > 1
                    ? `Upload Batch (${selectedFiles.length} receipts) & Process with AI`
                    : "Upload & Extract Items with AI"}
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* 3 Pipeline Explanations */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-zinc-800/80">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] font-mono">
              1
            </span>
            <span>Image Preprocessing</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Optimizes receipt photos, straightens orientation, and stitches multi-part long tickets for complete text extraction.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] font-mono">
              2
            </span>
            <span>AI Receipt Vision</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Multi-model vision automatically identifies every store line item, discounts, pack quantities, and total sums.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] font-mono">
              3
            </span>
            <span>Smart Product Linking</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Automatically pairs store POS names with canonical grocery items and calculates normalized unit pricing (€/kg, €/L).
          </p>
        </div>
      </div>
    </div>
  );
}
