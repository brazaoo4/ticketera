export const NON_FOOD_CATEGORIES = new Set([
  "Cleaning & Household",
  "Personal Care",
]);

export interface NutritionItemInput {
  productId?: string | null;
  productSlug?: string | null;
  productName: string;
  category: string;
  purchaseDate: string;
  storeName: string;
  storeBrandHex: string;
  totalPrice: number;
  baseUnit: "KG" | "L" | "UNIT";
  pricePerBaseUnit: number;
  nutriScore?: string | null;
  novaGroup?: number | null;
  proteinPer100g?: number | null;
  kcalPer100g?: number | null;
  excluded?: boolean;
  isDiscount?: boolean;
}

export interface ProteinPerEuroRankingRow {
  productKey: string;
  productSlug: string | null;
  productName: string;
  category: string;
  storeName: string;
  storeBrandHex: string;
  baseUnit: "KG" | "L";
  pricePerBaseUnit: number;
  proteinPer100g: number;
  kcalPer100g: number | null;
  proteinPerEuro: number;
  kcalPerEuro: number | null;
  nutriScore: "a" | "b" | "c" | "d" | "e" | null;
  novaGroup: 1 | 2 | 3 | 4 | null;
}

export interface NovaBucketSummary {
  group: 1 | 2 | 3 | 4;
  label: string;
  shortLabel: string;
  spend: number;
  itemCount: number;
  shareOfTaggedPercent: number;
}

export interface NutriScoreBucketSummary {
  grade: "a" | "b" | "c" | "d" | "e";
  spend: number;
  itemCount: number;
  shareOfTaggedPercent: number;
}

export interface NutritionBasketInsights {
  foodSpendTotal: number;
  totalFoodItemCount: number;
  taggedNovaSpend: number;
  taggedNovaItemCount: number;
  taggedNutriScoreSpend: number;
  taggedNutriScoreItemCount: number;
  taggedProductCount: number;
  totalFoodProductCount: number;
  nova4Spend: number;
  nova4SharePercent: number;
  nova4ItemSharePercent: number;
  novaBreakdown: NovaBucketSummary[];
  nutriScoreBreakdown: NutriScoreBucketSummary[];
  proteinPerEuroRankings: ProteinPerEuroRankingRow[];
}

/**
 * Calculates grams of protein per euro spent.
 * Strictly supports weight (KG) and volume (L, ~1kg=1L density) normalized prices.
 * Returns null for UNIT-priced items to avoid fabricating unverified weights.
 */
export function computeProteinPerEuro(
  proteinPer100g: number | null | undefined,
  pricePerBaseUnit: number,
  baseUnit: "KG" | "L" | "UNIT"
): number | null {
  if (baseUnit !== "KG" && baseUnit !== "L") return null;
  if (
    proteinPer100g === null ||
    proteinPer100g === undefined ||
    !Number.isFinite(proteinPer100g) ||
    proteinPer100g <= 0
  ) {
    return null;
  }
  if (!Number.isFinite(pricePerBaseUnit) || pricePerBaseUnit <= 0) {
    return null;
  }
  // 1 kg or 1 L = 10 × 100g
  return Number(((proteinPer100g * 10) / pricePerBaseUnit).toFixed(1));
}

/**
 * Calculates kcal per euro spent for KG / L normalized items.
 */
export function computeKcalPerEuro(
  kcalPer100g: number | null | undefined,
  pricePerBaseUnit: number,
  baseUnit: "KG" | "L" | "UNIT"
): number | null {
  if (baseUnit !== "KG" && baseUnit !== "L") return null;
  if (
    kcalPer100g === null ||
    kcalPer100g === undefined ||
    !Number.isFinite(kcalPer100g) ||
    kcalPer100g <= 0
  ) {
    return null;
  }
  if (!Number.isFinite(pricePerBaseUnit) || pricePerBaseUnit <= 0) {
    return null;
  }
  return Math.round((kcalPer100g * 10) / pricePerBaseUnit);
}

export function getNutriScoreBadgeStyle(grade: string | null | undefined): {
  letter: string;
  className: string;
} | null {
  const g = (grade || "").trim().toLowerCase();
  switch (g) {
    case "a":
      return {
        letter: "A",
        className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
      };
    case "b":
      return {
        letter: "B",
        className: "bg-lime-500/15 text-lime-300 border-lime-500/40",
      };
    case "c":
      return {
        letter: "C",
        className: "bg-amber-500/15 text-amber-300 border-amber-500/40",
      };
    case "d":
      return {
        letter: "D",
        className: "bg-orange-500/15 text-orange-300 border-orange-500/40",
      };
    case "e":
      return {
        letter: "E",
        className: "bg-rose-500/15 text-rose-300 border-rose-500/40",
      };
    default:
      return null;
  }
}

