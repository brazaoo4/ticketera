import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  SPANISH_TO_ENGLISH_CATEGORIES,
  inferUnitAndMeasureHeuristics,
} from "@/lib/queue/receipt-worker";
import { renderDiaTicketToWebp } from "./render-ticket";
import { DiaTicketDetailResponse, DiaTicketSummary } from "./types";

export interface ImportDiaTicketResult {
  receiptId: string;
  externalTicketId: string;
  totalAmount: number;
  itemCount: number;
  isDuplicate: boolean;
  status: "IMPORTED" | "SKIPPED_DUPLICATE";
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => (word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : ""))
    .join(" ");
}

const BAG_OR_FEE_REGEX =
  /\b(BOLSA\s+PL[AÁ]STICO|BOLSA\s+COMPRA|BOLSA\s+\d+%|BOLSA\s+REUTILIZABLE)\b/i;

/**
 * Deterministically classifies Spanish supermarket line items into canonical categories
 * when no existing catalog Product match exists.
 */
export function inferSpanishGroceryCategory(
  rawName: string,
  discountDescriptions: string[] = []
): string {
  const combinedDiscounts = discountDescriptions.join(" ");
  if (/fruta|verdura|hortaliza/i.test(combinedDiscounts)) {
    return "Fruits & Vegetables";
  }

  if (BAG_OR_FEE_REGEX.test(rawName)) {
    return "Other";
  }

  if (
    /\b(POLLO|PECHUGA|CONTRAMUSLO|MUSLO|ALITAS|PAVO|CERDO|CHULETA|LOMO|SOLOMILLO|COSTILLA|SECRETO|PRESA|VACUNO|TERNERA|HAMBURGUESA|CARNE|PICADA|LONGANIZA|CHORIZO|SALCHICH[OÓ]N|FUET|JAM[OÓ]N|BACON|PANCETA|SALCHICHA|MORCILLA|ALB[OÓ]NDIGA)\b/i.test(
      rawName
    )
  ) {
    return "Meat & Poultry";
  }

  if (
    /\b(SALM[OÓ]N|MERLUZA|BACALAO|DORADA|LUBINA|AT[UÚ]N|BONITO|SARDINA|BOQUER[OÓ]N|GAMBA|LANGOSTINO|CALAMAR|SEPIA|PULPO|MEJILL[OÓ]N|ALMEJA|PESCADO|SURIMI|GULAS?)\b/i.test(
      rawName
    )
  ) {
    return "Fish & Seafood";
  }

  if (
    /\b(ENSALAD[A]?|LECHUGA|TOMATE|PIMIENTO|CEBOLLA|AJO|PATATA|ZANAHORIA|CALABAC[IÍ]N|BERENJENA|PEPINO|BR[OÓ]COLI|COLIFLOR|ESPINACA|ACELGA|CHAMPI[ÑN][OÓ]N|SETA|AGUACATE|PL[AÁ]TANO|BANANA|MANZANA|PERA|NARANJA|MANDARINA|LIM[OÓ]N|FRESA|AR[AÁ]NDANO|FRAMBUESA|UVA|MEL[OÓ]N|SAND[IÍ]A|PI[ÑN]A|KIWI|MANGO|MELOCOT[OÓ]N|NECTARINA|CIRUELA|CEREZA)\b/i.test(
      rawName
    )
  ) {
    return "Fruits & Vegetables";
  }

  if (
    /\b(LECHE|YOGUR|KEFIR|QUESO|MOZZARELLA|GOUDA|CHEDDAR|EMMENTAL|MANCHEGO|PARMESANO|BURRATA|NATA|MANTEQUILLA|MARGARINA|HUEVO|DOCENA|CUAJADA|FLAN|NATILLAS)\b/i.test(
      rawName
    )
  ) {
    return "Dairy & Eggs";
  }

  if (
    /\b(PAN\b|BAGUETTE|CHAPATA|HOGAZA|BARRA|BOLLO|CROISSANT|CRUAS[AÁ]N|NAPOLITANA|MAGDALENA|BIZCOCHO|TORTILLA\s+TRIGO|FAJITA|EMPANADA|ROSQUILLA|GALLETA)\b/i.test(
      rawName
    )
  ) {
    return "Bakery";
  }

  if (
    /\b(AGUA|REFRESCO|REFR\b|COLA|COCA[\s-]?COLA|FANTA|AQUARIUS|NESTEA|RED\s*BULL|MONSTER|ENERG[EÉ]TICA|ZUMO|N[EÉ]CTAR|CERVEZAS?|CERV\b|RADLER|TINTO|VINO|CAVA|SIDRA|GINEBRA|RON|WHISKY|LICOR|BATIDO|HORCHATA)\b/i.test(
      rawName
    )
  ) {
    return "Beverages";
  }

  if (
    /\b(ACEITE|OLIVA|GIRASOL|VINAGRE|SALSAS?|MAYONESA|KETCHUP|MOSTAZA|ALIOLI|SOJA|TOMATE\s+FRITO|ESPECIAS?|PIMIENTA|OR[EÉ]GANO|PIMENT[OÓ]N|SAL\b|CANELA)\b/i.test(
      rawName
    )
  ) {
    return "Oils & Condiments";
  }

  if (/\b(CONGELAD[OA]S?|HELADOS?|HIELO)\b/i.test(rawName)) {
    return "Frozen Foods";
  }

  if (
    /\b(DETERGENTE|SUAVIZANTE|LEJ[IÍ]A|LAVAVAJILLAS|LIMPIADOR|MULTIUSOS|FREGASUELOS|BAYETAS?|ESTROPAJOS?|PAPEL\s+HIGI[EÉ]NICO|ROLLO\s+COCINA|SERVILLETAS?|BOLSAS?\s+BASURA|AMBIENTADOR|BLOC\s+WC|WC\b)\b/i.test(
      rawName
    )
  ) {
    return "Cleaning & Household";
  }

  if (
    /\b(CHAMP[UÚ]|GEL\s+BA[ÑN]O|GEL\s+DUCHA|DESODORANTE|PASTA\s+DENTAL|DENT[IÍ]FRICO|COLUTORIO|CEPILLO\s+DENTAL|CREMA|JAB[OÓ]N\s+MANOS|COMPRESAS?|TAMP[OÓ]N|MAQUINILLAS?|AFEITAR|TOALLITAS?)\b/i.test(
      rawName
    )
  ) {
    return "Personal Care";
  }

  if (
    /\b(PASTAS?|MACARR[OÓ]N|MACARRONES|ESPAGUETIS?|H[EÉ]LICES?|TALLAR[IÍ]N|TALLARINES|FIDEOS?|ARROZ|LENTEJAS?|GARBANZOS?|ALUBIAS?|HARINA|AZ[UÚ]CAR|CAF[EÉ]|C[AÁ]PSULAS?|INFUSI[OÓ]N|T[EÉ]\b|CACAO|CHOCOLATES?|GOMINOLAS?|CARAMELOS?|GOLOSINAS?|PATATAS?\s+FRITAS?|SNACKS?|FRUTOS?\s+SECOS?|ALMENDRAS?|NUEZ|NUECES|PISTACHOS?|ANACARDOS?|CACAHUETES?|ACEITUNAS?|ENCURTIDOS?|PEPINILLOS?|CONSERVAS?|CALDOS?|SOPAS?|PIZZAS?|LASA[ÑN]AS?)\b/i.test(
      rawName
    )
  ) {
    return "Pantry";
  }

  return "Other";
}

