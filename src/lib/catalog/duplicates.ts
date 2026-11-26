export interface DuplicateCandidateProduct {
  id: string;
  slug: string;
  displayName: string;
  category: string;
  baseUnit: "KG" | "L" | "UNIT";
  isStaple: boolean;
  sightingsCount: number;
  aliasesCount: number;
}

export interface DuplicateProductGroup {
  groupKey: string;
  survivorId: string;
  products: DuplicateCandidateProduct[];
  similarityScore: number;
  hasBaseUnitMismatch: boolean;
}

/**
 * Returns a canonical order-independent key for a pair of product IDs (`min::max`),
 * or `""` if either ID is empty or both refer to the same product.
 */
export function makeDuplicatePairKey(idA: string, idB: string): string {
  const a = idA.trim();
  const b = idB.trim();
  if (!a || !b || a === b) return "";
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

/**
 * Validates that a key is a canonical `idA::idB` duplicate pair key.
 */
export function isValidDuplicatePairKey(key: string): boolean {
  const parts = key.split("::");
  if (parts.length !== 2) return false;
  const canonical = makeDuplicatePairKey(parts[0], parts[1]);
  return Boolean(canonical) && canonical === key;
}

/**
 * Returns all canonical pairwise keys connecting every product in a duplicate cluster.
 */
export function getGroupPairKeys(productIds: string[]): string[] {
  const uniqueIds = Array.from(
    new Set(productIds.map((id) => id.trim()).filter(Boolean))
  );
  const pairs = new Set<string>();
  for (let i = 0; i < uniqueIds.length; i++) {
    for (let j = i + 1; j < uniqueIds.length; j++) {
      const key = makeDuplicatePairKey(uniqueIds[i], uniqueIds[j]);
      if (key) pairs.add(key);
    }
  }
  return Array.from(pairs).sort();
}

const PRIVATE_LABEL_BRANDS = new Set([
  "hacendado",
  "milbona",
  "carrefour",
  "dia",
  "consum",
  "auchan",
  "bosque",
  "verde",
  "deliplus",
  "milsani",
  "alteza",
  "eroski",
  "aliada",
  "mercadona",
  "lidl",
  "aldi",
  "alcampo",
]);

const PACKAGING_STOP_WORDS = new Set([
  "pack",
  "brik",
  "brick",
  "botella",
  "garrafa",
  "lata",
  "bolsa",
  "bandeja",
  "docena",
  "ud",
  "uds",
  "unidades",
  "unidad",
  "de",
  "la",
  "el",
  "en",
  "con",
  "sin",
  "para",
]);

/**
 * Normalizes a Spanish grocery product name by removing accents, store private labels,
 * and packaging/quantity tokens to detect likely duplicate entries.
 */
export function normalizeProductNameForMatching(name: string): string {
  const ascii = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  // Strip multi-pack and weight/volume quantities (e.g. 6x1l, 4x125g, 500g, 1,5 l, 12ud)
  const noSizes = ascii
    .replace(/\b\d+\s*[xX*]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|gr|l|cl|ml|ud|uds)?\b/g, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|kilos?|g|gr|gramos?|l|litros?|cl|ml|ud|uds|unidades?)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ");

  const tokens = noSizes
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !PRIVATE_LABEL_BRANDS.has(t) && !PACKAGING_STOP_WORDS.has(t));

  return tokens.join(" ");
}

function getCharacterBigrams(str: string): string[] {
  const clean = str.replace(/\s+/g, "");
  if (clean.length < 2) return clean ? [clean] : [];
  const bigrams: string[] = [];
  for (let i = 0; i < clean.length - 1; i++) {
    bigrams.push(clean.slice(i, i + 2));
  }
  return bigrams;
}

/**
 * Computes normalized name similarity in [0, 1] combining exact normalized equality,
 * token Jaccard overlap, and character bigram Dice coefficient.
 */
export function computeNameSimilarity(nameA: string, nameB: string): number {
  const normA = normalizeProductNameForMatching(nameA);
  const normB = normalizeProductNameForMatching(nameB);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  const tokensA = new Set(normA.split(" "));
  const tokensB = new Set(normB.split(" "));

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const unionSize = tokensA.size + tokensB.size - intersection;
  const jaccard = unionSize > 0 ? intersection / unionSize : 0;

  const bigramsA = getCharacterBigrams(normA);
  const bigramsB = getCharacterBigrams(normB);
  const countB = new Map<string, number>();
  for (const bg of bigramsB) {
    countB.set(bg, (countB.get(bg) || 0) + 1);
  }
  let bgMatches = 0;
  for (const bg of bigramsA) {
    const c = countB.get(bg) || 0;
    if (c > 0) {
      bgMatches++;
      countB.set(bg, c - 1);
    }
  }
  const dice =
    bigramsA.length + bigramsB.length > 0
      ? (2 * bgMatches) / (bigramsA.length + bigramsB.length)
      : 0;

  // Give strong weight when one normalized token set is a strict subset of the other (>= 2 shared tokens)
  const minTokens = Math.min(tokensA.size, tokensB.size);
  const subsetBonus =
    minTokens >= 2 && intersection === minTokens ? 0.85 : 0;

  return Number(Math.max(subsetBonus, 0.55 * jaccard + 0.45 * dice).toFixed(3));
}

