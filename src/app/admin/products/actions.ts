"use server";

import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

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

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: {
          displayName: cleanName,
          category: data.category,
          baseUnit: data.baseUnit,
          isStaple: data.isStaple,
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

export async function mergeProductsAction(
  sourceProductId: string,
  targetProductId: string
) {
  try {
    await requireAdminUser();

    if (sourceProductId === targetProductId) {
      return { success: false, error: "Cannot merge a product into itself." };
    }

    const [source, target] = await Promise.all([
      prisma.product.findUnique({
        where: { id: sourceProductId },
        include: { aliases: true, receiptItems: true },
      }),
      prisma.product.findUnique({
        where: { id: targetProductId },
        include: { aliases: true },
      }),
    ]);

    if (!source) return { success: false, error: "Source product not found." };
    if (!target) return { success: false, error: "Target product not found." };

    await prisma.$transaction(async (tx) => {
      // 1. Reassign all ReceiptItems to target product
      await tx.receiptItem.updateMany({
        where: { productId: source.id },
        data: {
          productId: target.id,
          suggestedName: target.displayName,
          suggestedCat: target.category,
          baseUnit: target.baseUnit,
        },
      });

      // 2. Reassign ProductAliases safely
      for (const alias of source.aliases) {
        const existingTargetAlias = await tx.productAlias.findUnique({
          where: {
            storeId_rawAlias: {
              storeId: alias.storeId,
              rawAlias: alias.rawAlias,
            },
          },
        });

        if (existingTargetAlias) {
          // Alias already mapped for target store; delete source alias row
          await tx.productAlias.delete({
            where: { id: alias.id },
          });
        } else {
          // Reassign alias to target product
          await tx.productAlias.update({
            where: { id: alias.id },
            data: { productId: target.id },
          });
        }
      }

      // 3. Delete source product
      await tx.product.delete({
        where: { id: source.id },
      });
    });

    revalidatePath("/admin/products");
    revalidatePath(`/products/${target.slug}`);
    revalidatePath("/products");
    revalidatePath("/compare");
    revalidatePath("/stores");
    revalidatePath("/");

    return {
      success: true,
      message: `Successfully merged "${source.displayName}" into "${target.displayName}".`,
    };
  } catch (err: unknown) {
    console.error("[mergeProductsAction] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to merge products.",
    };
  }
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
