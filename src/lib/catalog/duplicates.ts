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
 * Groups likely duplicate products into clusters with a recommended survivor product.
 */
export function findDuplicateProductGroups(
  products: DuplicateCandidateProduct[]
): DuplicateProductGroup[] {
  if (products.length < 2) return [];

  const n = products.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const maxPairSim = new Map<number, number>();

  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };

  const union = (a: number, b: number, sim: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[rb] = ra;
      maxPairSim.set(ra, Math.max(maxPairSim.get(ra) || 0, maxPairSim.get(rb) || 0, sim));
    } else {
      maxPairSim.set(ra, Math.max(maxPairSim.get(ra) || 0, sim));
    }
  };

  const normalizedNames = products.map((p) =>
    normalizeProductNameForMatching(p.displayName)
  );

  for (let i = 0; i < n; i++) {
    if (!normalizedNames[i]) continue;
    for (let j = i + 1; j < n; j++) {
      if (!normalizedNames[j]) continue;

      const sameCategory = products[i].category === products[j].category;
      const sim =
        normalizedNames[i] === normalizedNames[j]
          ? 1
          : computeNameSimilarity(products[i].displayName, products[j].displayName);

      if (sim === 1 || (sameCategory && sim >= 0.62) || (!sameCategory && sim >= 0.80)) {
        union(i, j, sim);
      }
    }
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
