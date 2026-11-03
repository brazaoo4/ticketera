import { Worker, Job } from "bullmq";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { decryptCredentials, encryptCredentials } from "@/lib/crypto/vault";
import {
  DiaAuthCredentials,
  DiaTicketDetailParams,
} from "@/lib/integrations/dia/types";
import {
  DiaSessionExpiredError,
  fetchDiaTicketsPage,
  fetchDiaTicketDetail,
  getDiaAccountLabel,
} from "@/lib/integrations/dia/client";
import { importDiaTicket } from "@/lib/integrations/dia/importer";
import { ensureDiaSyncSchedule } from "./dia-sync-queue";

const globalForDiaWorker = globalThis as unknown as {
  diaSyncWorker?: Worker;
  activeSyncLocks?: Set<string>;
};

const activeSyncLocks =
  globalForDiaWorker.activeSyncLocks || new Set<string>();
if (process.env.NODE_ENV !== "production") {
  globalForDiaWorker.activeSyncLocks = activeSyncLocks;
}

export interface SyncDiaResult {
  success: boolean;
  skipped?: boolean;
  keepAliveOnly?: boolean;
  requiresReauth?: boolean;
  importedCount?: number;
  skippedCount?: number;
  error?: string;
}

/**
 * Synchronizes tickets (or performs a lightweight session keep-alive) for a single Dia store connection:
 * 1. Decrypts credentials.
 * 2. Fetches tickets page and immediately persists rotated session_id / customer_access cookies.
 * 3. If syncEnabled is false (and not a manual force sync), stops after keep-alive so the 1-time session stays alive.
 * 4. Imports new tickets deterministically with per-ticket error isolation.
 * 5. Handles 222/401/403 session expiration by transitioning status to REQUIRES_REAUTH.
 */
export async function syncDiaConnection(
  connectionId: string,
  options?: { forceImport?: boolean }
): Promise<SyncDiaResult> {
  if (activeSyncLocks.has(connectionId)) {
    return {
      success: true,
      skipped: true,
      importedCount: 0,
      skippedCount: 0,
    };
  }

  activeSyncLocks.add(connectionId);

  try {
    const connection = await prisma.storeConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      return { success: false, skipped: true, error: `Connection ${connectionId} not found` };
    }

    const shouldImportTickets = Boolean(connection.syncEnabled || options?.forceImport);

    let currentCreds: DiaAuthCredentials;
    try {
      currentCreds = decryptCredentials<DiaAuthCredentials>(connection.encryptedAuthData);
    } catch (decErr) {
      const errorMsg = "Failed to decrypt credentials. Vault key mismatch or corrupted secret.";
      console.error(`[DiaWorker] ❌ ${errorMsg}:`, decErr);
      await prisma.storeConnection.update({
        where: { id: connectionId },
        data: { status: "REQUIRES_REAUTH", lastError: errorMsg },
      });
      return { success: false, requiresReauth: true, error: errorMsg };
    }

    if (shouldImportTickets) {
      await prisma.storeConnection.update({
        where: { id: connectionId },
        data: { status: "SYNCING" },
      });
    }

    try {
      // 1. Fetch tickets page (pageSize 1 if keep-alive only, 12 if full sync)
      const pageRes = await fetchDiaTicketsPage(currentCreds, {
        offset: 0,
        pageSize: shouldImportTickets ? 12 : 1,
      });

      // 2. Immediately capture and persist rotated tokens so a later error never loses the rotated session
      if (pageRes.rotatedCreds) {
        currentCreds = pageRes.rotatedCreds;
      }

      const accountLabel = getDiaAccountLabel(
        currentCreds.customerAccess,
        pageRes.data.customer?.display_name || connection.accountLabel || undefined
      );

      await prisma.storeConnection.update({
        where: { id: connectionId },
        data: {
          accountLabel,
          encryptedAuthData: encryptCredentials(currentCreds),
          lastKeepAliveAt: new Date(),
          ...(shouldImportTickets ? {} : { status: "ACTIVE", lastError: null }),
        },
      });

      if (!shouldImportTickets) {
        console.log(
          `[DiaWorker] 💓 Keep-alive heartbeat completed for paused connection ${connectionId}`
        );
        return {
          success: true,
          keepAliveOnly: true,
          importedCount: 0,
          skippedCount: 0,
        };
      }

      const tickets = pageRes.data.tickets || [];
      let importedCount = 0;
      let skippedCount = 0;
      let latestTicketDate: Date | null = connection.lastTicketDate;
      let lastTicketError: string | null = null;

      // 3. Process tickets with per-ticket isolation
      for (const ticket of tickets) {
        const ticketDate = new Date(
          ticket.submitted_date || ticket.detail_params?.begin || Date.now()
        );
        if (!latestTicketDate || ticketDate > latestTicketDate) {
          latestTicketDate = ticketDate;
        }

        const existing = await prisma.receipt.findFirst({
          where: { externalTicketId: ticket.ticket_unique_code },
          select: { id: true },
        });

        if (existing) {
          skippedCount++;
          continue;
        }

        try {
          console.log(
            `[DiaWorker] 📥 Fetching details for new Dia ticket: ${ticket.ticket_unique_code} (${ticket.total_amount} €)`
          );

          const detailRes = await fetchDiaTicketDetail(
            currentCreds,
            ticket.detail_params as DiaTicketDetailParams
          );

          if (detailRes.rotatedCreds) {
            currentCreds = detailRes.rotatedCreds;
          }

          const importRes = await importDiaTicket({
            userId: connection.userId,
            summary: ticket,
            detail: detailRes.data,
          });

          if (importRes.status === "IMPORTED") {
            importedCount++;
          } else {
            skippedCount++;
          }
        } catch (ticketErr) {
          if (ticketErr instanceof DiaSessionExpiredError) {
            throw ticketErr;
          }
          lastTicketError =
            ticketErr instanceof Error ? ticketErr.message : String(ticketErr);
          console.error(
            `[DiaWorker] ⚠️ Failed to import ticket ${ticket.ticket_unique_code}:`,
            lastTicketError
          );
        }
      }

      // 4. Persist final rotated credentials & mark ACTIVE
      await prisma.storeConnection.update({
        where: { id: connectionId },
        data: {
          status: "ACTIVE",
          accountLabel,
          encryptedAuthData: encryptCredentials(currentCreds),
          lastSyncAt: new Date(),
          lastKeepAliveAt: new Date(),
          lastTicketDate: latestTicketDate,
          totalSyncedCount: { increment: importedCount },
          lastError: lastTicketError,
        },
      });

      console.log(
        `[DiaWorker] ✓ Connection ${connectionId} synced: ${importedCount} imported, ${skippedCount} skipped.`
      );

      return {
        success: true,
        importedCount,
        skippedCount,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isAuthError =
        err instanceof DiaSessionExpiredError ||
        /\b(222|401|403)\b/.test(errorMsg) ||
        errorMsg.toLowerCase().includes("unauthorized") ||
        errorMsg.toLowerCase().includes("expired");

      console.error(`[DiaWorker] ❌ Sync error for connection ${connectionId}:`, errorMsg);

      await prisma.storeConnection.update({
        where: { id: connectionId },
        data: {
          encryptedAuthData: encryptCredentials(currentCreds),
          status: isAuthError ? "REQUIRES_REAUTH" : "FAILED",
          lastError: errorMsg,
        },
      });

      return {
        success: false,
        requiresReauth: isAuthError,
        error: errorMsg,
      };
    }
  } finally {
    activeSyncLocks.delete(connectionId);
  }
}