export function getNovaGroupMeta(novaGroup: number | null | undefined): {
  group: 1 | 2 | 3 | 4;
  label: string;
  shortLabel: string;
  className: string;
  barColor: string;
} | null {
  switch (novaGroup) {
    case 1:
      return {
        group: 1,
        label: "NOVA 1 · Unprocessed / Minimally Processed",
        shortLabel: "NOVA 1",
        className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
        barColor: "#10b981",
      };
    case 2:
      return {
        group: 2,
        label: "NOVA 2 · Culinary Ingredients",
        shortLabel: "NOVA 2",
        className: "bg-sky-500/15 text-sky-300 border-sky-500/30",
        barColor: "#0ea5e9",
      };
    case 3:
      return {
        group: 3,
        label: "NOVA 3 · Processed Foods",
        shortLabel: "NOVA 3",
        className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
        barColor: "#f59e0b",
      };
    case 4:
      return {
        group: 4,
        label: "NOVA 4 · Ultra-Processed",
        shortLabel: "NOVA 4",
        className: "bg-rose-500/15 text-rose-300 border-rose-500/30",
        barColor: "#f43f5e",
      };
    default:
      return null;
  }
}

/**
 * Computes basket-level NOVA 4 ultra-processed share, Nutri-Score distribution,
 * and Protein-per-€ efficiency rankings from confirmed grocery items.
 */
