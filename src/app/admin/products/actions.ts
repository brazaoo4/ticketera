"use server";

import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { normalizeBarcode } from "@/lib/catalog/parser";

export async function toggleProductStapleAction(productId: string, isStaple: boolean) {
  try {
    await requireAdminUser();

    await prisma.product.update({
      where: { id: productId },
      data: { isStaple },
    });

    revalidatePath("/admin/products");
    revalidatePath("/products");
    revalidatePath("/compare");
    revalidatePath("/");

    return { success: true };
  } catch (err: unknown) {
    console.error("[toggleProductStapleAction] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to toggle staple flag.",
    };
  }
}

export async function updateProductAction(
  productId: string,
  data: {
    displayName: string;
    category: string;
    baseUnit: "KG" | "L" | "UNIT";
    isStaple: boolean;
    nutriScore?: "a" | "b" | "c" | "d" | "e" | null;
    novaGroup?: 1 | 2 | 3 | 4 | null;
    proteinPer100g?: number | null;
    kcalPer100g?: number | null;
    ean?: string | null;
  }
) {
  try {
    await requireAdminUser();

    const cleanName = data.displayName.trim();
    if (!cleanName) {
      return { success: false, error: "Display name cannot be empty." };
    }

    const existing = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!existing) {
      return { success: false, error: "Product not found." };
    }

    const baseUnitChanged = existing.baseUnit !== data.baseUnit;

    const nutritionPatch: Prisma.ProductUpdateInput = {};
    let hasNutritionEdit = false;

    if (data.nutriScore !== undefined) {
      const g = data.nutriScore ? data.nutriScore.toLowerCase() : null;
      nutritionPatch.nutriScore =
        g === "a" || g === "b" || g === "c" || g === "d" || g === "e" ? g : null;
      hasNutritionEdit = true;
    }
    if (data.novaGroup !== undefined) {
      nutritionPatch.novaGroup =
        data.novaGroup === 1 ||
        data.novaGroup === 2 ||
        data.novaGroup === 3 ||
        data.novaGroup === 4
          ? data.novaGroup
          : null;
      hasNutritionEdit = true;
    }
    if (data.proteinPer100g !== undefined) {
      nutritionPatch.proteinPer100g =
        data.proteinPer100g !== null &&
        Number.isFinite(data.proteinPer100g) &&
        data.proteinPer100g >= 0 &&
        data.proteinPer100g <= 100
          ? new Prisma.Decimal(Number(data.proteinPer100g.toFixed(2)))
          : null;
      hasNutritionEdit = true;
    }
    if (data.kcalPer100g !== undefined) {
      nutritionPatch.kcalPer100g =
        data.kcalPer100g !== null &&
        Number.isFinite(data.kcalPer100g) &&
        data.kcalPer100g >= 0 &&
        data.kcalPer100g <= 1000
          ? new Prisma.Decimal(Number(data.kcalPer100g.toFixed(1)))
          : null;
      hasNutritionEdit = true;
    }
    if (data.ean !== undefined) {
      nutritionPatch.ean = normalizeBarcode(data.ean) ?? null;
      hasNutritionEdit = true;
    }
    if (hasNutritionEdit) {
      nutritionPatch.nutritionSource = "manual";
      nutritionPatch.nutritionUpdatedAt = new Date();
    }

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: {
          displayName: cleanName,
          category: data.category,
          baseUnit: data.baseUnit,
          isStaple: data.isStaple,
          ...nutritionPatch,
        },
      });

      if (baseUnitChanged) {
        await tx.receiptItem.updateMany({
          where: { productId },
          data: {
            baseUnit: data.baseUnit,
          },
        });
      }
    });

    revalidatePath("/admin/products");
    revalidatePath(`/products/${existing.slug}`);
    revalidatePath("/products");
    revalidatePath("/compare");
    revalidatePath("/stores");
    revalidatePath("/my-stats");
    revalidatePath("/");

    return { success: true };
  } catch (err: unknown) {
    console.error("[updateProductAction] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update product.",
    };
  }
}

