import { prisma } from "../src/lib/db";
import { CORE_STORES } from "../src/lib/startup";

async function main() {
  console.log("==> Running Prisma database seed...");
  for (const store of CORE_STORES) {
    await prisma.store.upsert({
      where: { slug: store.slug },
      update: {
        name: store.name,
        brandHex: store.brandHex,
      },
      create: {
        name: store.name,
        slug: store.slug,
        brandHex: store.brandHex,
      },
    });
  }
  console.log("==> Core supermarkets verified.");
  console.log("==> Prisma seed completed successfully.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
