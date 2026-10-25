import { Worker, Job } from "bullmq";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { getReceiptFilePath, compressReceiptImage } from "@/lib/receipts/preprocess";
import { parseReceiptWithFailover, InvalidReceiptError } from "@/lib/ai/parse-receipt";
import fs from "fs";
import { extractTextFromPdf } from "@/lib/receipts/pdf-extract";
import { Prisma } from "@prisma/client";

export const SPANISH_TO_ENGLISH_CATEGORIES: Record<string, string> = {
  "Lácteos y Huevos": "Dairy & Eggs",
  "Carnicería": "Meat & Poultry",
  "Pescadería": "Fish & Seafood",
  "Fruta y Verdura": "Fruits & Vegetables",
  "Panadería": "Bakery",
  "Despensa": "Pantry",
  "Aceites": "Oils & Condiments",
  "Bebidas": "Beverages",
  "Congelados": "Frozen Foods",
  "Limpieza y Hogar": "Cleaning & Household",
  "Cuidado Personal": "Personal Care",
  "Otros": "Other",
};

export function inferUnitAndMeasureHeuristics({
  rawName,
  suggestedName,
  category,
  aiBaseUnit,
  aiUnitMeasure,
  aiUnitPrice,
  totalPrice,
  quantity,
}: {
  rawName: string;
  suggestedName: string;
  category: string;
  aiBaseUnit?: "KG" | "L" | "UNIT";
  aiUnitMeasure?: number;
  aiUnitPrice?: number;
  totalPrice: number;
  quantity: number;
}): {
  baseUnit: "KG" | "L" | "UNIT";
  unitMeasure: number;
  pricePerBaseUnit: number;
} {
  const combined = `${rawName} ${suggestedName}`.toUpperCase();
  let baseUnit: "KG" | "L" | "UNIT" = aiBaseUnit || "UNIT";
  let measure = aiUnitMeasure && aiUnitMeasure > 0 ? aiUnitMeasure : 1;

  // 1. Category defaults
  if (category === "Meat & Poultry" || category === "Fish & Seafood") {
    baseUnit = "KG";
  } else if (category === "Fruits & Vegetables") {
    if (!/\b(UD|UDS|UNIDAD|PIEZA)\b/i.test(combined)) {
      baseUnit = "KG";
    }
  } else if (
    category === "Oils & Condiments" ||
    /\b(LECHE|AGUA|REFRESCO|ZUMO|VINO|CERVEZA|ACEITE|VINAGRE)\b/i.test(combined)
  ) {
    baseUnit = "L";
  } else if (/\b(ARROZ|LEGUMBRES?|LENTEJAS?|GARBANZOS?|ALUBIAS?|HARINA|AZUCAR)\b/i.test(combined)) {
    baseUnit = "KG";
  }

  // 2. Weight and Pack heuristics in raw and suggested text
  const gMatch = combined.match(/(?:^|\s|\b)(\d{2,4})\s*(?:G|GR|GRAMOS?)(?:\b|$)/i);
  const kgMatch = combined.match(/(?:^|\s|\b)(\d+(?:[.,]\d+)?)\s*(?:KG|KILOS?)(?:\b|$)/i);
  const multiLMatch = combined.match(/(?:^|\s|\b)(\d+)\s*X\s*(\d+(?:[.,]\d+)?)\s*(?:L|LITROS?)(?:\b|$)/i);
  const singleLMatch = combined.match(/(?:^|\s|\b)(\d+(?:[.,]\d+)?)\s*(?:L|LITROS?)(?:\b|$)/i);
  const multiClMatch = combined.match(/(?:^|\s|\b)(\d+)\s*X\s*(\d+)\s*CL\b/i);
  const singleClMatch = combined.match(/(?:^|\s|\b)(\d+)\s*CL\b/i);

  const docenaMatch = /\bDOCENA\b/i.test(combined);
  const packMatch = combined.match(/(?:PACK|P-)\s*(\d+)\b/i);
  const udsMatch = combined.match(/(?:^|\s)(\d+)\s*(?:UDS?|UNIDADES)\b/i);

  if (kgMatch) {
    baseUnit = "KG";
    measure = parseFloat(kgMatch[1].replace(",", "."));
  } else if (gMatch && (baseUnit === "KG" || category === "Meat & Poultry" || category === "Fish & Seafood" || category === "Pantry")) {
    baseUnit = "KG";
    measure = parseInt(gMatch[1], 10) / 1000;
  } else if (multiLMatch) {
    baseUnit = "L";
    measure = parseInt(multiLMatch[1], 10) * parseFloat(multiLMatch[2].replace(",", "."));
  } else if (singleLMatch && baseUnit === "L") {
    measure = parseFloat(singleLMatch[1].replace(",", "."));
  } else if (multiClMatch) {
    baseUnit = "L";
    measure = (parseInt(multiClMatch[1], 10) * parseInt(multiClMatch[2], 10)) / 100;
  } else if (singleClMatch && baseUnit === "L") {
    measure = parseInt(singleClMatch[1], 10) / 100;
  } else if (docenaMatch) {
    baseUnit = "UNIT";
    measure = 12;
  } else if (packMatch && (baseUnit === "UNIT" || !aiBaseUnit)) {
    baseUnit = "UNIT";
    measure = parseInt(packMatch[1], 10);
  } else if (udsMatch && (baseUnit === "UNIT" || !aiBaseUnit)) {
    baseUnit = "UNIT";
    measure = parseInt(udsMatch[1], 10);
  }

  // 3. Price per base unit calculation
  let pricePerBase = 0;
  if (aiUnitPrice && aiUnitPrice > 0 && totalPrice > 0 && aiUnitPrice > totalPrice && baseUnit === "KG") {
    pricePerBase = aiUnitPrice;
    measure = Number((totalPrice / pricePerBase).toFixed(3));
  } else {
    const totalDivisor = (quantity > 0 ? quantity : 1) * (measure > 0 ? measure : 1);
    pricePerBase = totalDivisor > 0 && totalPrice > 0 ? Number((totalPrice / totalDivisor).toFixed(2)) : 0;
  }

  if (isNaN(pricePerBase) || !isFinite(pricePerBase) || pricePerBase < 0) {
    pricePerBase = 0;
  }

  return {
    baseUnit,
    unitMeasure: measure > 0 ? measure : 1,
    pricePerBaseUnit: pricePerBase,
  };
}


