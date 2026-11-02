"use client";

import React, { useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  FileText,
  ExternalLink,
  Download,
} from "lucide-react";

interface ReceiptViewerProps {
  receiptId: string;
  sourceFile: string;
  hasOriginalPdf?: boolean;
  isMobileModal?: boolean;
  onCloseMobileModal?: () => void;
}

export function ReceiptViewer({
  receiptId,
  sourceFile,
  hasOriginalPdf,
}: ReceiptViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const isPdfOrHasPdf = sourceFile.toLowerCase().endsWith(".pdf") || Boolean(hasOriginalPdf);
  const fileUrl = `/api/receipts/${receiptId}/file`;

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  return (
    <div className="flex flex-col h-full rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-xl">
      {/* Viewer Header & Controls */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-3.5 py-2 text-xs">
        <div className="flex items-center gap-2 text-zinc-300 font-medium">
          <FileText className="w-3.5 h-3.5 text-emerald-400" />
          <span className="truncate max-w-[140px] sm:max-w-[200px]">
            {isPdfOrHasPdf ? "Digital PDF Receipt" : "Original Scanned Photo"}
          </span>
          {isPdfOrHasPdf && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono">
              PDF
            </span>
          )}
        </div>

        {/* Zoom & Rotate Toolbar */}
        <div className="flex items-center gap-1">
          {isPdfOrHasPdf && (
            <a
              href={`${fileUrl}?original=true`}
              download={`receipt-${receiptId}.pdf`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-emerald-400 text-[11px] font-medium transition-colors mr-1"
              title="Download original PDF"
              aria-label="Download original PDF"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Original PDF</span>
            </a>
          )}
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white disabled:opacity-40 transition-colors"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono text-zinc-400 px-1 tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 3}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white disabled:opacity-40 transition-colors"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleRotate}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors ml-1"
            title="Rotate 90°"
            aria-label="Rotate 90 degrees"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
            title="Reset view"
            aria-label="Reset view"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-emerald-400 transition-colors ml-1"
            title="Open in new tab"
            aria-label="Open original file in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Viewer Canvas Area */}
      <div className="relative flex-1 min-h-[460px] max-h-[75vh] overflow-auto bg-zinc-950 p-4 flex items-center justify-center select-none">
        <div
          className="transition-transform duration-150 ease-out origin-center flex items-center justify-center"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileUrl}
            alt="Receipt evidence"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl pointer-events-auto"
          />
        </div>
      </div>
    </div>
  );
}
