"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { CANONICAL_CATEGORIES } from "@/lib/ai/schema";
import { OVERALL_BUDGET_CATEGORY } from "@/lib/analytics/budgets";
import { NON_FOOD_CATEGORIES } from "@/lib/analytics/nutrition";
import { searchOpenFoodFactsForNutrition } from "@/lib/catalog/openfoodfacts";

const VALID_BUDGET_CATEGORIES = new Set<string>([
  OVERALL_BUDGET_CATEGORY,
  ...CANONICAL_CATEGORIES,
]);

const SaveBudgetEntrySchema = z.object({
  category: z.string().refine((val) => VALID_BUDGET_CATEGORIES.has(val), {
    message: "Invalid budget category",
  }),
  monthlyTarget: z
    .number()
    .finite()
    .min(0)
    .max(100_000)
    .nullable(),
});

const SaveBudgetsPayloadSchema = z.array(SaveBudgetEntrySchema).min(1).max(30);

export async function saveMonthlyBudgetsAction(
  entries: Array<{ category: string; monthlyTarget: number | null }>
) {
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return { success: false, error: "Unauthorized. Please sign in to save budgets." };
  }

  const parsed = SaveBudgetsPayloadSchema.safeParse(entries);
  if (!parsed.success) {
    return {
      success: false,
      error: "Invalid budget values. Targets must be between €0.01 and €100,000.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const entry of parsed.data) {
        if (entry.monthlyTarget === null || entry.monthlyTarget <= 0) {
          await tx.monthlyBudget.deleteMany({
            where: {
              userId: user.id,
              category: entry.category,
            },
          });
        } else {
          const rounded = Number(entry.monthlyTarget.toFixed(2));
          await tx.monthlyBudget.upsert({
            where: {
              userId_category: {
                userId: user.id,
                category: entry.category,
              },
            },
            update: {
              monthlyTarget: new Prisma.Decimal(rounded),
            },
            create: {
              userId: user.id,
              category: entry.category,
              monthlyTarget: new Prisma.Decimal(rounded),
            },
          });
        }
      }
    });

    const updated = await prisma.monthlyBudget.findMany({
      where: { userId: user.id },
      orderBy: { category: "asc" },
    });

    revalidatePath("/my-stats");

    return {
      success: true,
      budgets: updated.map((b) => ({
        category: b.category,
        monthlyTarget: Number(b.monthlyTarget),
      })),
    };
  } catch (err) {
    console.error("[saveMonthlyBudgetsAction] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save monthly budgets.",
    };
  }
}

export async function deleteMonthlyBudgetAction(category: string) {
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return { success: false, error: "Unauthorized" };
  }

  if (!VALID_BUDGET_CATEGORIES.has(category)) {
    return { success: false, error: "Invalid budget category." };
  }

  try {
    await prisma.monthlyBudget.deleteMany({
      where: { userId: user.id, category },
    });
    revalidatePath("/my-stats");
    return { success: true };
  } catch (err) {
    console.error("[deleteMonthlyBudgetAction] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete budget target.",
    };
  }
}

export interface EnrichNutritionBatchOptions {
  limit?: number;
  excludeProductIds?: string[];
  includePreviouslyMissed?: boolean;
}

