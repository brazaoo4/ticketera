"use server";

import { requireAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";
import { compressReceiptImage } from "@/lib/receipts/preprocess";

export interface ReviewItemInput {
  id?: string;
  rawName: string;
  suggestedName: string;
  suggestedCat?: string;
  matchConfidence: number;

  mode: "create_new" | "link_existing";
  productId?: string | null;
  newProductName?: string;
  newProductCategory?: string;
  newProductBaseUnit?: "KG" | "L" | "UNIT";
  newProductIsStaple?: boolean;

  quantity: number;
  unitPrice: number;
  totalPrice: number;
  baseUnit: "KG" | "L" | "UNIT";
  unitMeasure: number;
  pricePerBaseUnit: number;

  isVariableWeight?: boolean;
  isDiscount: boolean;
  excluded: boolean;
}

export interface ConfirmReceiptInput {
  receiptId: string;
  storeId: string;
  purchaseDate: string;
  totalAmount: number;
  items: ReviewItemInput[];
}

function slugify(text: string): string {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-");
}

function normalizeProductSlug(rawText: string): {
  baseSlug: string;
  normalizedSlug: string;
  cleanName: string;
} {
  const cleanName = rawText.trim();
  const cleanNameNormalized = cleanName
    .replace(/\s*\((docena|pack\s*\d+|12ud|\d+ud)\)/i, "")
    .replace(
      /\s+(1l|1\s*l|1kg|1\s*kg|500g|250g|docena|12ud|6ud|pack\s*\d+|clase\s+[m|l|xl]|clase\s+[m|l|xl]\s*\d+ud|igp)$/i,
      ""
    )
    .trim();

  const baseSlug = slugify(cleanName);
  const normalizedSlug = slugify(cleanNameNormalized);

  return { baseSlug, normalizedSlug, cleanName: cleanNameNormalized || cleanName };
}

export async function confirmReceiptAction(input: ConfirmReceiptInput) {
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return { success: false, error: "You must be signed in to confirm receipts." };
  }

  const { receiptId, storeId, purchaseDate, totalAmount, items } = input;

  try {
    const existing = await prisma.receipt.findUnique({
      where: { id: receiptId },
      select: { userId: true },
    });

    if (!existing) {
      return { success: false, error: "Receipt not found." };
    }

    if (user.role !== "ADMIN" && existing.userId !== user.id) {
      return { success: false, error: "You do not have permission to edit this receipt." };
    }

    await prisma.$transaction(
      async (tx) => {
        // 1. Update Receipt details
        await tx.receipt.update({
          where: { id: receiptId },
          data: {
            storeId,
            purchaseDate: new Date(purchaseDate),
            totalAmount: new Prisma.Decimal(totalAmount),
            status: "CONFIRMED",
          },
        });

        // Track submitted existing IDs for deletion of removed lines
        const submittedItemIds: string[] = [];

        // 2. Process all items
        for (const item of items) {
          let resolvedProductId: string | null = null;
          let resolvedBaseUnit: "KG" | "L" | "UNIT" = item.baseUnit || "UNIT";

          if (!item.excluded && !item.isDiscount) {
            if (item.mode === "link_existing" && item.productId) {
              resolvedProductId = item.productId;
              const existingProd = await tx.product.findUnique({
                where: { id: item.productId },
                select: { id: true, baseUnit: true },
              });
              if (existingProd) {
                // Strict BaseUnit Lock: force item to use canonical product baseUnit
                resolvedBaseUnit = existingProd.baseUnit as "KG" | "L" | "UNIT";
              }
            } else {
              // Mode: create_new (or fallback if no product linked)
              const displayName = (
                item.newProductName ||
                item.suggestedName ||
                item.rawName
              ).trim();

              const { baseSlug, normalizedSlug, cleanName } = normalizeProductSlug(displayName);
              const category = item.newProductCategory || item.suggestedCat || "Other";
              const baseUnit = item.newProductBaseUnit || item.baseUnit || "UNIT";
              const isStaple = !!item.newProductIsStaple;

              // Check if a Product with this slug or normalized slug or display name already exists
              let product = await tx.product.findFirst({
                where: {
                  OR: [
                    { slug: baseSlug },
                    { slug: normalizedSlug },
                    { displayName: { equals: cleanName, mode: "insensitive" } },
                    { displayName: { equals: displayName, mode: "insensitive" } },
                  ],
                },
              });

              if (!product) {
                const targetSlug = normalizedSlug || baseSlug || `product-${Date.now()}`;
                product = await tx.product.create({
                  data: {
                    slug: targetSlug,
                    displayName: cleanName || displayName,
                    category,
                    baseUnit,
                    isStaple,
                  },
                });
                resolvedBaseUnit = product.baseUnit as "KG" | "L" | "UNIT";
              } else {
                // Keep baseUnit in sync if customized on new product creation
                const updateData: Prisma.ProductUpdateInput = {};
                if (isStaple && !product.isStaple) updateData.isStaple = true;
                if (baseUnit && product.baseUnit !== baseUnit) updateData.baseUnit = baseUnit;
                if (Object.keys(updateData).length > 0) {
                  await tx.product.update({
                    where: { id: product.id },
                    data: updateData,
                  });
                }
                resolvedBaseUnit = (baseUnit || product.baseUnit) as "KG" | "L" | "UNIT";
              }

              resolvedProductId = product.id;
            }

            // Train ProductAlias with SKU pack-size memory!
            const cleanRawAlias = item.rawName.trim().toUpperCase();
            if (cleanRawAlias && resolvedProductId) {
              const qty = Math.max(Number(item.quantity) || 1, 1);
              const measurePerOne = Number((Number(item.unitMeasure || 1) / qty).toFixed(3));
              const isVariable =
                item.isVariableWeight === true ||
                (resolvedBaseUnit === "KG" &&
                  Number(item.quantity) === 1 &&
                  measurePerOne > 0 &&
                  Math.abs(measurePerOne * 20 - Math.round(measurePerOne * 20)) > 0.005);

              await tx.productAlias.upsert({
                where: {
                  storeId_rawAlias: {
                    storeId,
                    rawAlias: cleanRawAlias,
                  },
                },
                update: {
                  productId: resolvedProductId,
                  unitMeasurePerPack: isVariable ? null : new Prisma.Decimal(measurePerOne),
                  isVariableWeight: isVariable,
                },
                create: {
                  storeId,
                  rawAlias: cleanRawAlias,
                  productId: resolvedProductId,
                  unitMeasurePerPack: isVariable ? null : new Prisma.Decimal(measurePerOne),
                  isVariableWeight: isVariable,
                },
              });
            }
          }

          // 3. Upsert ReceiptItem with strictly locked baseUnit
          const itemData = {
            receiptId,
            productId: resolvedProductId,
            rawName: item.rawName.trim(),
            suggestedName: (item.newProductName || item.suggestedName || item.rawName).trim(),
            suggestedCat: item.newProductCategory || item.suggestedCat || null,
            matchConfidence: resolvedProductId ? 1.0 : item.matchConfidence,
            quantity: new Prisma.Decimal(item.quantity || 1),
            unitPrice: new Prisma.Decimal(item.unitPrice || 0),
            totalPrice: new Prisma.Decimal(item.totalPrice || 0),
            baseUnit: resolvedBaseUnit,
            unitMeasure: new Prisma.Decimal(item.unitMeasure || 1),
            pricePerBaseUnit: new Prisma.Decimal(item.pricePerBaseUnit || 0),
            isDiscount: item.isDiscount,
            excluded: item.excluded,
            confirmed: !item.excluded && !item.isDiscount,
          };

          if (item.id && !item.id.startsWith("manual-")) {
            submittedItemIds.push(item.id);
            await tx.receiptItem.update({
              where: { id: item.id },
              data: itemData,
            });
          } else {
            const created = await tx.receiptItem.create({
              data: itemData,
            });
            submittedItemIds.push(created.id);
          }
        }

        // 4. Delete items that were removed
        await tx.receiptItem.deleteMany({
          where: {
            receiptId,
            id: { notIn: submittedItemIds },
          },
        });
      },
      {
        timeout: 25000,
      }
    );

    // Post-compress receipt image for long-term storage
    await compressReceiptImage(receiptId).catch(() => null);

    // Revalidate paths so catalogue immediately reflects confirmed data
    revalidatePath(`/receipts/${receiptId}/review`);
    revalidatePath("/my-receipts");
    revalidatePath("/products");
    revalidatePath("/stores");
    revalidatePath("/compare");
    revalidatePath("/");

    return {
      success: true,
      confirmedCount: items.filter((i) => !i.excluded && !i.isDiscount).length,
    };
  } catch (error) {
    console.error("[confirmReceiptAction] Error confirming receipt:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to confirm receipt.",
    };
  }
}

