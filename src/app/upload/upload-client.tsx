"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Camera,
  UploadCloud,
  FileText,
  X,
  ChevronDown,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Trash2,
} from "lucide-react";
import { parseDDMMYYYYToISO, getStoreBrand } from "@/lib/format";
import { deleteReceiptAction } from "@/app/receipts/[id]/review/actions";

export interface UploadStoreOption {
  id: string;
  name: string;
  slug: string;
  brandHex: string;
}

interface UploadClientProps {
  stores: UploadStoreOption[];
  initialReceiptId?: string | null;
  initialDuplicateId?: string | null;
  initialError?: string | null;
}

interface StagedFileItem {
  id: string;
  file: File;
}

const PREVIEW_RASTER_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
]);

function StagedImagePreview({ file }: { file: File }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;

    if (typeof createImageBitmap !== "function") {
      Promise.resolve().then(() => {
        if (!cancelled) setFailed(true);
      });
      return () => {
        cancelled = true;
      };
    }

    createImageBitmap(file)
      .then((bmp) => {
        if (cancelled) {
          bmp.close();
          return;
        }
        bitmap = bmp;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) {
          setFailed(true);
          return;
        }
        const scale = Math.max(
          canvas.width / bmp.width,
          canvas.height / bmp.height
        );
        const drawW = bmp.width * scale;
        const drawH = bmp.height * scale;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(
          bmp,
          (canvas.width - drawW) / 2,
          (canvas.height - drawH) / 2,
          drawW,
          drawH
        );
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      bitmap?.close();
    };
  }, [file]);

  if (failed) {
    return (
      <div className="w-10 h-10 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
        <FileText className="w-5 h-5" />
      </div>
    );
  }

  return (
    <div className="w-10 h-10 rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--bg-subtle)] shrink-0">
      <canvas
        ref={canvasRef}
        width={80}
        height={80}
        aria-label={file.name}
        className="w-full h-full block"
      />
    </div>
  );
}

interface QueuedReceiptItem {
  localKey: string;
  receiptId: string;
  fileName: string;
  status: "PENDING" | "PROCESSING" | "REVIEW" | "CONFIRMED" | "FAILED";
  duplicate: boolean;
  errorMessage?: string | null;
  storeName?: string | null;
  itemCount?: number;
}

const MAX_FILES = 15;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function isSupportedFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === "application/pdf") return true;
  if (ALLOWED_MIME_PREFIXES.includes(type)) return true;
  const lowerName = file.name.toLowerCase();
  return (
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".webp") ||
    lowerName.endsWith(".heic") ||
    lowerName.endsWith(".heif") ||
    lowerName.endsWith(".pdf")
  );
}

function getProcessingStageIndex(
  items: QueuedReceiptItem[],
  isUploading: boolean
): number {
  if (isUploading) return 0;
  if (items.length === 0) return 0;
  if (items.some((it) => it.status === "REVIEW" || it.status === "CONFIRMED")) {
    const allFinished = items.every(
      (it) =>
        it.status === "REVIEW" ||
        it.status === "CONFIRMED" ||
        it.status === "FAILED"
    );
    if (allFinished) return 3;
  }
  if (items.some((it) => it.status === "PROCESSING")) return 2;
  return 1;
}

const PROCESSING_STEPS = [
  "Uploading photo",
  "Reading receipt lines",
  "Matching groceries",
  "Ready for review",
] as const;

