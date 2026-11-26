import { prisma } from "@/lib/db";
import { makeDuplicatePairKey } from "@/lib/catalog/duplicates";

const DISMISSED_DUPLICATE_PAIRS_KEY = "DISMISSED_DUPLICATE_PAIRS";

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

function normalizePairKeyList(rawKeys: Iterable<unknown>): string[] {
  const unique = new Set<string>();
  for (const item of rawKeys) {
    if (typeof item !== "string") continue;
    const parts = item.split("::");
    if (parts.length !== 2) continue;
    const canonical = makeDuplicatePairKey(parts[0], parts[1]);
    if (canonical) unique.add(canonical);
  }
  return Array.from(unique).sort();
}

function parseDismissedPairsValue(rawValue: string | null | undefined): string[] {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];
    return normalizePairKeyList(parsed);
  } catch {
    return [];
  }
}

async function saveDismissedDuplicatePairs(pairKeys: string[]): Promise<string[]> {
  const normalized = normalizePairKeyList(pairKeys);
  await prisma.systemSetting.upsert({
    where: { key: DISMISSED_DUPLICATE_PAIRS_KEY },
    update: { value: JSON.stringify(normalized) },
    create: {
      key: DISMISSED_DUPLICATE_PAIRS_KEY,
      value: JSON.stringify(normalized),
    },
  });
  return normalized;
}

/**
 * Returns the sorted list of canonical product pair keys dismissed by an admin.
 */
export async function getDismissedDuplicatePairs(): Promise<string[]> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: DISMISSED_DUPLICATE_PAIRS_KEY },
    });
    return parseDismissedPairsValue(setting?.value);
  } catch {
    return [];
  }
}

/**
 * Persists one or more newly dismissed duplicate pair keys in SystemSetting.
 */
export async function addDismissedDuplicatePairs(
  pairKeys: string[]
): Promise<string[]> {
  const incoming = normalizePairKeyList(pairKeys);
  const existing = await getDismissedDuplicatePairs();
  if (incoming.length === 0) return existing;
  return saveDismissedDuplicatePairs([...existing, ...incoming]);
}

/**
 * Restores specific dismissed duplicate pair keys, or clears all dismissals when omitted.
 */
export async function removeDismissedDuplicatePairs(
  pairKeys?: string[]
): Promise<string[]> {
  if (pairKeys === undefined) {
    return saveDismissedDuplicatePairs([]);
  }
  const toRemove = new Set(normalizePairKeyList(pairKeys));
  const existing = await getDismissedDuplicatePairs();
  if (toRemove.size === 0) return existing;
  return saveDismissedDuplicatePairs(existing.filter((k) => !toRemove.has(k)));
}

/**
 * Removes stored pair dismissals that reference products deleted by a merge or deletion.
 */
export async function pruneDismissedDuplicatePairsForProducts(
  removedProductIds: string[]
): Promise<void> {
  const removed = new Set(
    removedProductIds.map((id) => id.trim()).filter(Boolean)
  );
  if (removed.size === 0) return;

  const existing = await getDismissedDuplicatePairs();
  if (existing.length === 0) return;

  const remaining = existing.filter((pairKey) => {
    const [a, b] = pairKey.split("::");
    return Boolean(a && b && !removed.has(a) && !removed.has(b));
  });

  if (remaining.length !== existing.length) {
    await saveDismissedDuplicatePairs(remaining);
  }
}
