import { prisma } from "@/lib/db";

/**
 * Checks whether the public catalog mode is currently enabled.
 * First checks the PostgreSQL SystemSetting table, keeping process.env in sync.
 * Falls back to process.env.PUBLIC_CATALOG if database is unreachable.
 */
export async function isPublicCatalogEnabled(): Promise<boolean> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "PUBLIC_CATALOG" },
    });

    if (setting) {
      process.env.PUBLIC_CATALOG = setting.value;
      return setting.value === "true";
    }
  } catch {
    // Database query failed (e.g. offline during build)
  }

  return process.env.PUBLIC_CATALOG === "true";
}

/**
 * Persists the public catalog setting in the database and updates process.env in memory.
 */
export async function setPublicCatalogSetting(enabled: boolean): Promise<boolean> {
  const value = enabled ? "true" : "false";

  await prisma.systemSetting.upsert({
    where: { key: "PUBLIC_CATALOG" },
    update: { value },
    create: { key: "PUBLIC_CATALOG", value },
  });

  process.env.PUBLIC_CATALOG = value;
  return enabled;
}
