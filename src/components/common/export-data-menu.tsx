"use client";

import React, { useState, useRef, useEffect } from "react";
import { Download, FileSpreadsheet, FileText, FileCode, ChevronDown } from "lucide-react";

interface ExportDataMenuProps {
  range?: string;
  className?: string;
}

export function ExportDataMenu({ range = "all", className = "" }: ExportDataMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
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

  const handleDownload = (format: "items_csv" | "receipts_csv" | "json") => {
    setIsOpen(false);
    const url = `/api/export?format=${format}&range=${range.toLowerCase()}`;
    window.location.href = url;
  };

  return (
    <div className={`relative inline-block text-left ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors shadow-sm"
      >
        <Download className="w-3.5 h-3.5 text-emerald-400" />
        <span>Export Data</span>
        <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-zinc-800 bg-zinc-950 p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-2 border-b border-zinc-800/80 mb-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Download Format
            </div>
            <div className="text-xs text-zinc-400">
              Compatible with Excel & Google Sheets
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleDownload("items_csv")}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-200 hover:text-white hover:bg-zinc-900 rounded-xl whitespace-nowrap shrink-0 transition-colors text-left"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="truncate">
              <div className="font-semibold">CSV (Detailed Line Items)</div>
              <div className="text-[10px] text-zinc-500">Unit prices and net quantities</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleDownload("receipts_csv")}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-200 hover:text-white hover:bg-zinc-900 rounded-xl whitespace-nowrap shrink-0 transition-colors text-left"
          >
            <FileText className="w-4 h-4 text-blue-400 shrink-0" />
            <div className="truncate">
              <div className="font-semibold">CSV (Receipt Summaries)</div>
              <div className="text-[10px] text-zinc-500">Date, store and total amount</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleDownload("json")}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-200 hover:text-white hover:bg-zinc-900 rounded-xl whitespace-nowrap shrink-0 transition-colors text-left"
          >
            <FileCode className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="truncate">
              <div className="font-semibold">Full JSON Backup</div>
              <div className="text-[10px] text-zinc-500">Structured database backup</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
