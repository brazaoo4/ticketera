"use client";

import React, { useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  FileText,
  ExternalLink,
  X,
  ImageOff,
} from "lucide-react";

interface ReceiptViewerProps {
  receiptId: string;
  sourceFile: string;
  hasOriginalPdf?: boolean;
  fileVersion?: string;
  isDigitalDia?: boolean;
  isMobileModal?: boolean;
  onCloseMobileModal?: () => void;
}

export function ReceiptViewer({
  receiptId,
  sourceFile,
  hasOriginalPdf = false,
  fileVersion,
  isDigitalDia = false,
  isMobileModal = false,
  onCloseMobileModal,
}: ReceiptViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [imgError, setImgError] = useState(false);

  const isSourcePdfOnly =
    sourceFile.toLowerCase().endsWith(".pdf") && !fileVersion && !hasOriginalPdf;

  const imageUrl = `/api/receipts/${receiptId}/file${
    fileVersion ? `?v=${encodeURIComponent(fileVersion)}` : ""
  }`;
  const originalPdfUrl = `/api/receipts/${receiptId}/file?original=true`;

  return (
    <div
      className={`flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden ${
        isMobileModal ? "h-full max-h-[90vh]" : "h-[calc(100vh-140px)] min-h-[520px]"
      }`}
    >
      {/* Controls Bar */}
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-2 bg-[var(--bg-page)]/60 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-[var(--primary)] shrink-0" />
          <span className="font-display font-semibold text-[15px] text-[var(--text-primary)] truncate">
            {isDigitalDia ? "Digital receipt preview" : "Original receipt"}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.75, +(z - 0.25).toFixed(2)))}
            aria-label="Zoom out"
            className="w-8 h-8 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center cursor-pointer"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[13px] tabular-nums text-[var(--text-muted)] w-11 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))}
            aria-label="Zoom in"
            className="w-8 h-8 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center cursor-pointer"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            aria-label="Rotate 90 degrees"
            className="w-8 h-8 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center cursor-pointer"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {(zoom !== 1 || rotation !== 0) && (
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setRotation(0);
              }}
              aria-label="Reset view"
              className="w-8 h-8 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          {hasOriginalPdf && (
            <a
              href={originalPdfUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-1 h-8 px-2.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-strong)] text-[13px] font-medium text-[var(--text-primary)] inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <span>PDF</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          {isMobileModal && onCloseMobileModal && (
            <button
              type="button"
              onClick={onCloseMobileModal}
              aria-label="Close receipt image"
              className="ml-1 w-8 h-8 rounded-full hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Thermal-Paper Backdrop */}
      <div className="flex-1 overflow-auto bg-[var(--paper-bg)] p-4 flex items-start justify-center">
        {isSourcePdfOnly ? (
          <iframe
            src={originalPdfUrl}
            title="Original receipt PDF"
            className="w-full h-full min-h-[460px] rounded-lg border border-[var(--paper-rule)] bg-[var(--paper-bg)]"
          />
        ) : imgError ? (
          <div className="my-auto max-w-xs text-center space-y-3 py-10">
            <div className="w-11 h-11 rounded-2xl border border-[var(--paper-rule)] bg-[var(--bg-card)] text-[var(--paper-muted)] flex items-center justify-center mx-auto">
              <ImageOff className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-[14px] font-semibold text-[var(--paper-ink)]">
                Receipt photo unavailable
              </p>
              <p className="text-[13px] text-[var(--paper-muted)]">
                {isDigitalDia
                  ? "This synced Club Dia purchase uses itemized store data rather than a camera photo."
                  : "No saved camera image was found on disk for this receipt."}
              </p>
            </div>
            {hasOriginalPdf && (
              <a
                href={originalPdfUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[var(--primary)] text-[var(--primary-on)] text-[13px] font-semibold"
              >
                Open original PDF
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        ) : (
          <div
            className="transition-transform duration-150 origin-top"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Scanned supermarket receipt"
              onError={() => setImgError(true)}
              className="max-w-full rounded-lg border border-[var(--paper-rule)] shadow-sm select-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}
