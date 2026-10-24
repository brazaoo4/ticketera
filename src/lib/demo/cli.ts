import { loadDemoData, clearDemoData } from "./demo-data";
import { prisma } from "../db";

async function main() {
  const command = process.argv[2];

  if (command === "load") {
    console.log("🧪 Loading realistic Spanish demo receipt dataset...");
    const res = await loadDemoData();
    console.log(`✅ Demo mode loaded successfully! Created ${res.count} receipts across 5 supermarkets.`);
  } else if (command === "clear") {
    console.log("🧹 Clearing all demo data and placeholder files...");
    const res = await clearDemoData();
    console.log(`✅ Demo mode cleared! Purged ${res.deletedCount} demo receipts.`);
  } else {
    console.log("Usage: tsx src/lib/demo/cli.ts [load|clear]");
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("Error running demo CLI command:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