export async function mergeProductsBatchAction(
  sourceProductIds: string[],
  targetProductId: string
) {
  try {
    await requireAdminUser();

    const uniqueSourceIds = Array.from(
      new Set(sourceProductIds.map((id) => id.trim()).filter(Boolean))
    );

    if (uniqueSourceIds.length === 0) {
      return { success: false, error: "Select at least one duplicate product to merge." };
    }

    if (uniqueSourceIds.includes(targetProductId)) {
      return { success: false, error: "Cannot merge a product into itself." };
    }

    const result = await prisma.$transaction(async (tx) => {
      const [sources, target] = await Promise.all([
        tx.product.findMany({
          where: { id: { in: uniqueSourceIds } },
          include: {
            _count: { select: { receiptItems: true, aliases: true } },
          },
        }),
        tx.product.findUnique({
          where: { id: targetProductId },
        }),
      ]);

      if (!target) {
        throw new Error("Target surviving product not found.");
      }
      if (sources.length === 0) {
        throw new Error("No source duplicate products found.");
      }

      const foundSourceIds = sources.map((s) => s.id);

      // 1. Reassign all ReceiptItems to surviving target product
      const updatedItems = await tx.receiptItem.updateMany({
        where: { productId: { in: foundSourceIds } },
        data: {
          productId: target.id,
          suggestedName: target.displayName,
          suggestedCat: target.category,
          baseUnit: target.baseUnit,
        },
      });

      // 2. Reassign all ProductAliases to surviving target product
      // (storeId, rawAlias) is globally unique across all products, so updateMany safely preserves every alias.
      const updatedAliases = await tx.productAlias.updateMany({
        where: { productId: { in: foundSourceIds } },
        data: { productId: target.id },
      });

      // 3. Preserve staple status and backfill missing nutrition/EAN metadata onto survivor
      const targetUpdate: Prisma.ProductUpdateInput = {};
      if (!target.isStaple && sources.some((s) => s.isStaple)) {
        targetUpdate.isStaple = true;
      }
      if (!target.nutriScore) {
        const donor = sources.find((s) => s.nutriScore);
        if (donor?.nutriScore) targetUpdate.nutriScore = donor.nutriScore;
      }
      if (target.novaGroup === null) {
        const donor = sources.find((s) => s.novaGroup !== null);
        if (donor && donor.novaGroup !== null) targetUpdate.novaGroup = donor.novaGroup;
      }
      if (target.proteinPer100g === null) {
        const donor = sources.find((s) => s.proteinPer100g !== null);
        if (donor && donor.proteinPer100g !== null) {
          targetUpdate.proteinPer100g = donor.proteinPer100g;
        }
      }
      if (target.kcalPer100g === null) {
        const donor = sources.find((s) => s.kcalPer100g !== null);
        if (donor && donor.kcalPer100g !== null) {
          targetUpdate.kcalPer100g = donor.kcalPer100g;
        }
      }
      if (!target.ean) {
        const donor = sources.find((s) => s.ean);
        if (donor?.ean) targetUpdate.ean = donor.ean;
      }
      if (!target.nutritionUpdatedAt) {
        const donor = sources.find((s) => s.nutritionUpdatedAt);
        if (donor?.nutritionUpdatedAt) {
          targetUpdate.nutritionUpdatedAt = donor.nutritionUpdatedAt;
          targetUpdate.nutritionSource = donor.nutritionSource || "openfoodfacts";
        }
      }

      if (Object.keys(targetUpdate).length > 0) {
        await tx.product.update({
          where: { id: target.id },
          data: targetUpdate,
        });
      }

      // 4. Delete duplicate source products
      await tx.product.deleteMany({
        where: { id: { in: foundSourceIds } },
      });

      return {
        targetSlug: target.slug,
        targetName: target.displayName,
        sourceNames: sources.map((s) => s.displayName),
        movedSightingsCount: updatedItems.count,
        movedAliasesCount: updatedAliases.count,
        mergedCount: sources.length,
      };
    });

    revalidatePath("/admin/products");
    revalidatePath(`/products/${result.targetSlug}`);
    revalidatePath("/products");
    revalidatePath("/compare");
    revalidatePath("/stores");
    revalidatePath("/my-stats");
    revalidatePath("/");

    const summaryText =
      result.mergedCount === 1
        ? `Merged "${result.sourceNames[0]}" into "${result.targetName}" (${result.movedSightingsCount} sightings, ${result.movedAliasesCount} aliases unified).`
        : `Merged ${result.mergedCount} duplicates into "${result.targetName}" (${result.movedSightingsCount} sightings, ${result.movedAliasesCount} aliases unified).`;

    return {
      success: true,
      movedSightingsCount: result.movedSightingsCount,
      movedAliasesCount: result.movedAliasesCount,
      mergedCount: result.mergedCount,
      message: summaryText,
    };
  } catch (err: unknown) {
    console.error("[mergeProductsBatchAction] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to merge products.",
    };
  }
}

export async function mergeProductsAction(
  sourceProductId: string,
  targetProductId: string
) {
  return mergeProductsBatchAction([sourceProductId], targetProductId);
}

