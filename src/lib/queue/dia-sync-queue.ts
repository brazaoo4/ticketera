import { Queue } from "bullmq";
import { redis } from "@/lib/redis";
import { getDiaSyncIntervalMinutes } from "@/lib/integrations/dia/sync-policy";
import { syncDiaConnection, syncAllDiaConnections } from "./dia-sync-worker";

const globalForDiaQueue = globalThis as unknown as {
  diaSyncQueue?: Queue;
};

export const DIA_SYNC_JOB_SCHEDULER_ID = "dia-sync-periodic";
export { getDiaSyncIntervalMinutes };

export const diaSyncQueue =
  globalForDiaQueue.diaSyncQueue ||
  new Queue("dia-sync", {
    connection: redis,
    prefix: "tt",
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 10_000,
      },
      removeOnComplete: true,
      removeOnFail: 50,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForDiaQueue.diaSyncQueue = diaSyncQueue;
}

/**
 * Upserts a repeatable BullMQ job scheduler running on a fixed interval (default: every 10 minutes).
 * This provides ~6 heartbeats inside Dia's 60-minute sliding session window and tolerates transient misses.
 */
export async function ensureDiaSyncSchedule(): Promise<void> {
  const intervalMinutes = getDiaSyncIntervalMinutes();
  const everyMs = intervalMinutes * 60 * 1000;

  try {
    if (typeof diaSyncQueue.upsertJobScheduler === "function") {
      await diaSyncQueue.upsertJobScheduler(
        DIA_SYNC_JOB_SCHEDULER_ID,
        { every: everyMs },
        {
          name: "sync-all-dia-connections",
          data: {},
        }
      );
      console.log(`[DiaQueue] ✓ Repeatable Dia sync schedule active (every ${intervalMinutes}m)`);
    }
  } catch (err) {
    console.warn(
      "[DiaQueue] ⚠️ Could not configure BullMQ job scheduler (safe in dev / when Redis offline):",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Enqueues a delayed one-off verification sync for a single connection after a first auth failure,
 * confirming whether the error was transient before transitioning to REQUIRES_REAUTH.
 */
export async function scheduleDelayedDiaVerify(
  connectionId: string,
  delayMs = 90_000
): Promise<boolean> {
  try {
    await diaSyncQueue.add(
      "sync",
      { connectionId, isGraceRetry: true },
      {
        delay: delayMs,
        jobId: `dia-verify-${connectionId}-${Date.now()}`,
      }
    );
    console.log(`[DiaQueue] ⏳ Scheduled delayed auth verification for ${connectionId} in ${Math.round(delayMs / 1000)}s`);
    return true;
  } catch (err) {
    console.warn(
      "[DiaQueue] ⚠️ Could not schedule delayed auth verification:",
      err instanceof Error ? err.message : err
    );
    return false;
  }
}

/**
 * Enqueues a one-time startup keepalive shortly after boot so restarts refresh active sessions immediately.
 */
export async function scheduleStartupDiaSync(delayMs = 5_000): Promise<void> {
  try {
    await diaSyncQueue.add(
      "sync",
      {},
      {
        delay: delayMs,
        jobId: `dia-startup-sync-${Math.floor(Date.now() / 10_000)}`,
      }
    );
    console.log(`[DiaQueue] ✓ Scheduled startup Dia keepalive in ${Math.round(delayMs / 1000)}s`);
  } catch (err) {
    console.warn(
      "[DiaQueue] ⚠️ Could not schedule startup Dia keepalive:",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Triggers an immediate Dia sync, with graceful in-process execution fallback if Redis is offline.
 */
export async function triggerDiaSyncNow(
  connectionId?: string
): Promise<{ enqueued: boolean; jobId?: string; inProcessResult?: unknown }> {
  try {
    const job = await diaSyncQueue.add(
      "sync",
      { connectionId },
      {
        jobId: connectionId ? `dia-sync-${connectionId}-${Date.now()}` : `dia-sync-all-${Date.now()}`,
      }
    );
    console.log(`[DiaQueue] ✓ Enqueued Dia sync job: ${job.id}`);
    return { enqueued: true, jobId: job.id };
  } catch (queueErr) {
    console.warn(
      `[DiaQueue] ⚠️ Redis unreachable or queue error (${
        queueErr instanceof Error ? queueErr.message : queueErr
      }). Falling back to in-process sync execution.`
    );

    if (connectionId) {
      const result = await syncDiaConnection(connectionId);
      return { enqueued: false, inProcessResult: result };
    } else {
      const result = await syncAllDiaConnections();
      return { enqueued: false, inProcessResult: result };
    }
  }
}