/**
 * Synchronizes (and refreshes keep-alive tokens for) all non-expired Dia connections.
 */
export async function syncAllDiaConnections(): Promise<{
  total: number;
  synced: number;
  failed: number;
  results: Record<string, SyncDiaResult>;
}> {
  const connections = await prisma.storeConnection.findMany({
    where: {
      storeSlug: "dia",
      status: { not: "REQUIRES_REAUTH" },
    },
    select: { id: true },
  });

  const results: Record<string, SyncDiaResult> = {};
  let synced = 0;
  let failed = 0;

  for (const conn of connections) {
    const res = await syncDiaConnection(conn.id);
    results[conn.id] = res;
    if (res.success) synced++;
    else failed++;
  }

  return { total: connections.length, synced, failed, results };
}

/**
 * Initializes the BullMQ worker for Dia background syncs and schedules the 35-minute keepalive job.
 */
export function initDiaSyncWorker(): Worker | null {
  if (globalForDiaWorker.diaSyncWorker) {
    return globalForDiaWorker.diaSyncWorker;
  }

  try {
    const worker = new Worker(
      "dia-sync",
      async (job: Job<{ connectionId?: string }>) => {
        if (job.data?.connectionId) {
          const res = await syncDiaConnection(job.data.connectionId);
          if (!res.success && !res.skipped && !res.requiresReauth) {
            throw new Error(res.error || "Sync failed");
          }
        } else {
          await syncAllDiaConnections();
        }
      },
      {
        connection: redis,
        prefix: "tt",
        concurrency: 1,
      }
    );

    worker.on("completed", (job) => {
      console.log(`[DiaWorker] Job ${job.id} completed successfully`);
    });

    worker.on("failed", (job, err) => {
      console.error(`[DiaWorker] Job ${job?.id} failed with error:`, err);
    });

    worker.on("error", (err) => {
      console.warn("[DiaWorker] BullMQ worker connection warning (safe in dev):", err.message);
    });

    globalForDiaWorker.diaSyncWorker = worker;
    console.log("⚡ [DiaWorker] BullMQ dia-sync worker initialized");

    // Initialize repeatable schedule
    ensureDiaSyncSchedule().catch((err) => {
      console.warn("[DiaWorker] Could not register periodic schedule on init:", err);
    });

    return worker;
  } catch (err) {
    console.warn("⚠️ [DiaWorker] Could not initialize BullMQ dia-sync worker:", err);
    return null;
  }
}
