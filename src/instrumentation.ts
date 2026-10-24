export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runStartupSeed } = await import("@/lib/startup");
    await runStartupSeed();

    if (process.env.NEXT_PHASE !== "phase-production-build") {
      const { initReceiptWorker } = await import("@/lib/queue/receipt-worker");
      initReceiptWorker();
    }
  }
}
