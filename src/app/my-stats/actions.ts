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
import { searchOpenFoodFacts } from "@/lib/catalog/openfoodfacts";

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

export async function enrichMissingNutritionBatchAction(limit = 8) {
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return { success: false, error: "Unauthorized" };
  }

  const rateResult = await checkRateLimit({
    key: `nutrition-batch:${user.id}`,
    limit: 6,
    windowSeconds: 300,
  });

  if (!rateResult.success) {
    return {
      success: false,
      error: `Nutrition enrichment rate limit reached. Try again in ${rateResult.resetSeconds}s.`,
    };
  }

  const batchSize = Math.min(Math.max(1, Math.round(limit)), 12);
  const receiptOwnerFilter = user.role === "ADMIN" ? {} : { userId: user.id };
  const nonFoodList = Array.from(NON_FOOD_CATEGORIES);

  try {
    const candidates = await prisma.product.findMany({
      where: {
        nutritionUpdatedAt: null,
        category: { notIn: nonFoodList },
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
      },
      orderBy: [{ receiptItems: { _count: "desc" } }, { displayName: "asc" }],
      take: batchSize,
      select: {
        id: true,
        displayName: true,
      },
    });

    let enrichedCount = 0;

    for (let i = 0; i < candidates.length; i++) {
      const prod = candidates[i];
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      const matches = await searchOpenFoodFacts({
        query: prod.displayName,
        requireQuantity: false,
      }).catch(() => []);

      const best = matches.find(
        (m) =>
          m.nutrition &&
          (m.nutrition.nutriScore !== null ||
            m.nutrition.novaGroup !== null ||
            m.nutrition.proteinPer100g !== null ||
            m.nutrition.kcalPer100g !== null)
      );

      if (best?.nutrition) {
        enrichedCount++;
        await prisma.product.update({
          where: { id: prod.id },
          data: {
            nutriScore: best.nutrition.nutriScore,
            novaGroup: best.nutrition.novaGroup,
            proteinPer100g:
              best.nutrition.proteinPer100g !== null
                ? new Prisma.Decimal(best.nutrition.proteinPer100g)
                : null,
            kcalPer100g:
              best.nutrition.kcalPer100g !== null
                ? new Prisma.Decimal(best.nutrition.kcalPer100g)
                : null,
            ean: best.nutrition.ean || best.ean || undefined,
            nutritionSource: "openfoodfacts",
            nutritionUpdatedAt: new Date(),
          },
        });
      } else {
        // Mark timestamp so unmatchable generic items aren't repeatedly queried
        await prisma.product.update({
          where: { id: prod.id },
          data: { nutritionUpdatedAt: new Date() },
        });
      }
    }

    const remainingCount = await prisma.product.count({
      where: {
        nutritionUpdatedAt: null,
        category: { notIn: nonFoodList },
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
      },
    });

    revalidatePath("/my-stats");
    revalidatePath("/products");

    return {
      success: true,
      processedCount: candidates.length,
      enrichedCount,
      remainingCount,
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
