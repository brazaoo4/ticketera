"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CANONICAL_CATEGORIES } from "@/lib/ai/schema";
import { OVERALL_BUDGET_CATEGORY } from "@/lib/analytics/budgets";

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
