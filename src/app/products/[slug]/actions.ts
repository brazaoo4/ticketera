"use server";

import { requireAuthUser, requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeBarcode } from "@/lib/catalog/parser";
import {
  lookupOpenFoodFactsByBarcode,
  searchOpenFoodFacts,
} from "@/lib/catalog/openfoodfacts";

export async function deleteSightingAction(receiptItemId: string, productSlug: string) {
  try {
    const user = await requireAuthUser();

    const item = await prisma.receiptItem.findUnique({
      where: { id: receiptItemId },
      include: { receipt: true },
    });

    if (!item) {
      return { success: false, error: "Observation not found." };
    }

    // Only allow item deletion if admin or receipt owner
    const isAdmin = user.role === "ADMIN";
    const isOwner = item.receipt.userId === user.id;
    if (!isAdmin && !isOwner) {
      return { success: false, error: "You do not have permission to delete this sighting." };
    }

    // Exclude the item so it immediately drops out of price history and charts
    await prisma.receiptItem.update({
      where: { id: receiptItemId },
      data: {
        excluded: true,
      },
    });

    // Prune orphaned products with 0 confirmed receipt items
    if (item.productId) {
      const activeCount = await prisma.receiptItem.count({
        where: {
          productId: item.productId,
          confirmed: true,
          excluded: false,
          receipt: { status: "CONFIRMED" },
        },
      });
      if (activeCount === 0) {
        await prisma.product.delete({
          where: { id: item.productId },
        }).catch(() => null);
      }
    }

    // Revalidate affected routes
    revalidatePath(`/products/${productSlug}`);
    revalidatePath("/products");
    revalidatePath("/compare");
    revalidatePath("/stores");
    revalidatePath("/");

    return { success: true };
  } catch (err: unknown) {
    console.error("[deleteSightingAction] Error deleting sighting:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to remove observation.",
    };
  }
}

export async function updateProductDetailsAction(
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

    const existing = await prisma.product.findUnique({
      where: { id: productId },
      include: { receiptItems: true },
    });

    if (!existing) {
      return { success: false, error: "Product not found." };
    }

    const cleanName = data.displayName.trim();
    if (!cleanName) {
      return { success: false, error: "Product name cannot be empty." };
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

      // If baseUnit changed, update all linked ReceiptItems
      if (baseUnitChanged) {
        await tx.receiptItem.updateMany({
          where: { productId },
          data: {
            baseUnit: data.baseUnit,
          },
        });
      }
    });

    revalidatePath(`/products/${existing.slug}`);
    revalidatePath("/products");
    revalidatePath("/compare");
    revalidatePath("/stores");
    revalidatePath("/my-stats");
    revalidatePath("/admin/products");
    revalidatePath("/");

    return { success: true };
  } catch (err: unknown) {
    console.error("[updateProductDetailsAction] Error updating product:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update product.",
    };
  }
}