export function UploadClient({
  stores,
  initialReceiptId,
  initialDuplicateId,
  initialError,
}: UploadClientProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [stagedFiles, setStagedFiles] = useState<StagedFileItem[]>([]);
  const [uploadMode, setUploadMode] = useState<"batch" | "stitch">("batch");
  const [isDragging, setIsDragging] = useState(false);

  const [showOptional, setShowOptional] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("auto");
  const [dateInput, setDateInput] = useState<string>("");

  const [formError, setFormError] = useState<string | null>(initialError || null);
  const [duplicateId, setDuplicateId] = useState<string | null>(
    initialDuplicateId || null
  );
  const [isUploading, setIsUploading] = useState(false);
  const [queuedReceipts, setQueuedReceipts] = useState<QueuedReceiptItem[]>(
    () =>
      initialReceiptId
        ? [
            {
              localKey: initialReceiptId,
              receiptId: initialReceiptId,
              fileName: "Uploaded receipt",
              status: "PROCESSING",
              duplicate: false,
            },
          ]
        : []
  );
  const [discardingId, setDiscardingId] = useState<string | null>(null);

  const parsedDateISO = dateInput.trim()
    ? parseDDMMYYYYToISO(dateInput)
    : null;
  const hasInvalidDate =
    dateInput.trim().length > 0 && parsedDateISO === null;

  const totalBytes = stagedFiles.reduce((acc, f) => acc + f.file.size, 0);
  const hasPdfInStage = stagedFiles.some(
    (f) =>
      f.file.type === "application/pdf" ||
      f.file.name.toLowerCase().endsWith(".pdf")
  );
  const canStitch = stagedFiles.length >= 2 && !hasPdfInStage;

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      setFormError(null);
      setDuplicateId(null);

      const list = Array.from(incoming);
      const valid: StagedFileItem[] = [];
      let rejectedMessage: string | null = null;

      for (const file of list) {
        if (!isSupportedFile(file)) {
          rejectedMessage = `"${file.name}" is not a supported image or PDF.`;
          continue;
        }
        valid.push({
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
          file,
        });
      }

      if (rejectedMessage) {
        setFormError(rejectedMessage);
      }

      if (valid.length === 0) return;

      setStagedFiles((prev) => {
        const combined = [...prev, ...valid];
        if (combined.length > MAX_FILES) {
          setFormError(`You can upload up to ${MAX_FILES} files at once.`);
          return combined.slice(0, MAX_FILES);
        }
        const combinedBytes = combined.reduce((sum, s) => sum + s.file.size, 0);
        if (combinedBytes > MAX_TOTAL_BYTES) {
          setFormError("Total upload size cannot exceed 50 MB.");
          return prev;
        }
        return combined;
      });
    },
    []
  );

  function removeStagedFile(id: string) {
    setStagedFiles((prev) => {
      const next = prev.filter((f) => f.id !== id);
      if (next.length < 2 && uploadMode === "stitch") {
        setUploadMode("batch");
      }
      return next;
    });
  }

  // Poll PENDING / PROCESSING queued receipts
  const hasActivePolling = queuedReceipts.some(
    (q) => q.receiptId && (q.status === "PENDING" || q.status === "PROCESSING")
  );

  useEffect(() => {
    if (!hasActivePolling) return;

    let cancelled = false;

    const pollOnce = async () => {
      const activeItems = queuedReceipts.filter(
        (q) =>
          q.receiptId &&
          (q.status === "PENDING" || q.status === "PROCESSING")
      );
      if (activeItems.length === 0) return;

      const updates = await Promise.all(
        activeItems.map(async (item) => {
          try {
            const res = await fetch(`/api/receipts/${item.receiptId}/status`, {
              cache: "no-store",
            });
            if (!res.ok) return null;
            const data = await res.json();
            return {
              receiptId: item.receiptId,
              status: data.status as QueuedReceiptItem["status"],
              errorMessage: data.errorMessage ?? null,
              storeName: data.store?.name ?? null,
              itemCount:
                typeof data.itemCount === "number" ? data.itemCount : undefined,
            };
          } catch {
            return null;
          }
        })
      );

      if (cancelled) return;

      setQueuedReceipts((prev) =>
        prev.map((q) => {
          const patch = updates.find((u) => u && u.receiptId === q.receiptId);
          if (!patch) return q;
          return {
            ...q,
            status: patch.status,
            errorMessage: patch.errorMessage,
            storeName: patch.storeName ?? q.storeName,
            itemCount: patch.itemCount ?? q.itemCount,
          };
        })
      );
    };

    const timer = setInterval(pollOnce, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [hasActivePolling, queuedReceipts]);

  // Auto-redirect when a single upload / stitch finishes smoothly
  useEffect(() => {
    if (queuedReceipts.length !== 1 || isUploading) return;
    const only = queuedReceipts[0];
    if (only.receiptId && only.status === "REVIEW" && !only.duplicate) {
      const t = setTimeout(() => {
        router.push(`/receipts/${only.receiptId}/review`);
      }, 650);
      return () => clearTimeout(t);
    }
  }, [queuedReceipts, isUploading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (stagedFiles.length === 0 || hasInvalidDate || isUploading) return;

    setFormError(null);
    setDuplicateId(null);
    setIsUploading(true);

    try {
      const effectiveMode =
        uploadMode === "stitch" && canStitch ? "stitch" : "batch";

      const formData = new FormData();
      formData.append("mode", effectiveMode);
      if (selectedStoreId && selectedStoreId !== "auto") {
        formData.append("storeId", selectedStoreId);
      }
      if (parsedDateISO) {
        formData.append("purchaseDate", parsedDateISO);
      }
      stagedFiles.forEach((item) => {
        formData.append("files", item.file);
      });

      const response = await fetch("/api/receipts/upload", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setFormError(
          payload?.error ||
            "Could not process these files right now. Please try again."
        );
        setIsUploading(false);
        return;
      }

      // Clear staged list once handed off
      setStagedFiles([]);

      const returnedItems: Array<{
        receiptId: string;
        fileName: string;
        status: string;
        duplicate: boolean;
        error?: string;
      }> = Array.isArray(payload?.receipts)
        ? payload.receipts
        : payload?.receiptId
        ? [
            {
              receiptId: payload.receiptId,
              fileName: "Uploaded receipt",
              status: payload.status || "PENDING",
              duplicate: Boolean(payload.duplicate),
            },
          ]
        : [];

      if (
        returnedItems.length === 1 &&
        returnedItems[0].duplicate &&
        returnedItems[0].receiptId
      ) {
        setDuplicateId(returnedItems[0].receiptId);
        setIsUploading(false);
        return;
      }

      setQueuedReceipts(
        returnedItems.map((it, index) => ({
          localKey: `${it.receiptId || "err"}-${index}-${Date.now()}`,
          receiptId: it.receiptId || "",
          fileName: it.fileName || `Receipt ${index + 1}`,
          status:
            (it.status as QueuedReceiptItem["status"]) ||
            (it.receiptId ? "PENDING" : "FAILED"),
          duplicate: Boolean(it.duplicate),
          errorMessage: it.error || null,
        }))
      );
    } catch {
      setFormError(
        "Upload interrupted. Check your connection and try again."
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDiscardFailed(receiptId: string, localKey: string) {
    if (!receiptId) {
      setQueuedReceipts((prev) => prev.filter((q) => q.localKey !== localKey));
      return;
    }
    setDiscardingId(localKey);
    try {
      await deleteReceiptAction(receiptId);
    } finally {
      setDiscardingId(null);
      setQueuedReceipts((prev) => prev.filter((q) => q.localKey !== localKey));
    }
  }

  const stageIdx = getProcessingStageIndex(queuedReceipts, isUploading);
  const submitDisabled =
    stagedFiles.length === 0 || hasInvalidDate || isUploading;

  return (
    <div className="space-y-8">
      {/* Direct H1 Header */}
      <div className="space-y-1.5">
        <h1 className="font-display font-bold text-[28px] sm:text-[34px] leading-tight text-[var(--text-primary)]">
          Add a receipt
        </h1>
        <p className="text-[15px] text-[var(--text-muted)] max-w-xl">
          Drop a photo or supermarket PDF and we’ll read every product, pack
          weight, and unit price for your review.
        </p>
      </div>

      {/* Duplicate Warning Banner */}
      {duplicateId && (
        <div className="rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent-tint)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="font-semibold text-[15px] text-[var(--text-primary)]">
              This receipt is already in your household archive
            </div>
            <p className="text-[13px] text-[var(--text-muted)]">
              We matched the exact file to avoid duplicate price entries.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/receipts/${duplicateId}/review`}
              className="h-9 px-4 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              Open existing receipt
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <button
              type="button"
              onClick={() => setDuplicateId(null)}
              aria-label="Dismiss duplicate notice"
              className="w-9 h-9 rounded-full hover:bg-[var(--bg-card)]/60 flex items-center justify-center text-[var(--text-muted)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Inline Error Banner */}
      {formError && (
        <div
          role="alert"
          className="rounded-2xl border border-[var(--negative)]/30 bg-[var(--negative-tint)] px-4 py-3.5 flex items-center justify-between gap-3 text-[13px] text-[var(--negative)]"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
          <button
            type="button"
            onClick={() => setFormError(null)}
            aria-label="Dismiss error"
            className="p-1 hover:opacity-75 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Active Upload / Processing Stepper & Queue */}
      {(isUploading || queuedReceipts.length > 0) && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6 space-y-5 shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display font-semibold text-[18px] text-[var(--text-primary)]">
              {hasActivePolling || isUploading
                ? "Reading your receipts"
                : "Receipt status"}
            </h2>
            {!isUploading && !hasActivePolling && (
              <button
                type="button"
                onClick={() => setQueuedReceipts([])}
                className="text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Upload more
              </button>
            )}
          </div>

          {/* 4-Step Plain-English Progress Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {PROCESSING_STEPS.map((label, idx) => {
              const completed = stageIdx > idx;
              const current = stageIdx === idx;
              return (
                <div
                  key={label}
                  className={`rounded-xl px-3.5 py-2.5 border text-[13px] flex items-center gap-2 ${
                    completed
                      ? "border-[var(--positive)]/40 bg-[var(--positive-tint)] text-[var(--positive)] font-medium"
                      : current
                      ? "border-[var(--primary)] bg-[var(--primary-tint)] text-[var(--text-primary)] font-medium"
                      : "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-muted)]"
                  }`}
                >
                  {completed ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : current ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)] shrink-0" />
                  ) : (
                    <span className="w-5 h-5 rounded-full border border-current inline-flex items-center justify-center text-[13px] shrink-0">
                      {idx + 1}
                    </span>
                  )}
                  <span className="truncate">{label}</span>
                </div>
              );
            })}
          </div>

          {/* Queued Receipt List */}
          {queuedReceipts.length > 0 && (
            <div className="border-y border-[var(--border)] divide-y divide-[var(--border)]">
              {queuedReceipts.map((item) => (
                <div
                  key={item.localKey}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-medium text-[14px] text-[var(--text-primary)] truncate">
                      {item.storeName || item.fileName}
                    </div>
                    <div className="text-[13px] text-[var(--text-muted)]">
                      {item.duplicate && "Already in archive"}
                      {!item.duplicate &&
                        (item.status === "PENDING" ||
                          item.status === "PROCESSING") &&
                        "Extracting items and pack sizes..."}
                      {!item.duplicate &&
                        (item.status === "REVIEW" || item.status === "CONFIRMED") &&
                        `${item.itemCount ?? 0} items found and ready to check`}
                      {item.status === "FAILED" &&
                        (item.errorMessage ||
                          "We couldn't read this photo clearly.")}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {(item.status === "PENDING" ||
                      item.status === "PROCESSING") && (
                      <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--primary)]">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Reading
                      </span>
                    )}

                    {(item.status === "REVIEW" ||
                      item.status === "CONFIRMED" ||
                      item.duplicate) &&
                      item.receiptId && (
                        <Link
                          href={`/receipts/${item.receiptId}/review`}
                          className="h-9 px-4 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          {item.duplicate ? "Open receipt" : "Review receipt"}
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      )}

                    {item.status === "FAILED" && (
                      <button
                        type="button"
                        disabled={discardingId === item.localKey}
                        onClick={() =>
                          handleDiscardFailed(item.receiptId, item.localKey)
                        }
                        className="h-9 px-3.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--negative-tint)] text-[13px] font-medium text-[var(--negative)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upload Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Dropzone Card */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files?.length) {
              addFiles(e.dataTransfer.files);
            }
          }}
          className={`rounded-2xl border-2 border-dashed p-6 sm:p-10 text-center transition-colors ${
            isDragging
              ? "border-[var(--primary)] bg-[var(--primary-tint)]"
              : "border-[var(--border-strong)] bg-[var(--bg-card)]"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          <div className="max-w-md mx-auto space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--primary-tint)] text-[var(--primary)] flex items-center justify-center mx-auto">
              <UploadCloud className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <p className="font-display font-semibold text-[18px] text-[var(--text-primary)]">
                Snap a receipt or upload files
              </p>
              <p className="text-[13px] text-[var(--text-muted)]">
                Supports JPG, PNG, WebP, HEIC, or supermarket PDFs · up to{" "}
                {MAX_FILES} files (50 MB total)
              </p>
            </div>

            {/* Mobile-first Camera CTA vs Desktop File Picker CTA */}
            <div className="flex flex-col md:hidden gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="w-full h-11 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[14px] font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Camera className="w-4 h-4 shrink-0" />
                Take photo with camera
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-10 px-5 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-primary)] text-[14px] font-medium inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileText className="w-4 h-4 shrink-0" />
                Choose photos or PDF
              </button>
            </div>

            <div className="hidden md:flex flex-col items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-11 px-6 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[14px] font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                <UploadCloud className="w-4 h-4 shrink-0" />
                Choose files
              </button>
              <span className="text-[13px] text-[var(--text-muted)]">
                or drag and drop directly onto this box
              </span>
            </div>
          </div>
        </div>

        {/* Staged Files Preview & Multi-Photo Mode */}
        {stagedFiles.length > 0 && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[14px] font-semibold text-[var(--text-primary)] tabular-nums">
                {stagedFiles.length}{" "}
                {stagedFiles.length === 1 ? "file selected" : "files selected"}{" "}
                <span className="font-normal text-[var(--text-muted)]">
                  · {formatFileSize(totalBytes)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStagedFiles([]);
                }}
                className="text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--negative)] cursor-pointer"
              >
                Clear all
              </button>
            </div>

            <div className="border-y border-[var(--border)] divide-y divide-[var(--border)]">
              {stagedFiles.map((item) => {
                const canPreviewImage = PREVIEW_RASTER_TYPES.has(
                  item.file.type.toLowerCase()
                );
                return (
                  <div
                    key={item.id}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {canPreviewImage ? (
                        <StagedImagePreview
                          key={`${item.file.name}-${item.file.size}-${item.file.lastModified}-${item.id}`}
                          file={item.file}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-[14px] font-medium text-[var(--text-primary)] truncate">
                          {item.file.name}
                        </div>
                        <div className="text-[13px] text-[var(--text-muted)] tabular-nums">
                          {formatFileSize(item.file.size)}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeStagedFile(item.id)}
                      aria-label={`Remove ${item.file.name}`}
                      className="w-8 h-8 rounded-full hover:bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Multi-photo Mode Selector */}
            {stagedFiles.length >= 2 && (
              <div className="space-y-2 pt-1">
                <div className="text-[13px] font-medium text-[var(--text-primary)]">
                  How should these photos be read?
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setUploadMode("batch")}
                    className={`text-left rounded-xl p-3.5 border transition-colors cursor-pointer ${
                      uploadMode === "batch"
                        ? "border-[var(--primary)] bg-[var(--primary-tint)]"
                        : "border-[var(--border)] bg-[var(--bg-page)]/40 hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <div className="text-[14px] font-semibold text-[var(--text-primary)]">
                      Process separately
                    </div>
                    <div className="text-[13px] text-[var(--text-muted)] mt-0.5">
                      Each file is a separate supermarket trip.
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={!canStitch}
                    onClick={() => canStitch && setUploadMode("stitch")}
                    className={`text-left rounded-xl p-3.5 border transition-colors ${
                      !canStitch
                        ? "border-[var(--border)] bg-[var(--bg-subtle)] opacity-60 cursor-not-allowed"
                        : uploadMode === "stitch"
                        ? "border-[var(--primary)] bg-[var(--primary-tint)] cursor-pointer"
                        : "border-[var(--border)] bg-[var(--bg-page)]/40 hover:border-[var(--border-strong)] cursor-pointer"
                    }`}
                  >
                    <div className="text-[14px] font-semibold text-[var(--text-primary)]">
                      Stitch into 1 long receipt
                    </div>
                    <div className="text-[13px] text-[var(--text-muted)] mt-0.5">
                      {hasPdfInStage
                        ? "Available for photo uploads only (no PDFs)."
                        : "Combine photos of one tall till slip top-to-bottom."}
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Collapsible Optional Store & Date Disclosure */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowOptional((prev) => !prev)}
            aria-expanded={showOptional}
            className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[var(--bg-subtle)]/60 transition-colors cursor-pointer"
          >
            <div>
              <span className="text-[14px] font-medium text-[var(--text-primary)]">
                Optional store and date
              </span>
              <span className="ml-2 text-[13px] text-[var(--text-muted)]">
                Auto-detected from receipt if left blank
              </span>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-[var(--text-muted)] transition-transform shrink-0 ${
                showOptional ? "rotate-180" : ""
              }`}
            />
          </button>

          {showOptional && (
            <div className="px-5 pb-5 pt-2 border-t border-[var(--border)] grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="upload-store-select"
                  className="block text-[13px] font-medium text-[var(--text-primary)]"
                >
                  Supermarket
                </label>
                <div className="relative">
                  <select
                    id="upload-store-select"
                    value={selectedStoreId}
                    onChange={(e) => setSelectedStoreId(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] text-[var(--text-primary)] focus:outline-none"
                  >
                    <option value="auto">Auto-detect from receipt</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedStoreId !== "auto" && (
                  <div className="flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: getStoreBrand(
                          stores.find((s) => s.id === selectedStoreId)?.slug ||
                            "",
                          stores.find((s) => s.id === selectedStoreId)?.brandHex
                        ).color,
                      }}
                    />
                    Override store detection
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="upload-purchase-date"
                  className="block text-[13px] font-medium text-[var(--text-primary)]"
                >
                  Purchase date
                </label>
                <input
                  id="upload-purchase-date"
                  type="text"
                  inputMode="numeric"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  placeholder="DD/MM/YYYY"
                  className={`w-full h-10 px-3.5 rounded-xl bg-[var(--bg-page)] border text-[14px] tabular-nums text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none ${
                    hasInvalidDate
                      ? "border-[var(--negative)]"
                      : "border-[var(--border)] focus:border-[var(--primary)]"
                  }`}
                />
                {hasInvalidDate ? (
                  <p className="text-[13px] text-[var(--negative)]">
                    Use DD/MM/YYYY format, for example 21/10/2026.
                  </p>
                ) : (
                  <p className="text-[13px] text-[var(--text-muted)]">
                    Leave blank to use the date printed on the till slip.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* High-Contrast Submit Action */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={submitDisabled}
            className={`h-11 px-6 rounded-full text-[14px] font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
              submitDisabled
                ? "bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-strong)] cursor-not-allowed"
                : "bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] cursor-pointer"
            }`}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                {uploadMode === "stitch" && canStitch
                  ? `Read 1 stitched receipt (${stagedFiles.length} photos)`
                  : stagedFiles.length > 1
                  ? `Read ${stagedFiles.length} receipts`
                  : "Read receipt"}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>

      {/* Calm 3-Column How It Works */}
      <section className="border-t border-[var(--border)] pt-7 grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="space-y-1">
          <h2 className="font-display font-semibold text-[16px] text-[var(--text-primary)]">
            1. Snap or upload
          </h2>
          <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">
            Take a quick photo of your paper receipt, stitch a long slip, or
            drop a digital supermarket PDF.
          </p>
        </div>
        <div className="space-y-1">
          <h2 className="font-display font-semibold text-[16px] text-[var(--text-primary)]">
            2. Quick check
          </h2>
          <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">
            Items, weights, and unit prices are extracted automatically so you
            can confirm in seconds.
          </p>
        </div>
        <div className="space-y-1">
          <h2 className="font-display font-semibold text-[16px] text-[var(--text-primary)]">
            3. Compare anytime
          </h2>
          <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">
            Every confirmed trip updates supermarket comparisons, pack-size
            tracking, and household totals.
          </p>
        </div>
      </section>
    </div>
  );
}