export function computeNutritionBasketInsights(
  items: NutritionItemInput[]
): NutritionBasketInsights {
  const foodItems = items.filter(
    (item) =>
      !item.excluded &&
      !item.isDiscount &&
      !NON_FOOD_CATEGORIES.has(item.category)
  );

  let foodSpendTotal = 0;
  let taggedNovaSpend = 0;
  let taggedNovaItemCount = 0;
  let taggedNutriScoreSpend = 0;
  let taggedNutriScoreItemCount = 0;

  const novaSpend = new Map<1 | 2 | 3 | 4, { spend: number; count: number }>([
    [1, { spend: 0, count: 0 }],
    [2, { spend: 0, count: 0 }],
    [3, { spend: 0, count: 0 }],
    [4, { spend: 0, count: 0 }],
  ]);

  const nutriSpend = new Map<
    "a" | "b" | "c" | "d" | "e",
    { spend: number; count: number }
  >([
    ["a", { spend: 0, count: 0 }],
    ["b", { spend: 0, count: 0 }],
    ["c", { spend: 0, count: 0 }],
    ["d", { spend: 0, count: 0 }],
    ["e", { spend: 0, count: 0 }],
  ]);

  const distinctFoodProducts = new Set<string>();
  const distinctTaggedProducts = new Set<string>();

  // Track best (or latest) normalized price observation per food product for protein/€ ranking
  const productSightings = new Map<string, NutritionItemInput[]>();

  for (const item of foodItems) {
    const spend = Math.max(0, Number(item.totalPrice) || 0);
    foodSpendTotal += spend;

    const prodKey = item.productSlug || item.productId || item.productName;
    distinctFoodProducts.add(prodKey);

    const hasAnyNutrition =
      item.novaGroup != null ||
      item.nutriScore != null ||
      item.proteinPer100g != null ||
      item.kcalPer100g != null;
    if (hasAnyNutrition) {
      distinctTaggedProducts.add(prodKey);
    }

    if (
      item.novaGroup === 1 ||
      item.novaGroup === 2 ||
      item.novaGroup === 3 ||
      item.novaGroup === 4
    ) {
      taggedNovaSpend += spend;
      taggedNovaItemCount += 1;
      const bucket = novaSpend.get(item.novaGroup)!;
      bucket.spend += spend;
      bucket.count += 1;
    }

    const grade = (item.nutriScore || "").trim().toLowerCase();
    if (
      grade === "a" ||
      grade === "b" ||
      grade === "c" ||
      grade === "d" ||
      grade === "e"
    ) {
      taggedNutriScoreSpend += spend;
      taggedNutriScoreItemCount += 1;
      const bucket = nutriSpend.get(grade)!;
      bucket.spend += spend;
      bucket.count += 1;
    }

    const existingList = productSightings.get(prodKey) || [];
    existingList.push(item);
    productSightings.set(prodKey, existingList);
  }

  const novaBreakdown: NovaBucketSummary[] = ([1, 2, 3, 4] as const).map((g) => {
    const bucket = novaSpend.get(g)!;
    const meta = getNovaGroupMeta(g)!;
    return {
      group: g,
      label: meta.label,
      shortLabel: meta.shortLabel,
      spend: Number(bucket.spend.toFixed(2)),
      itemCount: bucket.count,
      shareOfTaggedPercent:
        taggedNovaSpend > 0
          ? Number(((bucket.spend / taggedNovaSpend) * 100).toFixed(1))
          : 0,
    };
  });

  const nova4Bucket = novaSpend.get(4)!;
  const nova4Spend = Number(nova4Bucket.spend.toFixed(2));
  const nova4SharePercent =
    taggedNovaSpend > 0
      ? Number(((nova4Bucket.spend / taggedNovaSpend) * 100).toFixed(1))
      : 0;
  const nova4ItemSharePercent =
    taggedNovaItemCount > 0
      ? Number(((nova4Bucket.count / taggedNovaItemCount) * 100).toFixed(1))
      : 0;

  const nutriScoreBreakdown: NutriScoreBucketSummary[] = (
    ["a", "b", "c", "d", "e"] as const
  ).map((grade) => {
    const bucket = nutriSpend.get(grade)!;
    return {
      grade,
      spend: Number(bucket.spend.toFixed(2)),
      itemCount: bucket.count,
      shareOfTaggedPercent:
        taggedNutriScoreSpend > 0
          ? Number(((bucket.spend / taggedNutriScoreSpend) * 100).toFixed(1))
          : 0,
    };
  });

  const proteinPerEuroRankings: ProteinPerEuroRankingRow[] = [];
  for (const [productKey, sightings] of productSightings.entries()) {
    const sorted = [...sightings].sort(
      (a, b) =>
        new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()
    );
    const latest = sorted[0];
    if (!latest) continue;
    if (latest.baseUnit !== "KG" && latest.baseUnit !== "L") continue;

    // Pick lowest recent valid normalized price if multiple stores exist, else latest
    const validSightings = sorted.filter((s) => s.pricePerBaseUnit > 0);
    if (validSightings.length === 0) continue;

    const bestPriceSighting = validSightings.reduce((best, curr) =>
      curr.pricePerBaseUnit < best.pricePerBaseUnit ? curr : best
    );

    const proteinPerEuro = computeProteinPerEuro(
      bestPriceSighting.proteinPer100g,
      bestPriceSighting.pricePerBaseUnit,
      bestPriceSighting.baseUnit
    );
    if (proteinPerEuro === null || proteinPerEuro <= 0) continue;

    const kcalPerEuro = computeKcalPerEuro(
      bestPriceSighting.kcalPer100g,
      bestPriceSighting.pricePerBaseUnit,
      bestPriceSighting.baseUnit
    );

    const grade = (bestPriceSighting.nutriScore || "").trim().toLowerCase();
    const cleanGrade =
      grade === "a" || grade === "b" || grade === "c" || grade === "d" || grade === "e"
        ? grade
        : null;
    const cleanNova =
      bestPriceSighting.novaGroup === 1 ||
      bestPriceSighting.novaGroup === 2 ||
      bestPriceSighting.novaGroup === 3 ||
      bestPriceSighting.novaGroup === 4
        ? bestPriceSighting.novaGroup
        : null;

    proteinPerEuroRankings.push({
      productKey,
      productSlug: bestPriceSighting.productSlug || null,
      productName: bestPriceSighting.productName,
      category: bestPriceSighting.category,
      storeName: bestPriceSighting.storeName,
      storeBrandHex: bestPriceSighting.storeBrandHex,
      baseUnit: bestPriceSighting.baseUnit as "KG" | "L",
      pricePerBaseUnit: Number(bestPriceSighting.pricePerBaseUnit.toFixed(2)),
      proteinPer100g: Number(bestPriceSighting.proteinPer100g!.toFixed(2)),
      kcalPer100g:
        bestPriceSighting.kcalPer100g !== null &&
        bestPriceSighting.kcalPer100g !== undefined
          ? Number(bestPriceSighting.kcalPer100g.toFixed(1))
          : null,
      proteinPerEuro,
      kcalPerEuro,
      nutriScore: cleanGrade,
      novaGroup: cleanNova,
    });
  }

  proteinPerEuroRankings.sort((a, b) => b.proteinPerEuro - a.proteinPerEuro);

  return {
    foodSpendTotal: Number(foodSpendTotal.toFixed(2)),
    totalFoodItemCount: foodItems.length,
    taggedNovaSpend: Number(taggedNovaSpend.toFixed(2)),
    taggedNovaItemCount,
    taggedNutriScoreSpend: Number(taggedNutriScoreSpend.toFixed(2)),
    taggedNutriScoreItemCount,
    taggedProductCount: distinctTaggedProducts.size,
    totalFoodProductCount: distinctFoodProducts.size,
    nova4Spend,
    nova4SharePercent,
    nova4ItemSharePercent,
    novaBreakdown,
    nutriScoreBreakdown,
    proteinPerEuroRankings: proteinPerEuroRankings.slice(0, 10),
  };
}
