import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  SPANISH_TO_ENGLISH_CATEGORIES,
} from "@/lib/queue/receipt-worker";
import { inferUnitAndMeasureHeuristics } from "@/lib/queue/receipt-worker";
import {
  hasConfiguredAiProvider,
  normalizeCanonicalCategory,
  resolvePosItemsWithAI,
  type RawPosItemInput,
  type ResolvedPosItem,
} from "@/lib/ai/resolve-items";
import { CANONICAL_CATEGORIES } from "@/lib/ai/schema";
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

export interface MatchedCatalogProduct {
  id: string;
  baseUnit: "KG" | "L" | "UNIT";
  category: string;
  displayName: string;
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
    /\b(AGUA|REFRESCO|REFR\b|COLA|COCA[\s-]?COLA|FANTA|AQUARIUS|NESTEA|FUZE\s*TEA|ICE\s*TEA|T[EÉ]\s+(?:AL\s+|FR[IÍ]O|LIM[OÓ]N|MELOCOT[OÓ]N|MANGO|MARACUY[AÁ])|RED\s*BULL|MONSTER|ENERG[EÉ]TICA|ZUMO|N[EÉ]CTAR|CERVEZAS?|CERV\b|RADLER|TINTO|VINO|CAVA|SIDRA|GINEBRA|RON|WHISKY|LICOR|BATIDO|HORCHATA)\b/i.test(
      rawName
    )
  ) {
    return "Beverages";
  }

  if (
    /\b(ENSALAD[A]?|LECHUGA|TOMATE|PIMIENTO|CEBOLLA|AJO|PATATA|ZANAHORIA|CALABAC[IÍ]N|BERENJENA|PEPINO|BR[OÓ]COLI|COLIFLOR|ESPINACA|ACELGA|CHAMPI[ÑN][OÓ]N|SETA|AGUACATE|PL[AÁ]TANO|BANANA|MANZANA|PERA|NARANJA|MANDARINA|LIM[OÓ]N|FRESA|AR[AÁ]NDANO|FRAMBUESA|UVA|MEL[OÓ]N|SAND[IÍ]A|PI[ÑN]A|KIWI|MANGO|MELOCOT[OÓ]N|NECTARINA|CIRUELA|CEREZA)\b/i.test(
      rawName
    )
  ) {
    return "Fruits & Vegetables";
  }

  if (
    /\b(LECHE|YOGUR|KEFIR|QUESO|QUESITO|PORCIONES\s+NATU|MOZZARELLA|GOUDA|CHEDDAR|EMMENTAL|MANCHEGO|PARMESANO|BURRATA|NATA|MANTEQUILLA|MARGARINA|HUEVO|DOCENA|CUAJADA|FLAN|NATILLAS)\b/i.test(
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
    /\b(ACEITE|OLIVA|GIRASOL|VINAGRE|SALSAS?|MAYONESA|KETCHUP|MOSTAZA|ALIOLI|SOJA|TOMATE\s+FRITO|ESPECIAS?|PIMIENTA|OR[EÉ]GANO|PIMENT[OÓ]N|CANELA)\b|^SAL\b/i.test(
      rawName
    )
  ) {
    return "Oils & Condiments";
  }

  if (/\b(CONGELAD[OA]S?|HELADOS?|HIELO|MENESTRA)\b/i.test(rawName)) {
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
    /\b(CHAMP[UÚ]|GEL\s+BA[ÑN]O|GEL\s+DUCHA|DESODORANTE|PASTA\s+DENTAL|DENT[IÍ]FRICO|CREM(?:A)?\s+DENT|COLUTORIO|CEPILLO\s+DENTAL|CREMA|JAB[OÓ]N\s+MANOS|COMPRESAS?|TAMP[OÓ]N|MAQUINILLAS?|AFEITAR|TOALLITAS?)\b/i.test(
      rawName
    )
  ) {
    return "Personal Care";
  }

  if (
    /\b(PASTAS?|MACARR[OÓ]N|MACARRONES|ESPAGUETIS?|H[EÉ]LICES?|TALLAR[IÍ]N|TALLARINES|FIDEOS?|ARROZ|LENTEJAS?|GARBANZOS?|ALUBIAS?|HARINA|AZ[UÚ]CAR|CAF[EÉ]|C[AÁ]PSULAS?|INFUSI[OÓ]N|MANZANILLA|TILA|POLEO|T[EÉ]\b|CACAO|CHOCOLATES?|MUESLI|BARRITA|CEREAL(?:ES)?|AVENA|GOMINOLAS?|CARAMELOS?|GOLOSINAS?|PATATAS?\s+FRITAS?|SNACKS?|FRUTOS?\s+SECOS?|ALMENDRAS?|NUEZ|NUECES|PISTACHOS?|ANACARDOS?|CACAHUETES?|ACEITUNAS?|ENCURTIDOS?|PEPINILLOS?|CONSERVAS?|CALDOS?|SOPAS?|PIZZAS?|LASA[ÑN]AS?)\b/i.test(
      rawName
    )
  ) {
    return "Pantry";
  }

  return "Other";
}