function chooseSurvivor(products: DuplicateCandidateProduct[]): DuplicateCandidateProduct {
  return [...products].sort((a, b) => {
    if (b.sightingsCount !== a.sightingsCount) {
      return b.sightingsCount - a.sightingsCount;
    }
    if (b.isStaple !== a.isStaple) {
      return b.isStaple ? 1 : -1;
    }
    if (b.aliasesCount !== a.aliasesCount) {
      return b.aliasesCount - a.aliasesCount;
    }
    return a.displayName.length - b.displayName.length;
  })[0];
}

/**
 * Groups likely duplicate products into clusters with a recommended survivor product,
 * skipping any product pairs previously dismissed by an admin.
 */
export function findDuplicateProductGroups(
  products: DuplicateCandidateProduct[],
  dismissedPairKeys?: Iterable<string>
): DuplicateProductGroup[] {
  if (products.length < 2) return [];

  const dismissed = new Set<string>();
  if (dismissedPairKeys) {
    for (const rawKey of dismissedPairKeys) {
      const parts = String(rawKey).split("::");
      if (parts.length === 2) {
        const canonical = makeDuplicatePairKey(parts[0], parts[1]);
        if (canonical) dismissed.add(canonical);
      }
    }
  }

  const n = products.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const members = Array.from({ length: n }, (_, i) => [i]);
  const maxPairSim = new Map<number, number>();

  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };

  const normalizedNames = products.map((p) =>
    normalizeProductNameForMatching(p.displayName)
  );

  const edges: Array<{ i: number; j: number; sim: number }> = [];
  for (let i = 0; i < n; i++) {
    if (!normalizedNames[i]) continue;
    for (let j = i + 1; j < n; j++) {
      if (!normalizedNames[j]) continue;

      if (
        dismissed.size > 0 &&
        dismissed.has(makeDuplicatePairKey(products[i].id, products[j].id))
      ) {
        continue;
      }

      const sameCategory = products[i].category === products[j].category;
      const sim =
        normalizedNames[i] === normalizedNames[j]
          ? 1
          : computeNameSimilarity(products[i].displayName, products[j].displayName);

      if (sim === 1 || (sameCategory && sim >= 0.62) || (!sameCategory && sim >= 0.80)) {
        edges.push({ i, j, sim });
      }
    }
  }

  // Merge strongest matches first so a previously dismissed pair cannot be
  // re-linked transitively through a newly added variant of one side.
  edges.sort((a, b) => b.sim - a.sim);

  for (const { i, j, sim } of edges) {
    const ra = find(i);
    const rb = find(j);
    if (ra === rb) {
      maxPairSim.set(ra, Math.max(maxPairSim.get(ra) || 0, sim));
      continue;
    }

    if (dismissed.size > 0) {
      let hasDismissedConflict = false;
      for (const mA of members[ra]) {
        for (const mB of members[rb]) {
          if (dismissed.has(makeDuplicatePairKey(products[mA].id, products[mB].id))) {
            hasDismissedConflict = true;
            break;
          }
        }
        if (hasDismissedConflict) break;
      }
      if (hasDismissedConflict) continue;
    }

    parent[rb] = ra;
    members[ra].push(...members[rb]);
    members[rb] = [];
    maxPairSim.set(ra, Math.max(maxPairSim.get(ra) || 0, maxPairSim.get(rb) || 0, sim));
  }

  const clusters = new Map<number, DuplicateCandidateProduct[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const list = clusters.get(root) || [];
    list.push(products[i]);
    clusters.set(root, list);
  }

  const groups: DuplicateProductGroup[] = [];
  for (const [root, clusterProducts] of clusters.entries()) {
    if (clusterProducts.length < 2) continue;

    const survivor = chooseSurvivor(clusterProducts);
    const sortedProducts = [
      survivor,
      ...clusterProducts
        .filter((p) => p.id !== survivor.id)
        .sort((a, b) => b.sightingsCount - a.sightingsCount),
    ];

    const hasBaseUnitMismatch = sortedProducts.some(
      (p) => p.baseUnit !== survivor.baseUnit
    );

    groups.push({
      groupKey: survivor.id,
      survivorId: survivor.id,
      products: sortedProducts,
      similarityScore: maxPairSim.get(root) || 0.8,
      hasBaseUnitMismatch,
    });
  }

  return groups.sort((a, b) => {
    if (b.similarityScore !== a.similarityScore) {
      return b.similarityScore - a.similarityScore;
    }
    const totalA = a.products.reduce((s, p) => s + p.sightingsCount, 0);
    const totalB = b.products.reduce((s, p) => s + p.sightingsCount, 0);
    return totalB - totalA;
  });
}