export async function enrichMissingNutritionBatchAction(
  options: number | EnrichNutritionBatchOptions = 8
) {
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return { success: false, error: "Unauthorized" };
  }

  const rateResult = await checkRateLimit({
    key: `nutrition-batch:${user.id}`,
    limit: 60,
    windowSeconds: 300,
  });

  if (!rateResult.success) {
    return {
      success: false,
      error: `Nutrition enrichment rate limit reached. Try again in ${rateResult.resetSeconds}s.`,
    };
  }

  const opts: EnrichNutritionBatchOptions =
    typeof options === "number" ? { limit: options } : options || {};
  const batchSize = Math.min(Math.max(1, Math.round(opts.limit ?? 8)), 10);
  const excludeIds = Array.from(
    new Set(
      (opts.excludeProductIds || [])
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, 1000)
    )
  );
  const includePreviouslyMissed = Boolean(opts.includePreviouslyMissed);

  const receiptOwnerFilter = user.role === "ADMIN" ? {} : { userId: user.id };
  const nonFoodList = Array.from(NON_FOOD_CATEGORIES);

  const baseWhere: Prisma.ProductWhereInput = {
    category: { notIn: nonFoodList },
    nutriScore: null,
    novaGroup: null,
    proteinPer100g: null,
    kcalPer100g: null,
    receiptItems: {
      some: {
        confirmed: true,
        excluded: false,
        receipt: {
          status: "CONFIRMED",
          ...receiptOwnerFilter,
        },
      },
    },
  };

  const eligibilitySourceFilter: Prisma.ProductWhereInput = includePreviouslyMissed
    ? {
        OR: [
          { nutritionSource: null },
          { nutritionSource: "openfoodfacts_none" },
        ],
      }
    : {
        nutritionSource: null,
      };

  try {
    const candidates = await prisma.product.findMany({
      where: {
        ...baseWhere,
        ...eligibilitySourceFilter,
        ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
      },
      orderBy: [{ receiptItems: { _count: "desc" } }, { displayName: "asc" }],
      take: batchSize,
      select: {
        id: true,
        displayName: true,
        category: true,
        ean: true,
        aliases: {
          orderBy: { createdAt: "desc" },
          take: 3,
          select: {
            barcode: true,
            store: {
              select: { slug: true },
            },
          },
        },
      },
    });

    let enrichedCount = 0;
    let notFoundCount = 0;
    let failedCount = 0;
    let cursor = 0;

    const processWorker = async (workerIdx: number) => {
      if (workerIdx > 0) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      while (true) {
        const idx = cursor++;
        if (idx >= candidates.length) break;
        if (idx >= 2) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }

        const prod = candidates[idx];
        const candidateEan =
          prod.ean ||
          prod.aliases.find((a) => Boolean(a.barcode))?.barcode ||
          null;
        const commonStoreSlug = prod.aliases[0]?.store?.slug;

        const { match, hadNetworkError } =
          await searchOpenFoodFactsForNutrition({
            query: prod.displayName,
            category: prod.category,
            store: commonStoreSlug,
            ean: candidateEan,
          });

        if (match?.nutrition) {
          enrichedCount++;
          await prisma.product.update({
            where: { id: prod.id },
            data: {
              nutriScore: match.nutrition.nutriScore,
              novaGroup: match.nutrition.novaGroup,
              proteinPer100g:
                match.nutrition.proteinPer100g !== null
                  ? new Prisma.Decimal(match.nutrition.proteinPer100g)
                  : null,
              kcalPer100g:
                match.nutrition.kcalPer100g !== null
                  ? new Prisma.Decimal(match.nutrition.kcalPer100g)
                  : null,
              ean: match.nutrition.ean || match.ean || candidateEan || undefined,
              nutritionSource: "openfoodfacts",
              nutritionUpdatedAt: new Date(),
            },
          });
        } else if (!hadNetworkError) {
          notFoundCount++;
          await prisma.product.update({
            where: { id: prod.id },
            data: {
              nutritionSource: "openfoodfacts_none",
              nutritionUpdatedAt: new Date(),
            },
          });
        } else {
          // Preserve null metadata on transient timeout/network error so item remains retryable
          failedCount++;
        }
      }
    };

    if (candidates.length > 0) {
      const workerCount = Math.min(2, candidates.length);
      await Promise.all(
        Array.from({ length: workerCount }, (_, workerIdx) =>
          processWorker(workerIdx)
        )
      );
    }

    const processedIds = candidates.map((c) => c.id);
    const combinedExcludeIds = Array.from(
      new Set([...excludeIds, ...processedIds])
    );

    const [remainingCount, unmatchedCount] = await Promise.all([
      prisma.product.count({
        where: {
          ...baseWhere,
          ...eligibilitySourceFilter,
          ...(combinedExcludeIds.length > 0
            ? { id: { notIn: combinedExcludeIds } }
            : {}),
        },
      }),
      prisma.product.count({
        where: {
          ...baseWhere,
          nutritionSource: "openfoodfacts_none",
        },
      }),
    ]);

    revalidatePath("/my-stats");
    revalidatePath("/products");

    return {
      success: true,
      processedIds,
      processedCount: candidates.length,
      enrichedCount,
      notFoundCount,
      failedCount,
      remainingCount,
      unmatchedCount,
    };
  } catch (err) {
    console.error("[enrichMissingNutritionBatchAction] Error:", err);
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to enrich nutrition metadata.",
    };
  }
}
