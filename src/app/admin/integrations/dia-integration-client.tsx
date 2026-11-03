"use client";

import React, { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import {
  Link2,
  RefreshCw,
  Power,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  ShieldCheck,
  Receipt,
  ArrowUpRight,
  Filter,
  Copy,
  Check,
  Terminal,
  Key,
  Database,
  Search,
} from "lucide-react";
import {
  connectDiaAccountAction,
  syncDiaNowAction,
  toggleDiaSyncAction,
  disconnectDiaAccountAction,
} from "./actions";
import { detectDiaTokens } from "@/lib/integrations/dia/tokens";

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
  const diaConnection =
    connections.find(
      (c) => c.storeSlug === "dia" && c.user.id === currentUserId
    ) || connections.find((c) => c.storeSlug === "dia");
  const [isPending, startTransition] = useTransition();

  const [instructionTab, setInstructionTab] = useState<"network" | "storage" | "manual">("network");
  const [rawInput, setRawInput] = useState("");
  const [manualSessionId, setManualSessionId] = useState("");
  const [manualCustomerAccess, setManualCustomerAccess] = useState("");
  const [manualCustomerCode, setManualCustomerCode] = useState("");
  const [copiedFilter, setCopiedFilter] = useState(false);
  const [copiedConsole, setCopiedConsole] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const detection = detectDiaTokens(rawInput);

  useEffect(() => {
    if (!isModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) {
        setIsModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isModalOpen, isPending]);

  const copyToClipboard = (text: string, type: "filter" | "console") => {
    navigator.clipboard.writeText(text);
    if (type === "filter") {
      setCopiedFilter(true);
      setTimeout(() => setCopiedFilter(false), 2000);
    } else {
      setCopiedConsole(true);
      setTimeout(() => setCopiedConsole(false), 2000);
    }
  };

  const handleConnect = () => {
    let payload = "";
    if (instructionTab === "manual") {
      if (!manualSessionId.trim() || !manualCustomerAccess.trim() || !manualCustomerCode.trim()) {
        return;
      }
      payload = JSON.stringify({
        sessionId: manualSessionId.trim(),
        customerAccess: manualCustomerAccess.trim(),
        customerCode: manualCustomerCode.trim(),
      });
    } else {
      payload = rawInput.trim();
      if (!payload) return;
    }

    setActionMessage(null);
    startTransition(async () => {
      const res = await connectDiaAccountAction(payload);
      if (res.success) {
        setActionMessage({
          type: "success",
          text: res.message || "Connected successfully!",
        });
        setRawInput("");
        setManualSessionId("");
        setManualCustomerAccess("");
        setManualCustomerCode("");
        setIsModalOpen(false);
      } else {
        setActionMessage({
          type: "error",
          text: res.error || "Failed to connect.",
        });
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
    setActionMessage(null);
    startTransition(async () => {
      const res = await disconnectDiaAccountAction(id);
      setConfirmDisconnect(false);
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

                <Link
                  href="/my-receipts"
                  className="group p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 hover:border-emerald-500/40 hover:bg-zinc-900/80 transition-all space-y-1 block"
                >
                  <div className="text-[10px] font-mono text-zinc-500 uppercase flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Receipt className="w-3.5 h-3.5 text-blue-400" />
                      <span>Total Synced</span>
                    </span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-emerald-400 transition-colors" />
                  </div>
                  <div className="text-xl font-bold font-mono text-white">
                    {diaConnection.totalSyncedCount}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-500 group-hover:text-zinc-300 transition-colors">
                    View in My Receipts
                  </div>
                </Link>

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
                <div className="flex items-center gap-3 flex-wrap">
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
                      {diaConnection.syncEnabled ? "Automatic Sync: ON" : "Automatic Sync: PAUSED (Keepalive Active)"}
                    </span>
                  </button>
                  <span className="text-zinc-600 hidden sm:inline">•</span>
                  <span>AES-256-GCM encrypted at rest</span>
                </div>

                {confirmDisconnect ? (
                  <div className="flex items-center gap-2">
                    <span className="text-rose-400 font-medium">Disconnect account?</span>
                    <button
                      onClick={() => handleDisconnect(diaConnection.id)}
                      disabled={isPending}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition-colors"
                    >
                      Yes, Disconnect
                    </button>
                    <button
                      onClick={() => setConfirmDisconnect(false)}
                      disabled={isPending}
                      className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDisconnect(true)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Disconnect Account</span>
                  </button>
                )}
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
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) {
              setIsModalOpen(false);
            }
          }}
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-5 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center text-white font-black text-sm shadow-md shadow-red-600/30">
                  DIA
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {diaConnection ? "Update Dia Credentials" : "Connect Dia Account"}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    1-time browser session setup • Automatic 35-min background keep-alive
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 text-sm font-mono w-7 h-7 rounded-lg flex items-center justify-center hover:bg-zinc-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Method Tabs */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-950/80 rounded-xl border border-zinc-800/80 text-xs">
              <button
                type="button"
                onClick={() => setInstructionTab("network")}
                className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg font-medium transition-all ${
                  instructionTab === "network"
                    ? "bg-zinc-800 text-white shadow-sm border border-zinc-700/60"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                }`}
              >
                <Filter className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">DevTools Filter</span>
                <span className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">Fastest</span>
              </button>

              <button
                type="button"
                onClick={() => setInstructionTab("storage")}
                className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg font-medium transition-all ${
                  instructionTab === "storage"
                    ? "bg-zinc-800 text-white shadow-sm border border-zinc-700/60"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                }`}
              >
                <Database className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="truncate">Storage Cookies</span>
              </button>

              <button
                type="button"
                onClick={() => setInstructionTab("manual")}
                className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg font-medium transition-all ${
                  instructionTab === "manual"
                    ? "bg-zinc-800 text-white shadow-sm border border-zinc-700/60"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                }`}
              >
                <Key className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">Manual 3 Fields</span>
              </button>
            </div>

            {/* TAB 1: DevTools Filter Method */}
            {instructionTab === "network" && (
              <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-3.5 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/60 pb-2.5">
                  <div className="font-semibold text-zinc-200 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[11px] font-bold">1</span>
                    <span>Go to Dia Tickets in your browser:</span>
                  </div>
                  <a
                    href="https://www.dia.es/mis-compras/tickets"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-[11px] font-medium transition-colors w-fit"
                  >
                    <span>Open dia.es/mis-compras/tickets</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-0.5">
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">2</span>
                      <div>
                        <span className="text-zinc-200 font-medium">Open Developer Tools:</span>
                        <p className="text-zinc-400 mt-0.5">
                          Press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 font-mono text-[10px]">F12</kbd> (or right-click ➔ Inspect), then click the <span className="text-zinc-200 font-medium">Network</span> tab.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">3</span>
                      <div>
                        <span className="text-zinc-200 font-medium">Filter out 200+ noise requests:</span>
                        <p className="text-zinc-400 mt-0.5">
                          Select <span className="text-zinc-200 font-medium">Fetch/XHR</span> and type <code className="text-amber-300 font-bold font-mono bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20">tickets</code> in the Filter box.
                        </p>
                        <button
                          type="button"
                          onClick={() => copyToClipboard("tickets", "filter")}
                          className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-mono border border-zinc-700 transition-colors"
                        >
                          {copiedFilter ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedFilter ? "Copied 'tickets'!" : "Copy 'tickets' filter word"}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">4</span>
                      <div>
                        <span className="text-zinc-200 font-medium">Refresh the page:</span>
                        <p className="text-zinc-400 mt-0.5">
                          Press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 font-mono text-[10px]">Ctrl+R</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 font-mono text-[10px]">F5</kbd>. DevTools will now show <strong>only 1 request</strong>!
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">5</span>
                      <div>
                        <span className="text-zinc-200 font-medium">Right-click & Copy as cURL:</span>
                        <p className="text-zinc-400 mt-0.5">
                          Right-click <span className="text-emerald-300 font-mono font-bold">tickets?offset=0...</span> ➔ <span className="text-zinc-200 font-medium">Copy</span> ➔ <span className="text-zinc-200 font-medium">Copy as cURL</span>.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* DevTools Visual Mockup */}
                <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden text-[11px] font-mono shadow-inner">
                  <div className="px-3 py-1.5 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between text-zinc-400 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900 border border-amber-500/50 text-amber-300">
                        <Search className="w-3 h-3 text-amber-400" />
                        <span className="font-bold">tickets</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800/40 text-zinc-500">All</span>
                      <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-bold">Fetch/XHR</span>
                    </div>
                    <span className="text-[10px] text-zinc-500">DevTools Network Tab Preview</span>
                  </div>

                  <div className="p-2 space-y-1 bg-zinc-950/60">
                    <div className="grid grid-cols-12 text-zinc-500 border-b border-zinc-800/60 pb-1 px-2 text-[10px]">
                      <span className="col-span-7">Name</span>
                      <span className="col-span-2">Status</span>
                      <span className="col-span-3 text-right">DevTools Action</span>
                    </div>
                    <div className="grid grid-cols-12 items-center px-2 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                      <span className="col-span-7 font-bold truncate flex items-center gap-1">
                        <span className="text-emerald-400">📄</span> tickets?offset=0&page_size=6
                      </span>
                      <span className="col-span-2 text-zinc-400">200 OK</span>
                      <span className="col-span-3 text-right text-[10px] text-emerald-400 font-bold">
                        Right-click ➔ Copy as cURL
                      </span>
                    </div>
                  </div>
                </div>

                {/* Pro-Tip: Instant Console Trigger without Refresh */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800/80 text-[11px] text-zinc-400">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span>Don&apos;t want to refresh? Run this in DevTools <strong>Console</strong>:</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(
                        "fetch('/api/v3/eservice-back/customer/current/tickets?offset=0&page_size=1')",
                        "console"
                      )
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono transition-colors shrink-0 w-fit"
                  >
                    {copiedConsole ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedConsole ? "Copied Fetch Command!" : "Copy Console Fetch"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: Storage Cookies Method */}
            {instructionTab === "storage" && (
              <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-3 text-xs text-zinc-400">
                <div className="font-semibold text-zinc-200 text-xs flex items-center gap-2 border-b border-zinc-800/60 pb-2">
                  <Database className="w-4 h-4 text-blue-400" />
                  <span>Copy from DevTools Storage / Cookies (No network recording needed):</span>
                </div>
                <ol className="list-decimal list-inside space-y-2 leading-relaxed">
                  <li>
                    In{" "}
                    <a href="https://www.dia.es" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
                      dia.es
                    </a>{" "}
                    while logged in, press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[10px]">F12</kbd>.
                  </li>
                  <li>
                    Click the <span className="text-zinc-200 font-medium">Application</span> tab (Chrome/Edge/Brave) or <span className="text-zinc-200 font-medium">Storage</span> tab (Firefox).
                  </li>
                  <li>
                    In the left sidebar, expand <span className="text-zinc-200 font-medium">Cookies</span> and click <span className="text-emerald-400 font-mono">https://www.dia.es</span>.
                  </li>
                  <li>
                    <strong className="text-zinc-200">1-Click Full Table Copy:</strong> Click inside the cookie table, press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[10px]">Ctrl+A</kbd> then <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[10px]">Ctrl+C</kbd>, and paste it into the box below. Ticketera parses the table automatically!
                  </li>
                  <li>
                    <strong className="text-zinc-200">Or paste individually:</strong> Switch to the <strong>Manual 3 Fields</strong> tab above and paste <code className="text-zinc-300">session_id</code>, <code className="text-zinc-300">customer_access</code>, and <code className="text-zinc-300">customer_code</code>.
                  </li>
                </ol>
              </div>
            )}

            {/* TAB 3: Manual 3 Fields Input */}
            {instructionTab === "manual" ? (
              <div className="space-y-3.5">
                <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 text-xs text-zinc-400">
                  Paste the 3 Dia session values individually from DevTools (Application ➔ Cookies ➔ dia.es):
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-zinc-300 block mb-1">
                      1. session_id <span className="text-zinc-500 font-normal font-mono">(36-char UUID)</span>
                    </label>
                    <input
                      type="text"
                      value={manualSessionId}
                      onChange={(e) => setManualSessionId(e.target.value)}
                      placeholder="e.g. 01bc658c-5fca-48b7-887d-136d445ed38b"
                      className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-300 block mb-1">
                      2. customer_access <span className="text-zinc-500 font-normal font-mono">(Long JWT string starting with eyJhbGci...)</span>
                    </label>
                    <textarea
                      value={manualCustomerAccess}
                      onChange={(e) => setManualCustomerAccess(e.target.value)}
                      placeholder="e.g. eyJhbGciOiJSUzI1NiIsImtpZCI6ImFiY2QiLCJ0eXAiOiJKV1QifQ..."
                      rows={3}
                      className="w-full rounded-xl bg-zinc-950 border border-zinc-800 p-3 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-300 block mb-1">
                      3. customer_code <span className="text-zinc-500 font-normal font-mono">(Club Dia customer code)</span>
                    </label>
                    <input
                      type="text"
                      value={manualCustomerCode}
                      onChange={(e) => setManualCustomerCode(e.target.value)}
                      placeholder="e.g. JTIH3UXrr3tX0EYUxsl4TgpBQU8psJFljIOIAHN8xhC4zdNznuw="
                      className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Raw Paste Area with Live Token Validation Bar */
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-300 block">
                    Paste cURL command, PowerShell snippet, cookie string, or copied DevTools table:
                  </label>
                  {rawInput && (
                    <button
                      type="button"
                      onClick={() => setRawInput("")}
                      className="text-[11px] text-zinc-500 hover:text-zinc-300 font-mono transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <textarea
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder={'curl "https://www.dia.es/api/v3/eservice-back/customer/current/tickets..." -b "session_id=...; customer_access=...; customer_code=..."'}
                  rows={4}
                  className="w-full rounded-xl bg-zinc-950 border border-zinc-800 p-3 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-red-500 transition-colors"
                />

                {/* Real-time Token Detection Status */}
                {rawInput.trim() ? (
                  <div
                    className={`p-3 rounded-xl border text-xs space-y-2 ${
                      detection.isValid
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                        : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-semibold">
                        {detection.isValid ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>All 3 Dia credentials detected! Ready to connect.</span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                            <span>
                              Missing {detection.missingFields.join(" & ")}.
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5 font-mono text-[11px]">
                      <div
                        className={`p-1.5 rounded-lg border truncate ${
                          detection.sessionId
                            ? "bg-zinc-900/80 border-emerald-500/40 text-emerald-400"
                            : "bg-zinc-900/80 border-zinc-700/60 text-zinc-500"
                        }`}
                      >
                        <span className="font-bold">session_id:</span>{" "}
                        {detection.sessionId ? `${detection.sessionId.slice(0, 8)}...` : "Missing"}
                      </div>
                      <div
                        className={`p-1.5 rounded-lg border truncate ${
                          detection.customerAccess
                            ? "bg-zinc-900/80 border-emerald-500/40 text-emerald-400"
                            : "bg-zinc-900/80 border-zinc-700/60 text-zinc-500"
                        }`}
                      >
                        <span className="font-bold">customer_access:</span>{" "}
                        {detection.customerAccess ? `${detection.customerAccess.slice(0, 10)}...` : "Missing"}
                      </div>
                      <div
                        className={`p-1.5 rounded-lg border truncate ${
                          detection.customerCode
                            ? "bg-zinc-900/80 border-emerald-500/40 text-emerald-400"
                            : "bg-zinc-900/80 border-zinc-700/60 text-zinc-500"
                        }`}
                      >
                        <span className="font-bold">customer_code:</span>{" "}
                        {detection.customerCode ? `${detection.customerCode.slice(0, 8)}...` : "Missing"}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-500">
                    Ticketera automatically extracts <code className="text-zinc-400">session_id</code>, <code className="text-zinc-400">customer_access</code>, and <code className="text-zinc-400">customer_code</code> from any cURL, PowerShell, Fetch snippet, cookie header, or DevTools cookie table.
                  </p>
                )}
              </div>
            )}

            {/* Modal Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
              <span className="text-[11px] text-zinc-500 hidden sm:inline">
                Encrypted at rest with AES-256-GCM
              </span>
              <div className="flex items-center gap-3 ml-auto">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isPending}
                  className="px-4 py-2 rounded-xl text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={
                    isPending ||
                    (instructionTab === "manual"
                      ? !manualSessionId.trim() ||
                        !manualCustomerAccess.trim() ||
                        !manualCustomerCode.trim()
                      : !rawInput.trim())
                  }
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs shadow-lg shadow-red-600/30 disabled:opacity-50 active:scale-95 transition-all"
                >
                  {isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {isPending
                      ? "Validating & Syncing..."
                      : instructionTab === "manual"
                      ? "Connect with 3 Fields"
                      : "Save & Connect"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