/**
 * Matches a candidate product name against the canonical Product table using
 * exact displayName match, pg_trgm similarity, and safe substring fallback.
 */
export async function matchProductInCatalog(
  candidateName: string
): Promise<{ product: MatchedCatalogProduct; matchConfidence: number } | null> {
  const cleanName = candidateName.trim();
  if (!cleanName) return null;

  const exactProd = await prisma.product.findFirst({
    where: {
      displayName: { equals: cleanName, mode: "insensitive" },
    },
    select: { id: true, baseUnit: true, category: true, displayName: true },
  });

  if (exactProd) {
    return {
      product: exactProd as MatchedCatalogProduct,
      matchConfidence: 1.0,
    };
  }

  try {
    const fuzzyMatches = await prisma.$queryRaw<Array<{ id: string; sim: number }>>`
      SELECT id, similarity("displayName", ${cleanName})::float AS sim
      FROM "Product"
      WHERE similarity("displayName", ${cleanName}) >= 0.35
      ORDER BY sim DESC
      LIMIT 1
    `;

    if (fuzzyMatches.length > 0 && fuzzyMatches[0].sim >= 0.35) {
      const matched = await prisma.product.findUnique({
        where: { id: fuzzyMatches[0].id },
        select: { id: true, baseUnit: true, category: true, displayName: true },
      });
      if (matched) {
        return {
          product: matched as MatchedCatalogProduct,
          matchConfidence: Number(Math.min(0.95, fuzzyMatches[0].sim).toFixed(2)),
        };
      }
    }
  } catch {
    if (cleanName.length >= 4) {
      const fallbackProd = await prisma.product.findFirst({
        where: {
          displayName: { contains: cleanName, mode: "insensitive" },
        },
        select: { id: true, baseUnit: true, category: true, displayName: true },
      });
      if (fallbackProd) {
        return {
          product: fallbackProd as MatchedCatalogProduct,
          matchConfidence: 0.7,
        };
      }
    }
  }

  return null;
}

/**
 * Resolves effective baseUnit, total line unitMeasure, and pricePerBaseUnit
 * for non-variable-weight items using catalog locks, AI hints, and heuristics.
 */
export function computePackUnitAndPrice({
  rawName,
  discountHints = [],
  suggestedName,
  category,
  matchedProductBaseUnit,
  aiBaseUnit,
  aiUnitMeasurePerPack,
  unitPrice,
  totalPrice,
  quantity,
}: {
  rawName: string;
  discountHints?: string[];
  suggestedName: string;
  category: string;
  matchedProductBaseUnit?: "KG" | "L" | "UNIT";
  aiBaseUnit?: "KG" | "L" | "UNIT";
  aiUnitMeasurePerPack?: number;
  unitPrice: number;
  totalPrice: number;
  quantity: number;
}): {
  baseUnit: "KG" | "L" | "UNIT";
  unitMeasure: number;
  pricePerBaseUnit: number;
} {
  const inferred = inferUnitAndMeasureHeuristics({
    rawName: [rawName, ...discountHints].join(" "),
    suggestedName,
    category,
    aiBaseUnit: matchedProductBaseUnit || aiBaseUnit,
    aiUnitMeasure: aiUnitMeasurePerPack,
    aiUnitPrice: unitPrice,
    totalPrice,
    quantity,
  });

  const baseUnit = matchedProductBaseUnit || inferred.baseUnit;
  const perPackMeasure = inferred.baseUnit === baseUnit ? inferred.unitMeasure : 1;
  const qty = quantity > 0 ? quantity : 1;
  const unitMeasure = Number(
    (qty * (perPackMeasure > 0 ? perPackMeasure : 1)).toFixed(3)
  );
  let pricePerBaseUnit =
    unitMeasure > 0 && totalPrice > 0
      ? Number((totalPrice / unitMeasure).toFixed(2))
      : 0;
  if (isNaN(pricePerBaseUnit) || !isFinite(pricePerBaseUnit) || pricePerBaseUnit < 0) {
    pricePerBaseUnit = 0;
  }

  return { baseUnit, unitMeasure, pricePerBaseUnit };
}

/**
 * Imports a Dia POS ticket into Ticketera using deterministic POS amounts/weights,
 * trained ProductAlias memory, and catalog-aware AI item name/category resolution
 * for unfamiliar items (with deterministic fallback when AI is unavailable).
 */
