import { DiaSessionExpiredError } from "./client";

export const DEFAULT_DIA_SYNC_INTERVAL_MINUTES = 10;
export const MAX_CONSECUTIVE_AUTH_FAILURES = 2;
export const DIA_GRACE_RETRY_DELAY_MS = 90_000;

/**
 * Resolves the Dia keepalive/sync interval in minutes (default 10m, clamped 1..25m)
 * so every tick falls well inside Dia's 30m JWT and ~60m sliding session windows.
 */
export function getDiaSyncIntervalMinutes(
  rawValue: string | undefined = process.env.DIA_SYNC_INTERVAL_MINUTES
): number {
  if (!rawValue) return DEFAULT_DIA_SYNC_INTERVAL_MINUTES;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_DIA_SYNC_INTERVAL_MINUTES;
  }
  return Math.min(parsed, 25);
}

/**
 * Identifies authentication/session errors (HTTP 222/401/403 or session-expired messages).
 */
export function isDiaAuthError(err: unknown): boolean {
  if (err instanceof DiaSessionExpiredError) return true;
  const errorMsg = err instanceof Error ? err.message : String(err);
  return (
    /\b(222|401|403)\b/.test(errorMsg) ||
    errorMsg.toLowerCase().includes("unauthorized") ||
    errorMsg.toLowerCase().includes("expired")
  );
}

export interface DiaFailureDecision {
  nextStatus: "FAILED" | "REQUIRES_REAUTH";
  nextFailures: number;
  shouldScheduleGraceRetry: boolean;
}

/**
 * Determines whether a failed Dia sync should enter a short grace-retry state (`FAILED`)
 * or lock out background syncing (`REQUIRES_REAUTH`).
 */
export function resolveDiaSyncFailureDecision(params: {
  currentStatus: string;
  previousFailures: number;
  isAuthError: boolean;
}): DiaFailureDecision {
  const nextFailures = Math.max(0, params.previousFailures) + 1;

  if (!params.isAuthError) {
    return {
      nextStatus: "FAILED",
      nextFailures,
      shouldScheduleGraceRetry: false,
    };
  }

  const shouldRequireReauth =
    params.currentStatus === "REQUIRES_REAUTH" ||
    nextFailures >= MAX_CONSECUTIVE_AUTH_FAILURES;

  return {
    nextStatus: shouldRequireReauth ? "REQUIRES_REAUTH" : "FAILED",
    nextFailures,
    shouldScheduleGraceRetry: !shouldRequireReauth,
  };
}