export async function reopenReceiptAction(receiptId: string) {
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const existing = await prisma.receipt.findUnique({
      where: { id: receiptId },
      select: { userId: true },
    });

    if (!existing) {
      return { success: false, error: "Receipt not found" };
    }

    if (user.role !== "ADMIN" && existing.userId !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    await prisma.receipt.update({
      where: { id: receiptId },
      data: { status: "REVIEW" },
    });

    revalidatePath(`/receipts/${receiptId}/review`);
    revalidatePath("/my-receipts");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to reopen receipt",
    };
  }
}

export async function deleteReceiptAction(receiptId: string) {
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const existing = await prisma.receipt.findUnique({
      where: { id: receiptId },
      select: { userId: true, sourceFile: true },
    });

    if (!existing) {
      return { success: false, error: "Receipt not found" };
    }

    if (user.role !== "ADMIN" && existing.userId !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Delete database records
    await prisma.receipt.delete({
      where: { id: receiptId },
    });

    // Prune orphaned products with 0 receipt items
    await prisma.product.deleteMany({
      where: {
        receiptItems: { none: {} },
      },
    });

    // Try deleting physical file(s) if stored locally
    try {
      const uploadDir =
        process.env.UPLOAD_DIR ||
        (process.env.NODE_ENV === "production"
          ? "/app/uploads"
          : path.join(process.cwd(), "uploads"));
      const filesToUnlink = new Set<string>([
        `${receiptId}.webp`,
        `${receiptId}.pdf`,
      ]);
      if (existing.sourceFile && existing.sourceFile !== "temp") {
        filesToUnlink.add(path.basename(existing.sourceFile));
      }
      for (const fname of filesToUnlink) {
        const filePath = path.join(uploadDir, fname);
        await fs.promises.unlink(filePath).catch(() => null);
      }
    } catch {
      // Ignore filesystem unlink errors
    }

    revalidatePath("/my-receipts");
    revalidatePath("/products");
    revalidatePath("/stores");
    revalidatePath("/compare");
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete receipt",
    };
  }
}