export async function processReceiptJob(
  receiptId: string,
  job?: Job<{ receiptId: string }>
): Promise<void> {
  const currentAttempt = (job?.attemptsMade ?? 0) + 1;
  const maxAttempts = job?.opts?.attempts ?? 1;
  console.log(`[Worker] Starting processing for receipt ${receiptId} (attempt ${currentAttempt}/${maxAttempts})...`);

  // Step 1: Update status to PROCESSING
  try {
    await prisma.receipt.update({
      where: { id: receiptId },
      data: { status: "PROCESSING", errorMessage: null },
    });
  } catch (err) {
    console.warn(`[Worker] Could not mark receipt ${receiptId} as PROCESSING:`, err);
  }

  try {
    // Step 2: Fetch receipt from database
    const receipt = await prisma.receipt.findUnique({
      where: { id: receiptId },
      include: { store: true },
    });

    if (!receipt) {
      throw new Error(`Receipt ${receiptId} not found in database`);
    }

    // Step 3: Load file from disk
    const filePath = getReceiptFilePath(receipt.sourceFile);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File ${filePath} not found on disk`);
    }

    const fileBuffer = await fs.promises.readFile(filePath);
    const isPdf = receipt.sourceFile.endsWith(".pdf");
    const mimeType = isPdf ? "application/pdf" : "image/webp";

    let extractedText: string | null = null;
    if (isPdf) {
      try {
        const text = await extractTextFromPdf(fileBuffer);
        if (text && text.length >= 40) {
          extractedText = text;
        }
      } catch (pdfErr) {
        console.warn(`[Worker] PDF text extraction failed for ${receiptId}:`, pdfErr);
      }
    }

    // Step 4: Run AI failover pipeline
    const { result, aiProvider, processingMs } = await parseReceiptWithFailover({
      buffer: fileBuffer,
      mimeType,
      extractedText,
      preferredStore: receipt.store?.name,
    });

    // Step 5: Resolve Store automatically from AI detection
    let effectiveStoreId = receipt.storeId;
    if (result.store) {
      try {
        const rawStore = result.store.trim().toLowerCase();
        let targetSlug = rawStore.replace(/[^a-z0-9]/g, "-");
        if (rawStore.includes("mercadona") || rawStore.includes("hacendado") || rawStore.includes("deliplus")) targetSlug = "mercadona";
        else if (rawStore.includes("lidl") || rawStore.includes("milbona") || rawStore.includes("cien")) targetSlug = "lidl";
        else if (rawStore.includes("carrefour")) targetSlug = "carrefour";
        else if (rawStore.includes("alcampo") || rawStore.includes("auchan")) targetSlug = "alcampo";
        else if (rawStore.includes("consum")) targetSlug = "consum";
        else if (rawStore.includes("dia")) targetSlug = "dia";
        else if (rawStore.includes("aldi") || rawStore.includes("gutbio")) targetSlug = "aldi";
        else if (rawStore.includes("cash fresh") || rawStore.includes("cashfresh")) targetSlug = "cash-fresh";
        else if (rawStore.includes("mas")) targetSlug = "mas";

        let matchedStore = await prisma.store.findFirst({
          where: {
            OR: [
              { slug: targetSlug },
              { name: { equals: result.store, mode: "insensitive" } },
              { name: { contains: rawStore, mode: "insensitive" } },
            ],
          },
        });
        if (!matchedStore) {
          const allStores = await prisma.store.findMany();
          matchedStore = allStores.find((s) => {
            const sName = s.name.toLowerCase();
            const sSlug = s.slug.toLowerCase();
            return rawStore.includes(sName) || rawStore.includes(sSlug) || sName.includes(rawStore);
          }) || null;
        }
        if (matchedStore) {
          effectiveStoreId = matchedStore.id;
          console.log(`[Worker] Auto-resolved store "${result.store}" -> ${matchedStore.name} (${matchedStore.id})`);
        }
      } catch (storeErr) {
        console.warn("[Worker] Store resolution error:", storeErr);
      }
    }

    // Step 6: Resolve Purchase Date & Total
    let purchaseDate = receipt.purchaseDate;
    if (result.date) {
      const trimmed = result.date.trim();
      let parsedDate: Date | null = null;
      if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        const d = new Date(trimmed);
        if (!isNaN(d.getTime())) parsedDate = d;
      }
      if (!parsedDate) {
        const euMatch = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
        if (euMatch) {
          const day = parseInt(euMatch[1], 10);
          const month = parseInt(euMatch[2], 10);
          let year = parseInt(euMatch[3], 10);
          if (year < 100) year += 2000;
          const d = new Date(year, month - 1, day, 12, 0, 0);
          if (!isNaN(d.getTime())) parsedDate = d;
        }
      }
      if (!parsedDate) {
        const fallback = new Date(trimmed);
        if (!isNaN(fallback.getTime())) parsedDate = fallback;
      }

      if (parsedDate) {
        const maxFuture = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const minPast = new Date("2000-01-01T00:00:00Z");
        if (parsedDate <= maxFuture && parsedDate >= minPast) {
          purchaseDate = parsedDate;
          console.log(`[Worker] Auto-resolved historical receipt purchase date: ${purchaseDate.toISOString().slice(0, 10)}`);
        } else {
          console.warn(`[Worker] Rejecting out-of-bounds OCR date: ${parsedDate.toISOString()}. Keeping default.`);
        }
      }
    }

    const totalAmount =
      result.total != null && !isNaN(result.total)
        ? new Prisma.Decimal(result.total)
        : receipt.totalAmount;

    // Step 7: Match items (Deterministic ProductAlias -> pg_trgm fuzzy -> new)
    const itemsToCreate: Prisma.ReceiptItemCreateManyInput[] = [];

    for (const item of result.items) {
      const rawName = item.raw_name.trim().toUpperCase();
      let productId: string | null = null;
      let matchConfidence = 0;
      let matchedAlias: {
        id: string;
        productId: string;
        unitMeasurePerPack: Prisma.Decimal | number | null;
        isVariableWeight: boolean;
        product: { id: string; baseUnit: string; category: string };
      } | null = null;
      let matchedProduct: { id: string; baseUnit: "KG" | "L" | "UNIT"; category: string } | null = null;

      // Check 1: Deterministic exact alias match for this store
      try {
        const alias = await prisma.productAlias.findUnique({
          where: {
            storeId_rawAlias: {
              storeId: effectiveStoreId,
              rawAlias: rawName,
            },
          },
          include: {
            product: {
              select: { id: true, baseUnit: true, category: true },
            },
          },
        });

        if (alias) {
          matchedAlias = {
            id: alias.id,
            productId: alias.productId,
            unitMeasurePerPack: alias.unitMeasurePerPack,
            isVariableWeight: alias.isVariableWeight,
            product: alias.product,
          };
          productId = alias.productId;
          matchConfidence = 1.0;
          matchedProduct = alias.product as { id: string; baseUnit: "KG" | "L" | "UNIT"; category: string };
        }
      } catch (aliasErr) {
        console.warn(`[Worker] Exact alias lookup error for "${rawName}":`, aliasErr);
      }

      // Check 2: Exact displayName match (case-insensitive)
      if (!productId && item.suggested_name) {
        try {
          const exactProd = await prisma.product.findFirst({
            where: {
              displayName: { equals: item.suggested_name.trim(), mode: "insensitive" },
            },
          });
          if (exactProd) {
            productId = exactProd.id;
            matchConfidence = 1.0;
          }
        } catch (exactErr) {
          console.warn(`[Worker] Exact product lookup error for "${item.suggested_name}":`, exactErr);
        }
      }

      // Check 3: pg_trgm similarity search or word containment
      if (!productId && item.suggested_name) {
        try {
          const cleanSug = item.suggested_name.trim();
          const fuzzyMatches = await prisma.$queryRaw<Array<{ id: string; sim: number }>>`
            SELECT id, similarity("displayName", ${cleanSug})::float AS sim
            FROM "Product"
            WHERE similarity("displayName", ${cleanSug}) >= 0.35
            ORDER BY sim DESC
            LIMIT 1
          `;

          if (fuzzyMatches.length > 0 && fuzzyMatches[0].sim >= 0.35) {
            productId = fuzzyMatches[0].id;
            matchConfidence = Number(fuzzyMatches[0].sim.toFixed(2));
          } else {
            // Word containment fallback (e.g. "Plátano" matches "Plátano de Canarias")
            const firstWord = cleanSug.split(" ")[0];
            if (firstWord.length >= 4) {
              const containmentProd = await prisma.product.findFirst({
                where: {
                  displayName: { contains: firstWord, mode: "insensitive" },
                },
              });
              if (containmentProd) {
                productId = containmentProd.id;
                matchConfidence = 0.75;
              }
            }
          }
        } catch {
          // If pg_trgm is offline, fallback to title search
          try {
            const fallbackProd = await prisma.product.findFirst({
              where: {
                displayName: { contains: item.suggested_name, mode: "insensitive" },
              },
            });
            if (fallbackProd) {
              productId = fallbackProd.id;
              matchConfidence = 0.7;
            }
          } catch {
            matchConfidence = 0;
          }
        }
      }

      if (productId && !matchedProduct) {
        try {
          matchedProduct = await prisma.product.findUnique({
            where: { id: productId },
            select: { id: true, baseUnit: true, category: true },
          });
        } catch (prodErr) {
          console.warn(`[Worker] Error fetching matched product ${productId}:`, prodErr);
        }
      }

      const rawCategory = matchedProduct?.category || item.category || "Other";
      const normalizedCategory =
        SPANISH_TO_ENGLISH_CATEGORIES[rawCategory] || rawCategory;

      const inferred = inferUnitAndMeasureHeuristics({
        rawName,
        suggestedName: item.suggested_name || rawName,
        category: normalizedCategory,
        aiBaseUnit: (matchedProduct?.baseUnit as "KG" | "L" | "UNIT") || item.base_unit,
        aiUnitMeasure: item.unit_measure,
        aiUnitPrice: item.unit_price,
        totalPrice: item.total_price,
        quantity: item.quantity,
      });

      // Strict BaseUnit lock: Always force item.baseUnit = matchedProduct.baseUnit when linked
      const effectiveBaseUnit = (matchedProduct?.baseUnit as "KG" | "L" | "UNIT") || inferred.baseUnit;
      let unitMeasure = inferred.unitMeasure;
      let pricePerBase = inferred.pricePerBaseUnit;

      // Automatic Pack-Size Application: If ProductAlias remembers SKU format, apply it directly
      if (
        matchedAlias &&
        matchedAlias.unitMeasurePerPack !== null &&
        !matchedAlias.isVariableWeight
      ) {
        const packMeasure = Number(matchedAlias.unitMeasurePerPack);
        const qty = Number(item.quantity) || 1;
        unitMeasure = Number((qty * packMeasure).toFixed(3));
        const totalPriceNum = Number(item.total_price);
        pricePerBase =
          unitMeasure > 0 && totalPriceNum > 0
            ? Number((totalPriceNum / unitMeasure).toFixed(2))
            : 0;
        if (isNaN(pricePerBase) || !isFinite(pricePerBase) || pricePerBase < 0) {
          pricePerBase = 0;
        }
      }

      const isExcluded = Boolean(item.is_discount || item.is_bag_or_fee);

      itemsToCreate.push({
        receiptId,
        productId,
        rawName,
        suggestedName: item.suggested_name || rawName,
        suggestedCat: normalizedCategory,
        matchConfidence,
        quantity: new Prisma.Decimal(item.quantity || 1),
        unitPrice: new Prisma.Decimal(item.unit_price || item.total_price),
        totalPrice: new Prisma.Decimal(item.total_price),
        baseUnit: effectiveBaseUnit,
        unitMeasure: new Prisma.Decimal(unitMeasure),
        pricePerBaseUnit: new Prisma.Decimal(pricePerBase),
        isDiscount: item.is_discount,
        excluded: isExcluded,
        confirmed: false,
      });
    }

    // Step 7.5: Reject non-receipts or receipts with 0 legible items
    if (itemsToCreate.length === 0 || result.is_valid_receipt === false) {
      const reason =
        result.rejection_reason?.trim() ||
        "No readable products detected in the image or document is not a valid receipt.";
      await prisma.receipt.update({
        where: { id: receiptId },
        data: {
          status: "FAILED",
          errorMessage: reason,
          aiProvider,
          processingMs,
        },
      });
      console.warn(`[Worker] ⚠️ Receipt ${receiptId} marked as FAILED: 0 valid items detected.`);
      return;
    }

    // Step 8: Atomic database transaction
    await prisma.$transaction(async (tx) => {
      // Clear any prior items
      await tx.receiptItem.deleteMany({ where: { receiptId } });

      // Create new items
      if (itemsToCreate.length > 0) {
        await tx.receiptItem.createMany({ data: itemsToCreate });
      }

      let taxBreakdownValue: Prisma.InputJsonValue | undefined = undefined;
      if (Array.isArray(result.tax_breakdown) && result.tax_breakdown.length > 0) {
        taxBreakdownValue = result.tax_breakdown
          .filter((t) => t && typeof t.rate === "number" && !isNaN(t.rate))
          .map((t) => ({
            rate: Number(t.rate),
            baseAmount: Number(t.base_amount) || 0,
            taxAmount: Number(t.tax_amount) || 0,
          })) as unknown as Prisma.InputJsonValue;
      }

      // Update receipt to REVIEW status
      await tx.receipt.update({
        where: { id: receiptId },
        data: {
          status: "REVIEW",
          aiProvider,
          processingMs,
          totalAmount,
          purchaseDate,
          storeId: effectiveStoreId,
          errorMessage: null,
          taxBreakdown: taxBreakdownValue !== undefined ? taxBreakdownValue : Prisma.DbNull,
        },
      });
    });

    // Step 9: Post-process compression to minimize disk space
    await compressReceiptImage(receiptId);

    console.log(
      `[Worker] ✓ Receipt ${receiptId} transitioned to REVIEW (${itemsToCreate.length} items parsed via ${aiProvider} in ${processingMs}ms)`
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // If deterministic non-receipt rejection, fail immediately and do NOT retry in BullMQ
    if (err instanceof InvalidReceiptError) {
      try {
        await prisma.receipt.update({
          where: { id: receiptId },
          data: {
            status: "FAILED",
            errorMessage: err.message,
          },
        });
      } catch (updateErr) {
        console.error(`[Worker] Could not mark receipt ${receiptId} as FAILED:`, updateErr);
      }
      console.warn(`[Worker] 🛑 Deterministic failure for receipt ${receiptId}: ${err.message}`);
      return;
    }

    console.error(`[Worker] ❌ Failed to process receipt ${receiptId}:`, err);

    const maxAttempts = job?.opts?.attempts ?? 1;
    const currentAttempt = (job?.attemptsMade ?? 0) + 1;
    const isFinalAttempt = currentAttempt >= maxAttempts;

    if (isFinalAttempt) {
      try {
        await prisma.receipt.update({
          where: { id: receiptId },
          data: {
            status: "FAILED",
            errorMessage: errorMsg,
          },
        });
      } catch (updateErr) {
        console.error(`[Worker] Could not mark receipt ${receiptId} as FAILED:`, updateErr);
      }
    } else {
      console.log(
        `[Worker] Attempt ${currentAttempt}/${maxAttempts} failed for receipt ${receiptId}. BullMQ will retry...`
      );
    }

    throw err;
  }
}

const globalForWorker = globalThis as unknown as {
  receiptWorker?: Worker;
};

export function initReceiptWorker(): Worker | null {
  if (globalForWorker.receiptWorker) {
    return globalForWorker.receiptWorker;
  }

  try {
    const worker = new Worker(
      "receipt-parse",
      async (job: Job<{ receiptId: string }>) => {
        await processReceiptJob(job.data.receiptId, job);
      },
      {
        connection: redis,
        prefix: "tt",
        concurrency: 2,
      }
    );

    worker.on("completed", (job) => {
      console.log(`[Worker] Job ${job.id} completed successfully`);
    });

    worker.on("failed", (job, err) => {
      console.error(`[Worker] Job ${job?.id} failed with error:`, err);
    });

    worker.on("error", (err) => {
      // Catch redis disconnection gracefully in dev
      console.warn("[Worker] BullMQ worker connection warning (safe in dev):", err.message);
    });

    globalForWorker.receiptWorker = worker;
    console.log("⚡ [Worker] BullMQ receipt-parse worker initialized");
    return worker;
  } catch (err) {
    console.warn("⚠️ [Worker] Could not initialize BullMQ worker (using in-process fallback):", err);
    return null;
  }
}
