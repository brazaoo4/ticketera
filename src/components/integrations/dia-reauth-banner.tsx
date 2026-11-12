"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ArrowRight } from "lucide-react";

/**
 * Global admin alert banner displayed when a Club Dia StoreConnection enters REQUIRES_REAUTH,
 * ensuring expired sessions are surfaced immediately instead of failing silently.
 */
export function DiaReauthBanner() {
  const pathname = usePathname();

  // Avoid duplicating the alert on the integrations page where the card & modal already highlight it
  if (pathname?.startsWith("/admin/integrations")) {
    return null;
  }

  return (
    <div className="bg-rose-500/15 border-b border-rose-500/30 text-rose-200 px-4 py-2 text-xs font-medium">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-center sm:text-left">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>
            <strong className="text-rose-300 font-semibold">Club Dia Session Expired</strong> — Automatic receipt sync is paused until you reconnect your browser session.
          </span>
        </div>

        <Link
          href="/admin/integrations?reconnect=1"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 border border-rose-500/40 text-xs font-semibold transition-all whitespace-nowrap shrink-0"
        >
          <span>Reconnect Dia Account</span>
          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
        </Link>
      </div>
    </div>
  );
}