/**
 * Deterministically imports a Dia POS ticket into Ticketera without using AI tokens.
 * Maps line items, weighed items, discounts, and taxes with high fidelity.
 */
export async function importDiaTicket({
  userId,
  summary,
  detail,
}: {
  userId: string;
  summary: DiaTicketSummary;
  detail: DiaTicketDetailResponse;
}): Promise<ImportDiaTicketResult> {
  const externalTicketId = summary.ticket_unique_code;
  const fileHash = crypto
    .createHash("sha256")
    .update(`dia-ticket:${externalTicketId}`)
    .digest("hex");

  // 1. Deduplication Check
  const existingReceipt = await prisma.receipt.findFirst({
    where: {
      OR: [
        { externalTicketId },
        { fileHash },
      ],
    },
    select: { id: true, totalAmount: true },
  });

  if (existingReceipt) {
    return {
      receiptId: existingReceipt.id,
      externalTicketId,
      totalAmount: Number(existingReceipt.totalAmount),
      itemCount: 0,
      isDuplicate: true,
      status: "SKIPPED_DUPLICATE",
    };
  }

  // 2. Resolve or create DIA Store
  let store = await prisma.store.findFirst({
    where: { name: { equals: "DIA", mode: "insensitive" } },
  });

  if (!store) {
    store = await prisma.store.create({
      data: { name: "DIA", slug: "dia" },
    });
  }

  const effectiveStoreId = store.id;
  const purchaseDate = new Date(
    summary.submitted_date || summary.detail_params?.begin || Date.now()
  );
  const totalAmountNum =
    detail.amount?.total_amount != null
      ? Number(detail.amount.total_amount)
      : Number(summary.total_amount) || 0;

  // 3. Create preliminary Receipt record
  const receipt = await prisma.receipt.create({
    data: {
      userId,
      storeId: effectiveStoreId,
      purchaseDate,
      totalAmount: new Prisma.Decimal(totalAmountNum),
      sourceFile: "temp",
      fileHash,
      externalTicketId,
      status: "PROCESSING",
      aiProvider: "dia-pos",
      processingMs: 0,
    },
  });

  try {
    // 4. Generate SVG & WebP thermal receipt companion for review viewer
    await renderDiaTicketToWebp(receipt.id, summary, detail);

    // 5. Match items and format items for insertion
    const itemsToCreate: Prisma.ReceiptItemCreateManyInput[] = [];
    const corporateItems = detail.corporate?.items || [];
    let itemDiscountsSum = 0;

    for (const item of corporateItems) {
      if (item.cancel) continue;

      const rawName = item.name.trim().toUpperCase();
      const isBagOrFee = BAG_OR_FEE_REGEX.test(rawName);
      let productId: string | null = null;
      let matchConfidence = 0;
      let matchedAlias: {
        id: string;
        productId: string;
        unitMeasurePerPack: Prisma.Decimal | number | null;
        isVariableWeight: boolean;
        product: { id: string; baseUnit: string; category: string; displayName?: string };
      } | null = null;
      let matchedProduct: {
        id: string;
        baseUnit: "KG" | "L" | "UNIT";
        category: string;
        displayName: string;
      } | null = null;

      // Check 1: Deterministic exact alias match for DIA store
      if (!isBagOrFee) {
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
                select: { id: true, baseUnit: true, category: true, displayName: true },
              },
            },
          });

          if (alias) {
            matchedAlias = alias;
            productId = alias.productId;
            matchConfidence = 1.0;
            matchedProduct = alias.product as {
              id: string;
              baseUnit: "KG" | "L" | "UNIT";
              category: string;
              displayName: string;
            };
          }
        } catch (aliasErr) {
          console.warn(`[DiaImporter] Exact alias lookup error for "${rawName}":`, aliasErr);
        }
      }

      // Check 2: Exact displayName match
      if (!productId && !isBagOrFee) {
        try {
          const exactProd = await prisma.product.findFirst({
            where: {
              displayName: { equals: item.name.trim(), mode: "insensitive" },
            },
            select: { id: true, baseUnit: true, category: true, displayName: true },
          });
          if (exactProd) {
            productId = exactProd.id;
            matchConfidence = 1.0;
            matchedProduct = exactProd as {
              id: string;
              baseUnit: "KG" | "L" | "UNIT";
              category: string;
              displayName: string;
            };
          }
        } catch (exactErr) {
          console.warn(`[DiaImporter] Exact product lookup error for "${item.name}":`, exactErr);
        }
      }

      // Check 3: pg_trgm similarity search
      if (!productId && !isBagOrFee) {
        try {
          const cleanName = item.name.trim();
          const fuzzyMatches = await prisma.$queryRaw<Array<{ id: string; sim: number }>>`
            SELECT id, similarity("displayName", ${cleanName})::float AS sim
            FROM "Product"
            WHERE similarity("displayName", ${cleanName}) >= 0.35
            ORDER BY sim DESC
            LIMIT 1
          `;

          if (fuzzyMatches.length > 0 && fuzzyMatches[0].sim >= 0.35) {
            productId = fuzzyMatches[0].id;
            matchConfidence = Number(fuzzyMatches[0].sim.toFixed(2));
            matchedProduct = (await prisma.product.findUnique({
              where: { id: productId },
              select: { id: true, baseUnit: true, category: true, displayName: true },
            })) as {
              id: string;
              baseUnit: "KG" | "L" | "UNIT";
              category: string;
              displayName: string;
            } | null;
          }
        } catch (fuzzyErr) {
          console.warn(`[DiaImporter] pg_trgm similarity search error for "${item.name}":`, fuzzyErr);
        }
      }

      const discountDescs = Array.isArray(item.discounts)
        ? item.discounts.map((d) => d.description || "")
        : [];
      const rawCategory =
        matchedProduct?.category || inferSpanishGroceryCategory(rawName, discountDescs);
      const normalizedCategory =
        SPANISH_TO_ENGLISH_CATEGORIES[rawCategory] || rawCategory;

      const isVariableWeight = Boolean(item.variable_weight && item.weight && item.weight > 0);
      let baseUnit: "KG" | "L" | "UNIT" = isVariableWeight
        ? "KG"
        : (matchedProduct?.baseUnit as "KG" | "L" | "UNIT") || "UNIT";
      let unitMeasure = isVariableWeight ? Number(item.weight) : 1;
      let pricePerBase = isVariableWeight
        ? Number(item.price_per_unit)
        : Number(item.amount);
      const quantity = isVariableWeight ? 1 : Number(item.quantity || 1);
      const unitPrice = isVariableWeight
        ? Number(item.price_per_unit)
        : Number(item.price_per_unit || item.amount);
      const totalPrice = Number(item.amount);

      if (!isVariableWeight) {
        const inferred = inferUnitAndMeasureHeuristics({
          rawName,
          suggestedName: matchedProduct?.displayName || rawName,
          category: normalizedCategory,
          aiBaseUnit: matchedProduct?.baseUnit as "KG" | "L" | "UNIT",
          aiUnitMeasure: undefined,
          aiUnitPrice: unitPrice,
          totalPrice,
          quantity,
        });

        baseUnit = (matchedProduct?.baseUnit as "KG" | "L" | "UNIT") || inferred.baseUnit;
        unitMeasure = inferred.unitMeasure;
        pricePerBase = inferred.pricePerBaseUnit;

        // Auto pack-size from product alias if available
        if (
          matchedAlias &&
          matchedAlias.unitMeasurePerPack !== null &&
          !matchedAlias.isVariableWeight
        ) {
          const packMeasure = Number(matchedAlias.unitMeasurePerPack);
          const qty = Number(quantity) || 1;
          unitMeasure = Number((qty * packMeasure).toFixed(3));
          pricePerBase =
            unitMeasure > 0 && totalPrice > 0
              ? Number((totalPrice / unitMeasure).toFixed(2))
              : 0;
          if (isNaN(pricePerBase) || !isFinite(pricePerBase) || pricePerBase < 0) {
            pricePerBase = 0;
          }
        }
      }

      const suggestedName = matchedProduct?.displayName || toTitleCase(item.name);

      itemsToCreate.push({
        receiptId: receipt.id,
        productId,
        rawName,
        suggestedName,
        suggestedCat: normalizedCategory,
        matchConfidence,
        quantity: new Prisma.Decimal(quantity),
        unitPrice: new Prisma.Decimal(unitPrice),
        totalPrice: new Prisma.Decimal(totalPrice),
        baseUnit,
        unitMeasure: new Prisma.Decimal(unitMeasure),
        pricePerBaseUnit: new Prisma.Decimal(pricePerBase),
        isDiscount: false,
        excluded: isBagOrFee,
        confirmed: false,
      });

      // Item discounts (e.g. Club Dia coupon / 15% Fruta y verdura)
      if (Array.isArray(item.discounts) && item.discounts.length > 0) {
        for (const discount of item.discounts) {
          const discountDesc = discount.description?.trim() || "DESCUENTO";
          const discountAmount = -Math.abs(Number(discount.amount) || 0);
          itemDiscountsSum += discountAmount;
          itemsToCreate.push({
            receiptId: receipt.id,
            productId: null,
            rawName: `${rawName} - ${discountDesc}`.toUpperCase(),
            suggestedName: discountDesc,
            suggestedCat: "Other",
            matchConfidence: 1.0,
            quantity: new Prisma.Decimal(1),
            unitPrice: new Prisma.Decimal(discountAmount),
            totalPrice: new Prisma.Decimal(discountAmount),
            baseUnit: "UNIT",
            unitMeasure: new Prisma.Decimal(1),
            pricePerBaseUnit: new Prisma.Decimal(0),
            isDiscount: true,
            excluded: true,
            confirmed: false,
          });
        }
      }
    }

    // 5b. Reconcile basket-level discounts or employee discounts not attached to individual items
    const reportedTotalDiscounts = -Math.abs(Number(detail.amount?.total_discounts || 0));
    const unaccountedDiscount = Number(
      (reportedTotalDiscounts - itemDiscountsSum).toFixed(2)
    );
    if (unaccountedDiscount <= -0.01) {
      itemsToCreate.push({
        receiptId: receipt.id,
        productId: null,
        rawName: "CUPÓN / DESCUENTO CLUB DIA",
        suggestedName: "Cupón Club Dia",
        suggestedCat: "Other",
        matchConfidence: 1.0,
        quantity: new Prisma.Decimal(1),
        unitPrice: new Prisma.Decimal(unaccountedDiscount),
        totalPrice: new Prisma.Decimal(unaccountedDiscount),
        baseUnit: "UNIT",
        unitMeasure: new Prisma.Decimal(1),
        pricePerBaseUnit: new Prisma.Decimal(0),
        isDiscount: true,
        excluded: true,
        confirmed: false,
      });
    }

    // 5c. Online shipping fee if applicable
    const shippingAmount = Number(detail.amount?.shipping_amount || 0);
    if (shippingAmount >= 0.01) {
      itemsToCreate.push({
        receiptId: receipt.id,
        productId: null,
        rawName: "GASTOS DE ENVÍO ONLINE",
        suggestedName: "Gastos de Envío",
        suggestedCat: "Other",
        matchConfidence: 1.0,
        quantity: new Prisma.Decimal(1),
        unitPrice: new Prisma.Decimal(shippingAmount),
        totalPrice: new Prisma.Decimal(shippingAmount),
        baseUnit: "UNIT",
        unitMeasure: new Prisma.Decimal(1),
        pricePerBaseUnit: new Prisma.Decimal(shippingAmount),
        isDiscount: false,
        excluded: true,
        confirmed: false,
      });
    }

    // 6. Tax Breakdown
    let taxBreakdownValue: Prisma.InputJsonValue | undefined = undefined;
    const taxes = detail.corporate?.taxes || [];
    if (Array.isArray(taxes) && taxes.length > 0) {
      taxBreakdownValue = taxes
        .filter((t) => t && (typeof t.rate === "number" || typeof t.base_amount === "number"))
        .map((t) => ({
          rate: Number(t.rate ?? 0),
          baseAmount: Number(t.base_amount ?? t.base ?? 0),
          taxAmount: Number(t.amount ?? t.quota ?? 0),
        })) as unknown as Prisma.InputJsonValue;
    }

    // 7. Atomic update receipt + items
    await prisma.$transaction(async (tx) => {
      if (itemsToCreate.length > 0) {
        await tx.receiptItem.createMany({ data: itemsToCreate });
      }

      await tx.receipt.update({
        where: { id: receipt.id },
        data: {
          sourceFile: `${receipt.id}.webp`,
          status: "REVIEW",
          errorMessage: null,
          taxBreakdown: taxBreakdownValue !== undefined ? taxBreakdownValue : Prisma.DbNull,
        },
      });
    });

    console.log(
      `[DiaImporter] ✓ Successfully imported Dia ticket ${externalTicketId} (${receipt.id}) with ${itemsToCreate.length} items.`
    );

    return {
      receiptId: receipt.id,
      externalTicketId,
      totalAmount: totalAmountNum,
      itemCount: itemsToCreate.length,
      isDuplicate: false,
      status: "IMPORTED",
    };
  } catch (importErr) {
    const errorMsg = importErr instanceof Error ? importErr.message : String(importErr);
    console.error(`[DiaImporter] ❌ Error importing ticket ${externalTicketId}:`, importErr);
    await prisma.receipt.update({
      where: { id: receipt.id },
      data: {
        status: "FAILED",
        errorMessage: `Dia import error: ${errorMsg}`,
      },
    });
    throw importErr;
  }
}
