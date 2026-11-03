import { Worker, Job } from "bullmq";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { decryptCredentials, encryptCredentials } from "@/lib/crypto/vault";
import {
  DiaAuthCredentials,
  DiaTicketDetailParams,
} from "@/lib/integrations/dia/types";
import {
  fetchDiaTicketsPage,
  fetchDiaTicketDetail,
  extractRotatedCredentials,
  getDiaAccountLabel,
} from "@/lib/integrations/dia/client";
import { importDiaTicket } from "@/lib/integrations/dia/importer";
import { ensureDiaSyncSchedule } from "./dia-sync-queue";

const globalForDiaWorker = globalThis as unknown as {
  diaSyncWorker?: Worker;
};

export interface SyncDiaResult {
  success: boolean;
  skipped?: boolean;
  requiresReauth?: boolean;
  importedCount?: number;
  skippedCount?: number;
  error?: string;
}

/**
 * Synchronizes tickets for a single Dia store connection:
 * 1. Decrypts credentials.
 * 2. Fetches tickets page (offset 0, limit 12).
 * 3. Rotates session_id and customer_access cookies automatically.
 * 4. Imports new tickets deterministically without OCR.
 * 5. Handles 401/403 session expiration by transitioning status to REQUIRES_REAUTH.
 */
export async function syncDiaConnection(connectionId: string): Promise<SyncDiaResult> {
  const connection = await prisma.storeConnection.findUnique({
    where: { id: connectionId },
  });

  if (!connection) {
    return { success: false, skipped: true, error: `Connection ${connectionId} not found` };
  }

  if (!connection.syncEnabled) {
    return { success: false, skipped: true, error: "Connection sync is disabled" };
  }

  console.log(`[DiaWorker] Starting sync for connection ${connectionId} (${connection.accountLabel || "Dia"})...`);

  // Transition to SYNCING
  await prisma.storeConnection.update({
    where: { id: connectionId },
    data: { status: "SYNCING" },
  });

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

  try {
    // 1. Fetch recent tickets page
    const pageRes = await fetchDiaTicketsPage(currentCreds, { offset: 0, pageSize: 12 });

    // 2. Capture any rotated tokens from response headers
    if (pageRes.rotatedCreds) {
      currentCreds = pageRes.rotatedCreds;
    }

    const accountLabel = getDiaAccountLabel(
      currentCreds.customerAccess,
      pageRes.data.customer?.display_name || connection.accountLabel || undefined
    );

    const tickets = pageRes.data.tickets || [];
    let importedCount = 0;
    let skippedCount = 0;
    let latestTicketDate: Date | null = connection.lastTicketDate;

    // 3. Process tickets
    for (const ticket of tickets) {
      const ticketDate = new Date(ticket.submitted_date || ticket.detail_params?.begin || Date.now());
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

      await importDiaTicket({
        userId: connection.userId,
        summary: ticket,
        detail: detailRes.data,
      });

      importedCount++;
    }

    // 4. Persist updated rotated credentials & mark ACTIVE
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
        lastError: null,
      },
    });

    console.log(
      `[DiaWorker] ✓ Connection ${connectionId} synced successfully: ${importedCount} imported, ${skippedCount} skipped.`
    );

    return {
      success: true,
      importedCount,
      skippedCount,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const isAuthError =
      errorMsg.includes("401") ||
      errorMsg.includes("403") ||
      errorMsg.toLowerCase().includes("unauthorized") ||
      errorMsg.toLowerCase().includes("session expired");

    console.error(`[DiaWorker] ❌ Sync error for connection ${connectionId}:`, errorMsg);

    await prisma.storeConnection.update({
      where: { id: connectionId },
      data: {
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
}

/**
 * Synchronizes all active Dia connections across all users.
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
      syncEnabled: true,
      status: { not: "FAILED" },
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
