"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  FileCode,
  Archive,
  ChevronDown,
} from "lucide-react";

interface ExportDataMenuProps {
  range?: string;
  className?: string;
  label?: string;
}

export function ExportDataMenu({
  range = "all",
  className = "",
  label = "Export CSV",
}: ExportDataMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [align, setAlign] = useState<"right" | "left">("right");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const exportHref = (
    format: "items_csv" | "receipts_csv" | "json" | "bundle"
  ) => {
    const effectiveRange = format === "bundle" ? "all" : range.toLowerCase();
    return `/api/export?format=${format}&range=${effectiveRange}`;
  };

  const handleToggle = () => {
    if (!isOpen && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      setAlign(rect.right >= 272 ? "right" : "left");
    }
    setIsOpen((prev) => !prev);
  };

  return (
    <div className={`relative inline-block text-left ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] border border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-primary)] text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer"
      >
        <Download className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
        <span>{label}</span>
        <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
      </button>

      {isOpen && (
        <div
          className={`absolute ${
            align === "right" ? "right-0" : "left-0"
          } mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-1.5 shadow-[var(--shadow-soft)] z-50`}
        >
          <div className="px-3 py-2 border-b border-[var(--border)] mb-1">
            <div className="text-[13px] font-semibold text-[var(--text-primary)]">
              Download format
            </div>
            <div className="text-[13px] text-[var(--text-muted)]">
              Works in Excel and Google Sheets
            </div>
          </div>

          <a
            href={exportHref("items_csv")}
            download
            onClick={() => setIsOpen(false)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] rounded-xl whitespace-nowrap shrink-0 transition-colors text-left cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-[var(--primary)] shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold">Itemized prices (CSV)</div>
              <div className="text-[13px] text-[var(--text-muted)]">
                Unit prices and pack weights
              </div>
            </div>
          </a>

          <a
            href={exportHref("receipts_csv")}
            download
            onClick={() => setIsOpen(false)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] rounded-xl whitespace-nowrap shrink-0 transition-colors text-left cursor-pointer"
          >
            <FileText className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold">Receipt summaries (CSV)</div>
              <div className="text-[13px] text-[var(--text-muted)]">
                Date, store, and total paid
              </div>
            </div>
          </a>

          <a
            href={exportHref("json")}
            download
            onClick={() => setIsOpen(false)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] rounded-xl whitespace-nowrap shrink-0 transition-colors text-left cursor-pointer"
          >
            <FileCode className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold">Full backup (JSON)</div>
              <div className="text-[13px] text-[var(--text-muted)]">
                Complete structured export
              </div>
            </div>
          </a>

          <a
            href={exportHref("bundle")}
            download
            onClick={() => setIsOpen(false)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] rounded-xl whitespace-nowrap shrink-0 transition-colors text-left border-t border-[var(--border)] mt-1 pt-2 cursor-pointer"
          >
            <Archive className="w-4 h-4 text-[var(--primary)] shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold">Full portable backup (.zip)</div>
              <div className="text-[13px] text-[var(--text-muted)]">
                Database + receipt files
              </div>
            </div>
          </a>
        </div>
      )}
    </div>
  );
}
