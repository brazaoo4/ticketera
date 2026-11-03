"use client";

import React, { useState, useTransition } from "react";
import {
  Link2,
  RefreshCw,
  Power,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Receipt,
  Copy,
} from "lucide-react";
import {
  connectDiaAccountAction,
  syncDiaNowAction,
  toggleDiaSyncAction,
  disconnectDiaAccountAction,
} from "./actions";

interface StoreConnectionItem {
  id: string;
  storeSlug: string;
  accountLabel: string | null;
  syncEnabled: boolean;
  status: "IDLE" | "SYNCING" | "ACTIVE" | "REQUIRES_REAUTH" | "FAILED";
  lastSyncAt: Date | string | null;
  lastKeepAliveAt: Date | string | null;
  lastTicketDate: Date | string | null;
  totalSyncedCount: number;
  lastError: string | null;
  user: {
    id: string;
    username: string;
  };
}

interface DiaIntegrationClientProps {
  connections: StoreConnectionItem[];
  currentUserId: string;
}

export function DiaIntegrationClient({
  connections,
  currentUserId,
}: DiaIntegrationClientProps) {
  const diaConnection = connections.find((c) => c.storeSlug === "dia");
  const [isPending, startTransition] = useTransition();

  const [rawInput, setRawInput] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleConnect = () => {
    if (!rawInput.trim()) return;
    setActionMessage(null);

    startTransition(async () => {
      const res = await connectDiaAccountAction(rawInput);
      if (res.success) {
        setActionMessage({ type: "success", text: res.message || "Connected successfully!" });
        setRawInput("");
        setIsModalOpen(false);
      } else {
        setActionMessage({ type: "error", text: res.error || "Failed to connect." });
      }
    });
  };

  const handleSyncNow = (id: string) => {
    setActionMessage(null);
    startTransition(async () => {
      const res = await syncDiaNowAction(id);
      if (res.success) {
        setActionMessage({
          type: "success",
          text: res.message || "Sync finished successfully.",
        });
      } else {
        setActionMessage({
          type: "error",
          text: res.error || "Sync encountered an error.",
        });
      }
    });
  };

  const handleToggleSync = (id: string, currentEnabled: boolean) => {
    setActionMessage(null);
    startTransition(async () => {
      const res = await toggleDiaSyncAction(id, !currentEnabled);
      if (!res.success) {
        setActionMessage({
          type: "error",
          text: res.error || "Failed to toggle sync.",
        });
      }
    });
  };

  const handleDisconnect = (id: string) => {
    if (!confirm("Are you sure you want to disconnect this Dia account? Existing imported receipts will remain.")) {
      return;
    }
    setActionMessage(null);
    startTransition(async () => {
      const res = await disconnectDiaAccountAction(id);
      if (res.success) {
        setActionMessage({
          type: "success",
          text: "Dia account disconnected.",
        });
      } else {
        setActionMessage({
          type: "error",
          text: res.error || "Failed to disconnect.",
        });
      }
    });
  };

  const formatRelativeTime = (dateInput: Date | string | null) => {
    if (!dateInput) return "Never";
    const date = new Date(dateInput);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Action Notification Alert */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl border text-xs sm:text-sm flex items-center justify-between ${
            actionMessage.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-zinc-400 hover:text-zinc-200 ml-4 font-mono text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Integration Cards */}
      <div className="grid grid-cols-1 gap-6">
        {/* DIA Supermarket Card */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden shadow-xl">
          {/* Card Header Strip */}
          <div className="p-6 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-red-950/20 via-zinc-900/30 to-zinc-900/10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-600 flex items-center justify-center font-black text-white text-xl tracking-tighter shadow-lg shadow-red-600/30">
                DIA
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    Club Dia & Dia.es
                  </h3>
                  {diaConnection && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider ${
                        diaConnection.status === "ACTIVE"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : diaConnection.status === "SYNCING"
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/30 animate-pulse"
                          : diaConnection.status === "REQUIRES_REAUTH"
                          ? "bg-amber-500/10 text-amber-300 border border-amber-500/30"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                      }`}
                    >
                      {diaConnection.status}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Automated background sync for in-store and online purchases with zero AI token cost.
                </p>
              </div>
            </div>

            {/* Top Action Button */}
            <div>
              {diaConnection ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSyncNow(diaConnection.id)}
                    disabled={isPending || diaConnection.status === "SYNCING"}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700/60 shadow-sm transition-all disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        isPending || diaConnection.status === "SYNCING"
                          ? "animate-spin text-emerald-400"
                          : "text-zinc-400"
                      }`}
                    />
                    <span>Sync Now</span>
                  </button>

                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-medium border border-zinc-700/40 transition-all"
                  >
                    <span>Update Token</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs shadow-lg shadow-red-600/30 active:scale-95 transition-all"
                >
                  <Link2 className="w-4 h-4" />
                  <span>Connect Dia Account</span>
                </button>
              )}
            </div>
          </div>

          {/* Connection Details or Setup Pitch */}
          {diaConnection ? (
            <div className="p-6 space-y-6">
              {/* Status & Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                  <div className="text-[10px] font-mono text-zinc-500 uppercase flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Account Profile</span>
                  </div>
                  <div className="text-sm font-semibold text-zinc-200 truncate">
                    {diaConnection.accountLabel || "Connected User"}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-500">
                    Linked to @{diaConnection.user.username}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                  <div className="text-[10px] font-mono text-zinc-500 uppercase flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5 text-blue-400" />
                    <span>Total Synced</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-white">
                    {diaConnection.totalSyncedCount}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-500">
                    Receipts ingested
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                  <div className="text-[10px] font-mono text-zinc-500 uppercase flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Last Ingest</span>
                  </div>
                  <div className="text-sm font-semibold text-zinc-200">
                    {formatRelativeTime(diaConnection.lastSyncAt)}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-500">
                    {diaConnection.lastTicketDate
                      ? `Latest ticket: ${new Date(diaConnection.lastTicketDate).toLocaleDateString()}`
                      : "No tickets recorded"}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                  <div className="text-[10px] font-mono text-zinc-500 uppercase flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Keepalive Schedule</span>
                  </div>
                  <div className="text-sm font-semibold text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Every 35 min</span>
                  </div>
                  <div className="text-[11px] font-mono text-zinc-500">
                    Heartbeat: {formatRelativeTime(diaConnection.lastKeepAliveAt)}
                  </div>
                </div>
              </div>

              {/* Error Alert if any */}
              {diaConnection.lastError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <div>
                    <span className="font-semibold">Sync notice: </span>
                    <span>{diaConnection.lastError}</span>
                    {diaConnection.status === "REQUIRES_REAUTH" && (
                      <p className="mt-1 text-zinc-400">
                        Please update your token using the &quot;Update Token&quot; button above.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Controls Footer */}
              <div className="pt-2 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-zinc-400">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleToggleSync(diaConnection.id, diaConnection.syncEnabled)}
                    disabled={isPending}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                      diaConnection.syncEnabled
                        ? "bg-zinc-800 text-emerald-400 border-zinc-700 hover:bg-zinc-700"
                        : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>
                      {diaConnection.syncEnabled ? "Automatic Sync: ON" : "Automatic Sync: PAUSED"}
                    </span>
                  </button>
                  <span className="text-zinc-600">•</span>
                  <span>Tokens are AES-256-GCM encrypted at rest</span>
                </div>

                <button
                  onClick={() => handleDisconnect(diaConnection.id)}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Disconnect Account</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center space-y-4 max-w-xl mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center mx-auto text-zinc-400">
                <Link2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-semibold text-zinc-200">
                  Connect your Dia / Club Dia account
                </h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  No 24/7 Chromium container required. Connect once with your browser session cookies or cURL snippet; Ticketera automatically maintains your session alive via lightweight keep-alive requests and ingests tickets within minutes of checkout.
                </p>
              </div>
              <div className="pt-2">
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs shadow-lg shadow-red-600/30 transition-all"
                >
                  <Link2 className="w-4 h-4" />
                  <span>Connect Dia Account</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 1-Time Setup Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white font-black text-sm">
                  DIA
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {diaConnection ? "Update Dia Credentials" : "Connect Dia Account"}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Paste your browser cURL command or cookie string
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 text-sm font-mono"
              >
                ✕
              </button>
            </div>

            {/* Quick 3-Step Guide */}
            <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-3 text-xs">
              <div className="font-semibold text-zinc-300 uppercase tracking-wider text-[11px] font-mono">
                How to copy from your browser (1-minute setup):
              </div>
              <ol className="list-decimal list-inside space-y-2 text-zinc-400 leading-relaxed">
                <li>
                  Log in to your account at{" "}
                  <a
                    href="https://www.dia.es"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:underline inline-flex items-center gap-0.5"
                  >
                    dia.es <ExternalLink className="w-3 h-3" />
                  </a>{" "}
                  and navigate to <span className="text-zinc-200 font-mono">Mis Compras / Tickets</span>.
                </li>
                <li>
                  Open Developer Tools (<kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[10px]">F12</kbd>), switch to the <span className="text-zinc-200 font-medium">Network</span> tab, and refresh the tickets page.
                </li>
                <li>
                  Right-click any request to <span className="text-zinc-200 font-mono">/customer/current/tickets</span> and select <span className="text-zinc-200 font-medium">&quot;Copy as cURL&quot;</span> (Windows CMD, PowerShell, or Bash).
                </li>
              </ol>
            </div>

            {/* Input Box */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-300 block">
                Paste cURL command, cookie string, or JSON credentials:
              </label>
              <textarea
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder={'curl "https://www.dia.es/api/v3/eservice-back/customer/current/tickets..." -b "session_id=...; customer_access=...; customer_code=..."'}
                rows={6}
                className="w-full rounded-xl bg-zinc-950 border border-zinc-800 p-3 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-red-500 transition-colors"
              />
              <p className="text-[11px] text-zinc-500">
                Ticketera will automatically extract <code className="text-zinc-400">session_id</code>, <code className="text-zinc-400">customer_access</code>, and <code className="text-zinc-400">customer_code</code>.
              </p>
            </div>

            {/* Modal Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConnect}
                disabled={isPending || !rawInput.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs shadow-lg shadow-red-600/30 disabled:opacity-50 active:scale-95 transition-all"
              >
                {isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isPending ? "Validating & Connecting..." : "Save & Connect"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