export async function fetchAndCacheProductNutritionAction(
  productId: string,
  barcodeOrQuery?: string
) {
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return { success: false, error: "Unauthorized" };
  }

  const rateResult = await checkRateLimit({
    key: `nutrition-single:${user.id}`,
    limit: 30,
    windowSeconds: 60,
  });
  if (!rateResult.success) {
    return {
      success: false,
      error: `Too many OpenFoodFacts requests. Retry in ${rateResult.resetSeconds}s.`,
    };
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        slug: true,
        displayName: true,
        ean: true,
      },
    });

    if (!product) {
      return { success: false, error: "Product not found." };
    }

    const inputTrimmed = barcodeOrQuery?.trim() || "";
    const parsedBarcode = normalizeBarcode(inputTrimmed || product.ean);

    let match = parsedBarcode
      ? await lookupOpenFoodFactsByBarcode(parsedBarcode)
      : null;

    if (!match) {
      const queryTerm =
        inputTrimmed && !parsedBarcode ? inputTrimmed : product.displayName;
      const matches = await searchOpenFoodFacts({
        query: queryTerm,
        requireQuantity: false,
      });
      match =
        matches.find(
          (m) =>
            m.nutrition &&
            (m.nutrition.nutriScore !== null ||
              m.nutrition.novaGroup !== null ||
              m.nutrition.proteinPer100g !== null ||
              m.nutrition.kcalPer100g !== null)
        ) ||
        matches[0] ||
        null;
    }

    const nutrition = match?.nutrition ?? null;
    const resolvedEan = nutrition?.ean || match?.ean || parsedBarcode || product.ean;

    if (!nutrition && !resolvedEan) {
      await prisma.product.update({
        where: { id: product.id },
        data: { nutritionUpdatedAt: new Date() },
      });
      return {
        success: true,
        found: false,
        nutrition: null,
        matchName: null,
      };
    }

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: {
        nutriScore: nutrition?.nutriScore ?? undefined,
        novaGroup: nutrition?.novaGroup ?? undefined,
        proteinPer100g:
          nutrition?.proteinPer100g !== null && nutrition?.proteinPer100g !== undefined
            ? new Prisma.Decimal(nutrition.proteinPer100g)
            : undefined,
        kcalPer100g:
          nutrition?.kcalPer100g !== null && nutrition?.kcalPer100g !== undefined
            ? new Prisma.Decimal(nutrition.kcalPer100g)
            : undefined,
        ean: resolvedEan ?? undefined,
        nutritionSource: "openfoodfacts",
        nutritionUpdatedAt: new Date(),
      },
      select: {
        nutriScore: true,
        novaGroup: true,
        proteinPer100g: true,
        kcalPer100g: true,
        ean: true,
        nutritionSource: true,
        nutritionUpdatedAt: true,
      },
    });

    revalidatePath(`/products/${product.slug}`);
    revalidatePath("/products");
    revalidatePath("/my-stats");
    revalidatePath("/admin/products");

    return {
      success: true,
      found: Boolean(
        updated.nutriScore ||
          updated.novaGroup ||
          updated.proteinPer100g !== null ||
          updated.kcalPer100g !== null
      ),
      matchName: match?.productName || null,
      nutrition: {
        nutriScore: updated.nutriScore,
        novaGroup: updated.novaGroup,
        proteinPer100g:
          updated.proteinPer100g !== null ? Number(updated.proteinPer100g) : null,
        kcalPer100g:
          updated.kcalPer100g !== null ? Number(updated.kcalPer100g) : null,
        ean: updated.ean,
        nutritionSource: updated.nutritionSource,
        nutritionUpdatedAt: updated.nutritionUpdatedAt?.toISOString() ?? null,
      },
    };
  } catch (err) {
    console.error("[fetchAndCacheProductNutritionAction] Error:", err);
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to fetch product nutrition from OpenFoodFacts.",
    };
  }
}

export async function normalizeProductHistoryAction(
  productId: string,
  data: {
    baseUnit: "KG" | "L" | "UNIT";
    aliases: Array<{
      aliasId: string;
      unitMeasurePerPack: number | null;
      isVariableWeight: boolean;
    }>;
  }
) {
  try {
    await requireAdminUser();

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        aliases: true,
        receiptItems: {
          include: {
            receipt: true,
          },
        },
      },
    });

    if (!product) {
      return { success: false, error: "Product not found." };
    }

    await prisma.$transaction(async (tx) => {
      // 1. Update product baseUnit
      await tx.product.update({
        where: { id: productId },
        data: { baseUnit: data.baseUnit },
      });

      // 2. Update each ProductAlias
      for (const a of data.aliases) {
        await tx.productAlias.update({
          where: { id: a.aliasId },
          data: {
            unitMeasurePerPack: a.isVariableWeight || a.unitMeasurePerPack === null
              ? null
              : new Prisma.Decimal(a.unitMeasurePerPack),
            isVariableWeight: a.isVariableWeight,
          },
        });
      }

      // Re-fetch all updated aliases for fast (storeId, rawAlias) lookup
      const updatedAliases = await tx.productAlias.findMany({
        where: { productId },
      });
      const storeAliasLookup = new Map<string, { unitMeasurePerPack: number | null; isVariableWeight: boolean }>();
      for (const ua of updatedAliases) {
        storeAliasLookup.set(
          `${ua.storeId}__${ua.rawAlias.trim().toUpperCase()}`,
          {
            unitMeasurePerPack: ua.unitMeasurePerPack !== null ? Number(ua.unitMeasurePerPack) : null,
            isVariableWeight: !!ua.isVariableWeight,
          }
        );
      }

      // 3. Recalculate all linked ReceiptItems
      for (const item of product.receiptItems) {
        const key = `${item.receipt.storeId}__${item.rawName.trim().toUpperCase()}`;
        const format = storeAliasLookup.get(key);

        let newUnitMeasure = Number(item.unitMeasure);
        const qty = Math.max(Number(item.quantity) || 1, 1);

        if (format && format.unitMeasurePerPack !== null && !format.isVariableWeight) {
          newUnitMeasure = Number((qty * format.unitMeasurePerPack).toFixed(3));
        }

        const totalPriceNum = Number(item.totalPrice);
        const newPricePerBase =
          newUnitMeasure > 0 && totalPriceNum > 0 && !item.isDiscount
            ? Number((totalPriceNum / newUnitMeasure).toFixed(2))
            : 0;

        await tx.receiptItem.update({
          where: { id: item.id },
          data: {
            baseUnit: data.baseUnit,
            unitMeasure: new Prisma.Decimal(newUnitMeasure),
            pricePerBaseUnit: new Prisma.Decimal(newPricePerBase),
          },
        });
      }
    });

    revalidatePath(`/products/${product.slug}`);
    revalidatePath("/products");
    revalidatePath("/compare");
    revalidatePath("/stores");
    revalidatePath("/my-stats");
    revalidatePath("/");

    return { success: true };
  } catch (err: unknown) {
    console.error("[normalizeProductHistoryAction] Error normalizing history:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to normalize product history.",
    };
  }
}

