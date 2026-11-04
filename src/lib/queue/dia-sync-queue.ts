import { Queue } from "bullmq";
import { redis } from "@/lib/redis";
import { syncDiaConnection, syncAllDiaConnections } from "./dia-sync-worker";

const globalForDiaQueue = globalThis as unknown as {
  diaSyncQueue?: Queue;
};

export const diaSyncQueue =
  globalForDiaQueue.diaSyncQueue ||
  new Queue("dia-sync", {
    connection: redis,
    prefix: "tt",
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 3000,
      },
      removeOnComplete: true,
      removeOnFail: 50,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForDiaQueue.diaSyncQueue = diaSyncQueue;
}

/**
 * Upserts a repeatable BullMQ job scheduler running every 35 minutes.
 * This satisfies the 60-minute Dia session sliding window, keeping active sessions alive indefinitely.
 */
export async function ensureDiaSyncSchedule(): Promise<void> {
  try {
    if (typeof diaSyncQueue.upsertJobScheduler === "function") {
      await diaSyncQueue.upsertJobScheduler(
        "dia-sync-periodic",
        { pattern: "*/35 * * * *" },
        {
          name: "sync-all-dia-connections",
          data: {},
        }
      );
      console.log("[DiaQueue] ✓ Repeatable Dia sync schedule active (*/35 * * * *)");
    }
  } catch (err) {
    console.warn(
      "[DiaQueue] ⚠️ Could not configure BullMQ job scheduler (safe in dev / when Redis offline):",
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
