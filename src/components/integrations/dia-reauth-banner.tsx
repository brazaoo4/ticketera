"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ArrowRight } from "lucide-react";

/**
 * Admin alert banner displayed when a Club Dia connection requires reconnection.
 */
export function DiaReauthBanner() {
  const pathname = usePathname();

  if (pathname?.startsWith("/admin/integrations")) {
    return null;
  }

  return (
    <div className="bg-[var(--negative-tint)] border-b border-[var(--border)] text-[var(--text-primary)] px-4 py-2 text-[13px]">
      <div className="max-w-[1120px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-center sm:text-left">
          <AlertTriangle className="w-4 h-4 text-[var(--negative)] shrink-0" />
          <span>
            <strong className="font-semibold">Club Dia session expired</strong> — reconnect to resume automatic receipt sync.
          </span>
        </div>

        <Link
          href="/admin/integrations?connect=dia"
          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] text-[var(--negative)] border border-[var(--border-strong)] text-[13px] font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <span>Reconnect Dia</span>
          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
        </Link>
      </div>
    </div>
  );
}