export async function importDiaTicket({
  userId,
  summary,
  detail,
  useAI = true,
}: {
  userId: string;
  summary: DiaTicketSummary;
  detail: DiaTicketDetailResponse;
  useAI?: boolean;
}): Promise<ImportDiaTicketResult> {
  const startTime = Date.now();
  const externalTicketId = summary.ticket_unique_code;
  const fileHash = crypto
    .createHash("sha256")
    .update(`dia-ticket:${externalTicketId}`)
    .digest("hex");

  // 1. Deduplication Check
  const existingReceipt = await prisma.receipt.findFirst({
    where: {
      OR: [{ externalTicketId }, { fileHash }],
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

    // 5. Pass 1: Deterministic exact ProductAlias lookup + queue unfamiliar items for AI
    const activeCorporateItems = (detail.corporate?.items || []).filter((i) => !i.cancel);
    const unmatchedForAi: RawPosItemInput[] = [];

    type MatchedAliasRecord = {
      id: string;
      productId: string;
      unitMeasurePerPack: Prisma.Decimal | number | null;
      isVariableWeight: boolean;
      product: MatchedCatalogProduct;
    };

    const pass1Entries: Array<{
      item: (typeof activeCorporateItems)[number];
      rawName: string;
      isBagOrFee: boolean;
      discountDescs: string[];
      productId: string | null;
      matchConfidence: number;
      matchedAlias: MatchedAliasRecord | null;
      matchedProduct: MatchedCatalogProduct | null;
    }> = [];

    for (let idx = 0; idx < activeCorporateItems.length; idx++) {
      const item = activeCorporateItems[idx];
      const rawName = item.name.trim().toUpperCase();
      const isBagOrFee = BAG_OR_FEE_REGEX.test(rawName);
      const discountDescs = Array.isArray(item.discounts)
        ? item.discounts.map((d) => d.description || "").filter(Boolean)
        : [];

      let productId: string | null = null;
      let matchConfidence = 0;
      let matchedAlias: MatchedAliasRecord | null = null;
      let matchedProduct: MatchedCatalogProduct | null = null;

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
            matchedAlias = alias as MatchedAliasRecord;
            productId = alias.productId;
            matchConfidence = 1.0;
            matchedProduct = alias.product as MatchedCatalogProduct;
          }
        } catch (aliasErr) {
          console.warn(`[DiaImporter] Exact alias lookup error for "${rawName}":`, aliasErr);
        }
      }

      if (!matchedAlias && !isBagOrFee) {
        const isVarWeight = Boolean(item.variable_weight && item.weight && item.weight > 0);
        unmatchedForAi.push({
          index: idx,
          rawName,
          quantity: isVarWeight ? 1 : Number(item.quantity || 1),
          unitPrice: Number(item.price_per_unit || item.amount || 0),
          totalPrice: Number(item.amount || 0),
          isVariableWeight: isVarWeight,
          weight: Number(item.weight || 0),
          discountHints: discountDescs,
        });
      }

      pass1Entries.push({
        item,
        rawName,
        isBagOrFee,
        discountDescs,
        productId,
        matchConfidence,
        matchedAlias,
        matchedProduct,
      });
    }

    // 5b. Pass 2: Catalog-aware AI item resolution for unfamiliar items
    let aiByIndex = new Map<number, ResolvedPosItem>();
    let aiUsedProvider: string | null = null;

    if (useAI !== false && unmatchedForAi.length > 0 && hasConfiguredAiProvider()) {
      try {
        const catalogProducts = await prisma.product.findMany({
          select: { displayName: true, category: true, baseUnit: true },
          orderBy: { displayName: "asc" },
          take: 400,
        });

        const aiRes = await resolvePosItemsWithAI({
          storeName: "DIA",
          items: unmatchedForAi,
          catalogProducts: catalogProducts.map((p) => ({
            displayName: p.displayName,
            category: p.category,
            baseUnit: p.baseUnit as "KG" | "L" | "UNIT",
          })),
        });

        aiByIndex = new Map(aiRes.items.map((x) => [x.index, x]));
        if (aiRes.aiProvider && aiRes.aiProvider !== "none") {
          aiUsedProvider = aiRes.aiProvider;
        }
      } catch (aiErr) {
        console.warn(
          `[DiaImporter] AI resolution failed for ${externalTicketId}, falling back to deterministic heuristics:`,
          aiErr instanceof Error ? aiErr.message : aiErr
        );
      }
    }

    // 5c. Pass 3: Match catalog products, apply units/measures, and build ReceiptItems
    const itemsToCreate: Prisma.ReceiptItemCreateManyInput[] = [];
    let itemDiscountsSum = 0;

    for (let idx = 0; idx < pass1Entries.length; idx++) {
      const entry = pass1Entries[idx];
      const { item, rawName, discountDescs, matchedAlias } = entry;
      let { productId, matchConfidence, matchedProduct } = entry;

      const aiItem = !matchedAlias ? aiByIndex.get(idx) : undefined;
      const effectiveIsBag = entry.isBagOrFee || Boolean(aiItem?.is_bag_or_fee);
      const candidateName = (aiItem?.suggested_name || item.name).trim();

      if (!productId && !effectiveIsBag) {
        try {
          const catalogMatch = await matchProductInCatalog(candidateName);
          if (catalogMatch) {
            productId = catalogMatch.product.id;
            matchConfidence = catalogMatch.matchConfidence;
            matchedProduct = catalogMatch.product;
          }
        } catch (matchErr) {
          console.warn(`[DiaImporter] Catalog lookup error for "${candidateName}":`, matchErr);
        }
      }

      const aiCat = aiItem?.category ? normalizeCanonicalCategory(aiItem.category) : null;
      const heuristicCat = inferSpanishGroceryCategory(rawName, discountDescs);
      const rawCategory =
        matchedProduct?.category ||
        (aiCat && (aiCat !== "Other" || heuristicCat === "Other") ? aiCat : heuristicCat);
      const mappedCat = SPANISH_TO_ENGLISH_CATEGORIES[rawCategory] || rawCategory;
      const normalizedCategory = CANONICAL_CATEGORIES.includes(
        mappedCat as (typeof CANONICAL_CATEGORIES)[number]
      )
        ? mappedCat
        : normalizeCanonicalCategory(mappedCat);

      const isVariableWeight = Boolean(item.variable_weight && item.weight && item.weight > 0);
      const quantity = isVariableWeight ? 1 : Number(item.quantity || 1);
      const unitPrice = isVariableWeight
        ? Number(item.price_per_unit)
        : Number(item.price_per_unit || item.amount);
      const totalPrice = Number(item.amount);

      let baseUnit: "KG" | "L" | "UNIT" = isVariableWeight
        ? "KG"
        : (matchedProduct?.baseUnit as "KG" | "L" | "UNIT") || "UNIT";
      let unitMeasure = isVariableWeight ? Number(item.weight) : 1;
      let pricePerBase = isVariableWeight
        ? Number(item.price_per_unit)
        : Number(item.amount);

      if (!isVariableWeight) {
        if (
          matchedAlias &&
          matchedAlias.unitMeasurePerPack !== null &&
          !matchedAlias.isVariableWeight
        ) {
          baseUnit = (matchedProduct?.baseUnit as "KG" | "L" | "UNIT") || "UNIT";
          const packMeasure = Number(matchedAlias.unitMeasurePerPack);
          const qty = quantity > 0 ? quantity : 1;
          unitMeasure = Number((qty * packMeasure).toFixed(3));
          pricePerBase =
            unitMeasure > 0 && totalPrice > 0
              ? Number((totalPrice / unitMeasure).toFixed(2))
              : 0;
        } else {
          const resolved = computePackUnitAndPrice({
            rawName,
            discountHints: discountDescs,
            suggestedName: matchedProduct?.displayName || candidateName,
            category: normalizedCategory,
            matchedProductBaseUnit: matchedProduct?.baseUnit as "KG" | "L" | "UNIT" | undefined,
            aiBaseUnit: aiItem?.base_unit,
            aiUnitMeasurePerPack: aiItem?.unit_measure_per_pack,
            unitPrice,
            totalPrice,
            quantity,
          });

          baseUnit = resolved.baseUnit;
          unitMeasure = resolved.unitMeasure;
          pricePerBase = resolved.pricePerBaseUnit;
        }

        if (isNaN(pricePerBase) || !isFinite(pricePerBase) || pricePerBase < 0) {
          pricePerBase = 0;
        }
      }

      const suggestedName =
        matchedProduct?.displayName ||
        aiItem?.suggested_name?.trim() ||
        toTitleCase(item.name);

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
        excluded: effectiveIsBag,
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

    // 5d. Reconcile basket-level discounts or employee discounts not attached to individual items
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

    // 5e. Online shipping fee if applicable
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

    const processingMs = Math.max(0, Date.now() - startTime);
    const aiProviderLabel = aiUsedProvider ? `dia-pos+${aiUsedProvider}` : "dia-pos";

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
          aiProvider: aiProviderLabel,
          processingMs,
          errorMessage: null,
          taxBreakdown: taxBreakdownValue !== undefined ? taxBreakdownValue : Prisma.DbNull,
        },
      });
    });

    console.log(
      `[DiaImporter] ✓ Successfully imported Dia ticket ${externalTicketId} (${receipt.id}) with ${itemsToCreate.length} items via ${aiProviderLabel} in ${processingMs}ms.`
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