export async function deleteProductAction(productId: string) {
  try {
    await requireAdminUser();

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { _count: { select: { receiptItems: true } } },
    });

    if (!product) {
      return { success: false, error: "Product not found." };
    }

    if (product._count.receiptItems > 0) {
      return {
        success: false,
        error: `Cannot delete product with ${product._count.receiptItems} active sightings. Use "Merge Products" to reassign sightings instead.`,
      };
    }

    await prisma.product.delete({
      where: { id: productId },
    });

    revalidatePath("/admin/products");
    revalidatePath("/products");
    revalidatePath("/compare");
    revalidatePath("/");

    return { success: true };
  } catch (err: unknown) {
    console.error("[deleteProductAction] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete product.",
    };
  }
}

/**
 * Automatically heals legacy unit mismatches and tags standard household staples.
 */
export async function autoHealLegacyProductsAction() {
  try {
    await requireAdminUser();

    const products = await prisma.product.findMany({
      include: { receiptItems: true },
    });

    let healedUnitsCount = 0;
    let healedCategoriesCount = 0;
    let taggedStaplesCount = 0;

    const STAPLE_PATTERNS = [
      /leche/i,
      /aceite de oliva/i,
      /huevos/i,
      /platano/i,
      /pechuga de pollo/i,
      /arroz/i,
      /tomate/i,
      /pan /i,
      /barra de pan/i,
      /patata/i,
      /pasta/i,
      /macarron/i,
      /espagueti/i,
      /yogur/i,
      /manzana/i,
      /cebolla/i,
      /atun/i,
      /agua mineral/i,
    ];

    for (const p of products) {
      let newBaseUnit = p.baseUnit;
      let newCategory = p.category;
      let newIsStaple = p.isStaple;

      const normName = p.displayName.toLowerCase();

      // 1. Category Heuristics
      if (/tomate/i.test(normName) && p.category === "Pantry" && !/frito|triturado|salsa/i.test(normName)) {
        newCategory = "Fruits & Vegetables";
        healedCategoriesCount++;
      } else if (/platano|manzana|zanahoria|cebolla|patata|champinon|calabacin|aguacate/i.test(normName) && p.category === "Pantry") {
        newCategory = "Fruits & Vegetables";
        healedCategoriesCount++;
      }

      // 2. Unit Heuristics
      if (
        (newCategory === "Meat & Poultry" || newCategory === "Fish & Seafood") &&
        newBaseUnit === "UNIT" &&
        !/pack|ud|salchichas/i.test(normName)
      ) {
        newBaseUnit = "KG";
        healedUnitsCount++;
      } else if (
        newCategory === "Fruits & Vegetables" &&
        newBaseUnit === "UNIT" &&
        !/ensalada|bolsa|pack/i.test(normName) &&
        /batata|champinon|tomate|patata|manzana|naranja/i.test(normName)
      ) {
        newBaseUnit = "KG";
        healedUnitsCount++;
      } else if (
        (newCategory === "Beverages" || newCategory === "Oils & Condiments") &&
        newBaseUnit === "UNIT" &&
        /zumo|leche|agua|aceite|vino|cerveza|refresco/i.test(normName)
      ) {
        newBaseUnit = "L";
        healedUnitsCount++;
      }

      // 3. Staple Identification
      const isCandidateStaple = STAPLE_PATTERNS.some((pattern) => pattern.test(normName));
      if (isCandidateStaple && !p.isStaple) {
        newIsStaple = true;
        taggedStaplesCount++;
      }

      // Apply updates if any field changed
      if (
        newBaseUnit !== p.baseUnit ||
        newCategory !== p.category ||
        newIsStaple !== p.isStaple
      ) {
        await prisma.product.update({
          where: { id: p.id },
          data: {
            baseUnit: newBaseUnit,
            category: newCategory,
            isStaple: newIsStaple,
          },
        });

        if (newBaseUnit !== p.baseUnit) {
          await prisma.receiptItem.updateMany({
            where: { productId: p.id },
            data: { baseUnit: newBaseUnit },
          });
        }
      }
    }

    revalidatePath("/admin/products");
    revalidatePath("/products");
    revalidatePath("/compare");
    revalidatePath("/stores");
    revalidatePath("/");

    return {
      success: true,
      message: `Catalogue healed successfully: ${healedUnitsCount} units corrected, ${healedCategoriesCount} categories fixed, and ${taggedStaplesCount} household staples flagged!`,
    };
  } catch (err: unknown) {
    console.error("[autoHealLegacyProductsAction] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to run catalogue healer.",
    };
  }
}
