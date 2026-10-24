import { Queue } from "bullmq";
import { redis } from "@/lib/redis";
import { processReceiptJob } from "./receipt-worker";

const globalForQueue = globalThis as unknown as {
  receiptQueue?: Queue;
};

export const receiptQueue =
  globalForQueue.receiptQueue ||
  new Queue("receipt-parse", {
    connection: redis,
    prefix: "tt",
    defaultJobOptions: {
      attempts: 4,
      backoff: {
        type: "exponential",
        delay: 3000,
      },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForQueue.receiptQueue = receiptQueue;
}

export async function enqueueReceiptParse(receiptId: string): Promise<void> {
  try {
    // Try enqueuing into BullMQ / Redis
    await receiptQueue.add(
      "parse",
      { receiptId },
      { jobId: `receipt-${receiptId}` }
    );
    console.log(`[Queue] ✓ Enqueued receipt ${receiptId} into BullMQ (tt:receipt-parse)`);
  } catch (queueErr) {
    console.warn(
      `[Queue] ⚠️ Redis unreachable or queue error (${
        queueErr instanceof Error ? queueErr.message : queueErr
      }). Falling back to in-process async processing.`
    );
    // In-process fallback: run asynchronously so HTTP response is not blocked
    setImmediate(async () => {
      try {
        await processReceiptJob(receiptId);
      } catch (err) {
        console.error(`[Queue] In-process fallback failed for receipt ${receiptId}:`, err);
      }
    });
  }
}