export async function updateSightingAction(
  receiptItemId: string,
  productSlug: string,
  data: {
    unitPrice: number;
    quantity: number;
    unitMeasure: number;
    rawName?: string;
    purchaseDate?: string;
  }
) {
  try {
    const user = await requireAuthUser();

    const item = await prisma.receiptItem.findUnique({
      where: { id: receiptItemId },
      include: { receipt: true },
    });

    if (!item) {
      return { success: false, error: "Observation not found." };
    }

    // Only allow item editing if admin or receipt owner
    const isAdmin = user.role === "ADMIN";
    const isOwner = item.receipt.userId === user.id;
    if (!isAdmin && !isOwner) {
      return { success: false, error: "You do not have permission to edit this sighting." };
    }

    const unitPrice = Math.max(0, Number(data.unitPrice) || 0);
    const quantity = Math.max(0.001, Number(data.quantity) || 1);
    const unitMeasure = Math.max(0.001, Number(data.unitMeasure) || 1);
    const totalPrice = Number((unitPrice * quantity).toFixed(2));
    const pricePerBaseUnit = Number((totalPrice / unitMeasure).toFixed(2));
    const rawName = data.rawName?.trim();

    await prisma.$transaction(async (tx) => {
      await tx.receiptItem.update({
        where: { id: receiptItemId },
        data: {
          unitPrice: new Prisma.Decimal(unitPrice),
          quantity: new Prisma.Decimal(quantity),
          totalPrice: new Prisma.Decimal(totalPrice),
          unitMeasure: new Prisma.Decimal(unitMeasure),
          pricePerBaseUnit: new Prisma.Decimal(pricePerBaseUnit),
          ...(rawName ? { rawName } : {}),
        },
      });

      if (data.purchaseDate) {
        const parsedDate = new Date(data.purchaseDate);
        const maxFuture = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const minPast = new Date("2000-01-01T00:00:00Z");
        if (
          !isNaN(parsedDate.getTime()) &&
          parsedDate <= maxFuture &&
          parsedDate >= minPast
        ) {
          await tx.receipt.update({
            where: { id: item.receiptId },
            data: { purchaseDate: parsedDate },
          });
        }
      }
    });

    revalidatePath(`/products/${productSlug}`);
    revalidatePath("/products");
    revalidatePath("/compare");
    revalidatePath("/stores");
    revalidatePath("/my-stats");
    revalidatePath("/");

    return {
      success: true,
      updated: {
        id: receiptItemId,
        unitPrice,
        quantity,
        totalPrice,
        unitMeasure,
        pricePerBaseUnit,
        rawName: rawName || item.rawName,
        purchaseDate: data.purchaseDate
          ? new Date(data.purchaseDate).toISOString()
          : item.receipt.purchaseDate.toISOString(),
      },
    };
  } catch (err: unknown) {
    console.error("[updateSightingAction] Error updating sighting:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update observation.",
    };
  }
}



