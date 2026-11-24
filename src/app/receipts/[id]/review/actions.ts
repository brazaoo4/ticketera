"use server";

import { requireAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";
import { compressReceiptImage, UPLOAD_DIR } from "@/lib/receipts/preprocess";
import {
  hasConfiguredAiProvider,
  normalizeCanonicalCategory,
  resolvePosItemsWithAI,
  type RawPosItemInput,
} from "@/lib/ai/resolve-items";
import {
  computePackUnitAndPrice,
  matchProductInCatalog,
} from "@/lib/integrations/dia/importer";
import type { DiaTicketDetailResponse } from "@/lib/integrations/dia/types";

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

export interface EnrichedItemPatch {
  id: string;
  suggestedName: string;
  suggestedCat: string | null;
  matchConfidence: number;
  productId: string | null;
  baseUnit: "KG" | "L" | "UNIT";
  unitMeasure: number;
  pricePerBaseUnit: number;
  excluded: boolean;
  product?: {
    id: string;
    displayName: string;
    category: string;
    baseUnit: "KG" | "L" | "UNIT";
    isStaple: boolean;
  } | null;
}

async function loadDiaJsonItemHints(
  receiptId: string
): Promise<
  Map<string, Array<{ discountHints: string[]; isVariableWeight: boolean; weight: number }>>
> {
  const hintsByRawName = new Map<
    string,
    Array<{ discountHints: string[]; isVariableWeight: boolean; weight: number }>
  >();
  const diaJsonPath = path.join(UPLOAD_DIR, `${receiptId}.json`);
  if (!fs.existsSync(diaJsonPath)) return hintsByRawName;

  try {
    const parsedJson = JSON.parse(await fs.promises.readFile(diaJsonPath, "utf8")) as {
      detail?: DiaTicketDetailResponse;
    };
    for (const dItem of parsedJson.detail?.corporate?.items || []) {
      if (dItem.cancel) continue;
      const key = dItem.name.trim().toUpperCase();
      const list = hintsByRawName.get(key) || [];
      list.push({
        discountHints: Array.isArray(dItem.discounts)
          ? dItem.discounts.map((d) => d.description || "").filter(Boolean)
          : [],
        isVariableWeight: Boolean(dItem.variable_weight && dItem.weight && dItem.weight > 0),
        weight: Number(dItem.weight || 0),
      });
      hintsByRawName.set(key, list);
    }
  } catch (jsonErr) {
    console.warn(`[EnrichAI] Could not parse DIA JSON hints for ${receiptId}:`, jsonErr);
  }

  return hintsByRawName;
}

export async function enrichReceiptItemsWithAIAction(receiptId: string): Promise<{
  success: boolean;
  error?: string;
  message?: string;
  enrichedCount?: number;
  aiProvider?: string;
  nextReceiptAiProvider?: string | null;
  updatedItems?: EnrichedItemPatch[];
}> {
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return { success: false, error: "Unauthorized" };
  }

  if (!hasConfiguredAiProvider()) {
    return {
      success: false,
      error: "No AI provider API key is configured.",
    };
  }

  try {
    const receipt = await prisma.receipt.findUnique({
      where: { id: receiptId },
      include: {
        store: true,
        items: {
          orderBy: [{ excluded: "asc" }, { matchConfidence: "asc" }, { rawName: "asc" }],
        },
      },
    });

    if (!receipt) {
      return { success: false, error: "Receipt not found." };
    }

    if (user.role !== "ADMIN" && receipt.userId !== user.id) {
      return {
        success: false,
        error: "You do not have permission to edit this receipt.",
      };
    }

    if (receipt.status !== "REVIEW") {
      return {
        success: false,
        error: "Only receipts in REVIEW status can be enriched with AI.",
      };
    }

    const targetItems = receipt.items.filter(
      (i) => !i.excluded && !i.isDiscount && Number(i.matchConfidence) < 1.0
    );

    if (targetItems.length === 0) {
      return {
        success: true,
        enrichedCount: 0,
        message: "All active items are already matched.",
        updatedItems: [],
      };
    }

    const diaHintsByRawName = await loadDiaJsonItemHints(receiptId);

    const hintConsumption = new Map<string, number>();
    const targetInputs: RawPosItemInput[] = targetItems.map((item, idx) => {
      const key = item.rawName.trim().toUpperCase();
      const hintList = diaHintsByRawName.get(key) || [];
      const seenCount = hintConsumption.get(key) || 0;
      hintConsumption.set(key, seenCount + 1);
      const hint = hintList[seenCount] || hintList[0];

      const qty = Number(item.quantity) || 1;
      const measure = Number(item.unitMeasure) || 1;
      const inferredVarWeight = Boolean(
        item.baseUnit === "KG" &&
          qty === 1 &&
          measure > 0 &&
          Math.abs(measure * 20 - Math.round(measure * 20)) > 0.005
      );

      return {
        index: idx,
        rawName: item.rawName,
        quantity: qty,
        unitPrice: Number(item.unitPrice) || 0,
        totalPrice: Number(item.totalPrice) || 0,
        isVariableWeight: hint ? hint.isVariableWeight : inferredVarWeight,
        weight: hint ? hint.weight : inferredVarWeight ? measure : 0,
        discountHints: hint ? hint.discountHints : [],
      };
    });

    const catalogProducts = await prisma.product.findMany({
      select: { displayName: true, category: true, baseUnit: true },
      orderBy: { displayName: "asc" },
      take: 400,
    });

    const aiRes = await resolvePosItemsWithAI({
      storeName: receipt.store.name,
      items: targetInputs,
      catalogProducts: catalogProducts.map((p) => ({
        displayName: p.displayName,
        category: p.category,
        baseUnit: p.baseUnit as "KG" | "L" | "UNIT",
      })),
    });

    const aiByIndex = new Map(aiRes.items.map((x) => [x.index, x]));
    const updatedItems: EnrichedItemPatch[] = [];
    const dbOps: Array<{
      id: string;
      data: Prisma.ReceiptItemUpdateInput;
    }> = [];

    for (let idx = 0; idx < targetItems.length; idx++) {
      const item = targetItems[idx];
      const aiItem = aiByIndex.get(idx);
      if (!aiItem) continue;

      const inputInfo = targetInputs[idx];
      const effectiveIsBag = Boolean(aiItem.is_bag_or_fee);
      const catMatch = !effectiveIsBag
        ? await matchProductInCatalog(aiItem.suggested_name).catch(() => null)
        : null;

      let matchedFullProduct: EnrichedItemPatch["product"] = null;
      if (catMatch) {
        const prod = await prisma.product.findUnique({
          where: { id: catMatch.product.id },
          select: {
            id: true,
            displayName: true,
            category: true,
            baseUnit: true,
            isStaple: true,
          },
        });
        if (prod) {
          matchedFullProduct = {
            id: prod.id,
            displayName: prod.displayName,
            category: prod.category,
            baseUnit: prod.baseUnit as "KG" | "L" | "UNIT",
            isStaple: Boolean(prod.isStaple),
          };
        }
      }

      const suggestedName =
        matchedFullProduct?.displayName || aiItem.suggested_name.trim();
      const suggestedCat =
        matchedFullProduct?.category || normalizeCanonicalCategory(aiItem.category);
      const productId = matchedFullProduct?.id ?? item.productId;
      const matchConfidence = catMatch
        ? catMatch.matchConfidence
        : Number(item.matchConfidence);

      let effectiveBaseUnit = item.baseUnit as "KG" | "L" | "UNIT";
      let unitMeasure = Number(item.unitMeasure) || 1;
      let pricePerBaseUnit = Number(item.pricePerBaseUnit) || 0;

      if (!inputInfo.isVariableWeight) {
        const resolved = computePackUnitAndPrice({
          rawName: item.rawName,
          discountHints: inputInfo.discountHints,
          suggestedName,
          category: suggestedCat,
          matchedProductBaseUnit: matchedFullProduct?.baseUnit,
          aiBaseUnit: aiItem.base_unit,
          aiUnitMeasurePerPack: aiItem.unit_measure_per_pack,
          unitPrice: Number(item.unitPrice) || 0,
          totalPrice: Number(item.totalPrice) || 0,
          quantity: Number(item.quantity) || 1,
        });

        effectiveBaseUnit = resolved.baseUnit;
        unitMeasure = resolved.unitMeasure;
        pricePerBaseUnit = resolved.pricePerBaseUnit;
      }

      dbOps.push({
        id: item.id,
        data: {
          suggestedName,
          suggestedCat,
          matchConfidence,
          product: productId ? { connect: { id: productId } } : { disconnect: true },
          baseUnit: effectiveBaseUnit,
          unitMeasure: new Prisma.Decimal(unitMeasure),
          pricePerBaseUnit: new Prisma.Decimal(pricePerBaseUnit),
          excluded: effectiveIsBag ? true : item.excluded,
        },
      });

      updatedItems.push({
        id: item.id,
        suggestedName,
        suggestedCat,
        matchConfidence,
        productId,
        baseUnit: effectiveBaseUnit,
        unitMeasure,
        pricePerBaseUnit,
        excluded: effectiveIsBag ? true : item.excluded,
        product: matchedFullProduct,
      });
    }

    const nextReceiptAiProvider =
      receipt.aiProvider === "dia-pos" || !receipt.aiProvider
        ? `dia-pos+${aiRes.aiProvider}`
        : receipt.aiProvider;

    await prisma.$transaction(async (tx) => {
      for (const op of dbOps) {
        await tx.receiptItem.update({
          where: { id: op.id },
          data: op.data,
        });
      }

      if (nextReceiptAiProvider !== receipt.aiProvider) {
        await tx.receipt.update({
          where: { id: receiptId },
          data: { aiProvider: nextReceiptAiProvider },
        });
      }
    });

    revalidatePath(`/receipts/${receiptId}/review`);
    revalidatePath("/my-receipts");

    return {
      success: true,
      enrichedCount: updatedItems.length,
      aiProvider: aiRes.aiProvider,
      nextReceiptAiProvider,
      updatedItems,
    };
  } catch (error) {
    console.error("[enrichReceiptItemsWithAIAction] Error enriching items:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to resolve item names with AI.",
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
        `${receiptId}.json`,
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
