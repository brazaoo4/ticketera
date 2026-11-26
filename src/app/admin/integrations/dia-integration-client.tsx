"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  PlugZap,
  Unplug,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Clock,
} from "lucide-react";
import { formatDate, getStoreBrand } from "@/lib/format";
import { detectDiaTokens } from "@/lib/integrations/dia/tokens";
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
  tokenExpiresAt?: Date | string | null;
  consecutiveFailures?: number;
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
  syncIntervalMinutes?: number;
  initialOpenModal?: boolean;
}

const UPCOMING_STORES = [
  { name: "Mercadona", slug: "mercadona", note: "Receipt photo & PDF import ready today" },
  { name: "Carrefour", slug: "carrefour", note: "Club account sync planned" },
  { name: "Lidl", slug: "lidl", note: "Lidl Plus receipt sync planned" },
  { name: "Consum", slug: "consum", note: "Mundo Consum sync planned" },
] as const;

export function DiaIntegrationClient({
  connections,
  currentUserId,
  syncIntervalMinutes = 10,
  initialOpenModal = false,
}: DiaIntegrationClientProps) {
  const router = useRouter();
  const diaConnection =
    connections.find(
      (c) => c.storeSlug === "dia" && c.user.id === currentUserId
    ) || connections.find((c) => c.storeSlug === "dia");

  const [isPending, startTransition] = useTransition();
  const [isConnectModalOpen, setIsConnectModalOpen] =
    useState(initialOpenModal);
  const [rawInput, setRawInput] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const detected = detectDiaTokens(rawInput);
  const diaBrand = getStoreBrand("dia");

  function handleSyncNow() {
    if (!diaConnection) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await syncDiaNowAction(diaConnection.id);
      if (!res.success) {
        setFeedback({
          type: "error",
          text: res.error || "Could not sync Club Dia receipts.",
        });
      } else {
        setFeedback({
          type: "success",
          text:
            ("message" in res && typeof res.message === "string" && res.message) ||
            "Checked Club Dia and updated your receipts.",
        });
        router.refresh();
      }
    });
  }

  function handleToggleAutoSync() {
    if (!diaConnection) return;
    const nextEnabled = !diaConnection.syncEnabled;
    setFeedback(null);
    startTransition(async () => {
      const res = await toggleDiaSyncAction(diaConnection.id, nextEnabled);
      if (!res.success) {
        setFeedback({
          type: "error",
          text: res.error || "Could not update automatic sync setting.",
        });
      } else {
        setFeedback({
          type: "success",
          text: nextEnabled
            ? "Automatic Club Dia receipt sync enabled."
            : "Automatic Club Dia receipt sync paused.",
        });
        router.refresh();
      }
    });
  }

  function handleDisconnect() {
    if (!diaConnection) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await disconnectDiaAccountAction(diaConnection.id);
      if (!res.success) {
        setFeedback({
          type: "error",
          text: res.error || "Could not disconnect Club Dia.",
        });
      } else {
        setConfirmDisconnect(false);
        setFeedback({
          type: "success",
          text: "Club Dia disconnected. Previously imported receipts remain in your archive.",
        });
        router.refresh();
      }
    });
  }

  function handleConnectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rawInput.trim()) return;
    setFeedback(null);

    startTransition(async () => {
      const res = await connectDiaAccountAction(rawInput);
      if (!res.success) {
        setFeedback({
          type: "error",
          text: res.error || "Could not connect your Club Dia session.",
        });
      } else {
        setIsConnectModalOpen(false);
        setRawInput("");
        setFeedback({
          type: "success",
          text:
            ("message" in res && typeof res.message === "string" && res.message) ||
            "Club Dia connected and initial sync scheduled.",
        });
        router.refresh();
      }
    });
  }

  const needsReauth =
    diaConnection?.status === "REQUIRES_REAUTH" ||
    diaConnection?.status === "FAILED";

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          role={feedback.type === "error" ? "alert" : "status"}
          className={`rounded-2xl border px-4 py-3 flex items-center justify-between gap-3 text-[14px] ${
            feedback.type === "error"
              ? "border-[var(--negative)]/30 bg-[var(--negative-tint)] text-[var(--negative)]"
              : "border-[var(--positive)]/30 bg-[var(--positive-tint)] text-[var(--positive)]"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === "error" ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss notification"
            className="p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Primary Club Dia Card */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <span
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-[15px] font-bold shrink-0"
              style={{ backgroundColor: diaBrand.color, color: diaBrand.fg }}
            >
              {diaBrand.monogram}
            </span>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="font-display font-semibold text-[20px] text-[var(--text-primary)]">
                  Club Dia and Dia.es
                </h2>
                {diaConnection && (
                  <span
                    className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${
                      needsReauth
                        ? "text-[var(--accent)]"
                        : diaConnection.syncEnabled
                        ? "text-[var(--positive)]"
                        : "text-[var(--text-muted)]"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        needsReauth
                          ? "bg-[var(--accent)]"
                          : diaConnection.syncEnabled
                          ? "bg-[var(--positive)]"
                          : "bg-[var(--text-muted)]"
                      }`}
                    />
                    {diaConnection.status === "SYNCING"
                      ? "Syncing now"
                      : needsReauth
                      ? "Session needs update"
                      : diaConnection.syncEnabled
                      ? "Connected"
                      : "Paused"}
                  </span>
                )}
              </div>

              <p className="text-[14px] text-[var(--text-muted)] max-w-xl">
                {diaConnection
                  ? `Automatically imports digital receipts from ${
                      diaConnection.accountLabel || diaConnection.user.username
                    } without scanning paper till slips.`
                  : "Connect your Club Dia account once to import every in-store and online Dia purchase automatically."}
              </p>
            </div>
          </div>

          {!diaConnection && (
            <button
              type="button"
              onClick={() => setIsConnectModalOpen(true)}
              className="h-10 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[14px] font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <PlugZap className="w-4 h-4 shrink-0" />
              Connect Club Dia
            </button>
          )}
        </div>

        {diaConnection && (
          <>
            {/* 4-Column Flat Metrics Strip */}
            <div className="border-t border-[var(--border)] grid grid-cols-2 sm:grid-cols-4 bg-[var(--bg-page)]/40">
              <div className="p-4 space-y-0.5">
                <div className="text-[13px] text-[var(--text-muted)]">
                  Synced receipts
                </div>
                <div className="font-display font-bold text-[20px] tabular-nums text-[var(--text-primary)]">
                  {diaConnection.totalSyncedCount}
                </div>
              </div>

              <div className="p-4 space-y-0.5 border-l border-[var(--border)]">
                <div className="text-[13px] text-[var(--text-muted)]">
                  Last checked
                </div>
                <div className="font-semibold text-[15px] tabular-nums text-[var(--text-primary)]">
                  {diaConnection.lastSyncAt
                    ? formatDate(diaConnection.lastSyncAt)
                    : "Not checked yet"}
                </div>
              </div>

              <div className="p-4 space-y-0.5 border-t sm:border-t-0 sm:border-l border-[var(--border)]">
                <div className="text-[13px] text-[var(--text-muted)]">
                  Latest Dia receipt
                </div>
                <div className="font-semibold text-[15px] tabular-nums text-[var(--text-primary)]">
                  {diaConnection.lastTicketDate
                    ? formatDate(diaConnection.lastTicketDate)
                    : "—"}
                </div>
              </div>

              <div className="p-4 space-y-0.5 border-t sm:border-t-0 border-l border-[var(--border)]">
                <div className="text-[13px] text-[var(--text-muted)]">
                  Sync cadence
                </div>
                <div className="font-semibold text-[15px] tabular-nums text-[var(--text-primary)]">
                  Every {syncIntervalMinutes} min
                </div>
              </div>
            </div>

            {(needsReauth || diaConnection.lastError) && (
              <div className="mx-5 my-4 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-tint)] px-4 py-3 text-[13px] text-[var(--text-primary)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">
                    Club Dia session expired or needs attention.
                  </span>{" "}
                  {diaConnection.lastError && (
                    <span className="text-[var(--text-muted)]">
                      {diaConnection.lastError}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsConnectModalOpen(true)}
                  className="h-8 px-3.5 rounded-full bg-[var(--primary)] text-[var(--primary-on)] text-[13px] font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Update sign-in
                </button>
              </div>
            )}

            {/* Action Footer */}
            <div className="px-5 py-4 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleSyncNow}
                  className="h-9 px-4 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  {isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  Sync receipts now
                </button>

                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleToggleAutoSync}
                  className="h-9 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)] text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  {diaConnection.syncEnabled
                    ? "Pause auto-sync"
                    : "Resume auto-sync"}
                </button>

                <button
                  type="button"
                  onClick={() => setIsConnectModalOpen(true)}
                  className="h-9 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-strong)] text-[13px] font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  Update sign-in
                </button>
              </div>

              <button
                type="button"
                onClick={() => setConfirmDisconnect((prev) => !prev)}
                className="h-9 px-3.5 rounded-full text-[13px] font-medium text-[var(--negative)] hover:bg-[var(--negative-tint)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Unplug className="w-4 h-4" />
                Disconnect
              </button>
            </div>

            {/* Inline Two-Step Disconnect Confirmation */}
            {confirmDisconnect && (
              <div className="px-5 py-4 border-t border-[var(--negative)]/30 bg-[var(--negative-tint)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-[13px] text-[var(--text-primary)]">
                  Disconnect Club Dia automatic sync? Receipts you already
                  imported will stay in your household history.
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleDisconnect}
                    className="h-9 px-4 rounded-full bg-[var(--negative)] text-[var(--negative-on)] text-[13px] font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Yes, disconnect
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDisconnect(false)}
                    className="h-9 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Quiet Roadmap Band */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-2">
          <Clock className="w-4 h-4 text-[var(--text-muted)]" />
          <h2 className="font-display font-semibold text-[18px] text-[var(--text-primary)]">
            More Spanish supermarkets coming soon
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border)]">
          {UPCOMING_STORES.map((st, idx) => {
            const brand = getStoreBrand(st.slug);
            return (
              <div
                key={st.slug}
                className={`p-4 sm:px-5 flex items-center gap-3 ${
                  idx >= 2 ? "sm:border-t sm:border-[var(--border)]" : ""
                }`}
              >
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-bold shrink-0"
                  style={{ backgroundColor: brand.color, color: brand.fg }}
                >
                  {brand.monogram}
                </span>
                <div className="min-w-0">
                  <div className="font-medium text-[14px] text-[var(--text-primary)]">
                    {st.name}
                  </div>
                  <div className="text-[13px] text-[var(--text-muted)]">
                    {st.note}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Clean 1-Time Club Dia Setup Modal */}
      {isConnectModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Connect Club Dia session"
        >
          <div
            className="fixed inset-0 bg-[var(--scrim)] backdrop-blur-[2px]"
            onClick={() => setIsConnectModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="font-display font-semibold text-[20px] text-[var(--text-primary)]">
                  Connect Club Dia account
                </h2>
                <p className="text-[13px] text-[var(--text-muted)]">
                  Quick one-time setup using your active dia.es browser session.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsConnectModalOpen(false)}
                aria-label="Close"
                className="w-8 h-8 rounded-full hover:bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-muted)] cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ol className="rounded-xl bg-[var(--bg-subtle)] p-4 space-y-2 text-[13px] text-[var(--text-primary)] list-decimal list-inside">
              <li>
                Sign in to <strong>dia.es</strong> in your desktop browser and
                open your purchase history.
              </li>
              <li>
                Open browser Developer Tools (Network tab), right-click any
                request to dia.es, and choose <strong>Copy as cURL</strong> (or
                copy your cookie header).
              </li>
              <li>
                Paste it below. Only the three session identifiers needed to
                fetch your tickets are stored.
              </li>
            </ol>

            <form onSubmit={handleConnectSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-[var(--text-primary)]">
                  Session text or request snippet
                </label>
                <textarea
                  rows={5}
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder="Paste your copied dia.es cURL, cookie header, or session JSON here..."
                  className="w-full p-3.5 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--primary)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                />

                {rawInput.trim().length > 0 && (
                  <div
                    className={`text-[13px] flex items-center gap-1.5 ${
                      detected.isValid
                        ? "text-[var(--positive)]"
                        : "text-[var(--accent)]"
                    }`}
                  >
                    {detected.isValid ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>
                          All 3 Club Dia session identifiers recognized.
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>
                          Still missing:{" "}
                          {detected.missingFields.join(", ")}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsConnectModalOpen(false)}
                  className="h-10 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!detected.isValid || isPending}
                  className="h-10 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Connect and sync
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
