import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import path from "path";
import fs from "fs";
import sharp from "sharp";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

export async function isDemoModeActive(): Promise<boolean> {
  try {
    const demoCount = await prisma.receipt.count({
      where: {
        fileHash: { startsWith: "demo-seed-" },
      },
    });
    return demoCount > 0;
  } catch {
    return false;
  }
}

export async function loadDemoData(): Promise<{ success: boolean; count: number }> {
  // 1. Ensure storage directory exists
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  // 2. Ensure an owner user exists
  let user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    const bcrypt = (await import("bcryptjs")).default;
    const hashedPassword = await bcrypt.hash("demo12345", 10);
    user = await prisma.user.create({
      data: {
        username: "demo_admin",
        password: hashedPassword,
        role: "ADMIN",
        enabled: true,
      },
    });
  }

  // 3. Ensure core stores exist
  const stores = await Promise.all([
    prisma.store.upsert({
      where: { slug: "mercadona" },
      update: {},
      create: { name: "Mercadona", slug: "mercadona", brandHex: "#00754A" },
    }),
    prisma.store.upsert({
      where: { slug: "lidl" },
      update: {},
      create: { name: "Lidl", slug: "lidl", brandHex: "#0050AA" },
    }),
    prisma.store.upsert({
      where: { slug: "carrefour" },
      update: {},
      create: { name: "Carrefour", slug: "carrefour", brandHex: "#0E51A0" },
    }),
    prisma.store.upsert({
      where: { slug: "consum" },
      update: {},
      create: { name: "Consum", slug: "consum", brandHex: "#E65300" },
    }),
    prisma.store.upsert({
      where: { slug: "dia" },
      update: {},
      create: { name: "DIA", slug: "dia", brandHex: "#D52B1E" },
    }),
  ]);

  const [mercadona, lidl, carrefour, consum, dia] = stores;

  // 4. Upsert canonical products
  const products = {
    aceite: await prisma.product.upsert({
      where: { slug: "aceite-de-oliva-virgen-extra" },
      update: { isStaple: true },
      create: {
        slug: "aceite-de-oliva-virgen-extra",
        displayName: "Aceite de Oliva Virgen Extra",
        category: "Oils & Condiments",
        baseUnit: "L",
        isStaple: true,
      },
    }),
    leche: await prisma.product.upsert({
      where: { slug: "leche-entera" },
      update: { isStaple: true },
      create: {
        slug: "leche-entera",
        displayName: "Leche Entera",
        category: "Dairy & Eggs",
        baseUnit: "L",
        isStaple: true,
      },
    }),
    huevos: await prisma.product.upsert({
      where: { slug: "huevos-camperos-m-l" },
      update: { isStaple: true },
      create: {
        slug: "huevos-camperos-m-l",
        displayName: "Huevos Camperos M/L",
        category: "Dairy & Eggs",
        baseUnit: "UNIT",
        isStaple: true,
      },
    }),
    pollo: await prisma.product.upsert({
      where: { slug: "pechuga-de-pollo" },
      update: { isStaple: true },
      create: {
        slug: "pechuga-de-pollo",
        displayName: "Pechuga de Pollo",
        category: "Meat & Poultry",
        baseUnit: "KG",
        isStaple: true,
      },
    }),
    arroz: await prisma.product.upsert({
      where: { slug: "arroz-redondo" },
      update: { isStaple: true },
      create: {
        slug: "arroz-redondo",
        displayName: "Arroz Redondo",
        category: "Pantry",
        baseUnit: "KG",
        isStaple: true,
      },
    }),
    yogur: await prisma.product.upsert({
      where: { slug: "yogur-natural" },
      update: { isStaple: true },
      create: {
        slug: "yogur-natural",
        displayName: "Yogur Natural",
        category: "Dairy & Eggs",
        baseUnit: "UNIT",
        isStaple: true,
      },
    }),
    galletas: await prisma.product.upsert({
      where: { slug: "galletas-tostadas" },
      update: { isStaple: true },
      create: {
        slug: "galletas-tostadas",
        displayName: "Galletas Tostadas",
        category: "Bakery",
        baseUnit: "KG",
        isStaple: true,
      },
    }),
    cafe: await prisma.product.upsert({
      where: { slug: "cafe-molido-natural" },
      update: { isStaple: true },
      create: {
        slug: "cafe-molido-natural",
        displayName: "Café Molido Natural",
        category: "Beverages",
        baseUnit: "KG",
        isStaple: true,
      },
    }),
  };

  // Helper to create placeholder WebP image
  const ensurePlaceholderImage = async (filename: string, title: string) => {
    const dest = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(dest)) {
      try {
        const svg = `
          <svg width="400" height="700" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#18181b"/>
            <rect x="20" y="20" width="360" height="660" rx="12" fill="#27272a" stroke="#3f3f46" stroke-width="2"/>
            <text x="200" y="70" font-family="sans-serif" font-size="20" font-weight="bold" fill="#10b981" text-anchor="middle">TICKET DEMO</text>
            <text x="200" y="105" font-family="sans-serif" font-size="14" fill="#a1a1aa" text-anchor="middle">${title}</text>
            <line x1="40" y1="130" x2="360" y2="130" stroke="#52525b" stroke-dasharray="4"/>
            <text x="50" y="170" font-family="monospace" font-size="13" fill="#e4e4e7">ARTICULOS VERIFICADOS</text>
            <text x="50" y="210" font-family="monospace" font-size="12" fill="#a1a1aa">1x ACEITE OLIVA VIRGEN</text>
            <text x="350" y="210" font-family="monospace" font-size="12" fill="#e4e4e7" text-anchor="end">8.95</text>
            <text x="50" y="240" font-family="monospace" font-size="12" fill="#a1a1aa">6x LECHE ENTERA 1L</text>
            <text x="350" y="240" font-family="monospace" font-size="12" fill="#e4e4e7" text-anchor="end">5.70</text>
            <text x="50" y="270" font-family="monospace" font-size="12" fill="#a1a1aa">1x PECHUGA POLLO 540G</text>
            <text x="350" y="270" font-family="monospace" font-size="12" fill="#e4e4e7" text-anchor="end">3.78</text>
            <line x1="40" y1="580" x2="360" y2="580" stroke="#52525b" stroke-dasharray="4"/>
            <text x="200" y="620" font-family="sans-serif" font-size="12" fill="#71717a" text-anchor="middle">Ticketera Demo System</text>
          </svg>
        `;
        await sharp(Buffer.from(svg)).webp({ quality: 85 }).toFile(dest);
      } catch (err) {
        console.warn("Could not generate placeholder WebP:", err);
      }
    }
  };

  // 5. Define rich receipt dataset spanning 6 months
  interface DemoReceiptItemDef {
  product: { id: string; displayName: string; category: string; baseUnit: string; isStaple?: boolean };
  rawName: string;
  suggestedName: string;
  suggestedCat: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  baseUnit: "KG" | "L" | "UNIT";
  unitMeasure: number;
  pricePerBaseUnit: number;
  unitMeasurePerPack?: number;
  isVariableWeight?: boolean;
}

interface DemoReceiptDef {
  hash: string;
  store: { id: string; name: string; slug: string; brandHex?: string | null };
  date: Date;
  file: string;
  title: string;
  items: DemoReceiptItemDef[];
  tax: Array<{ rate: number; baseAmount: number; taxAmount: number }>;
}

  const demoReceipts: DemoReceiptDef[] = [
    // Receipt 1: Mercadona (May 2026) - Base Pre-Shrinkflation Galletas (500g @ €1.80)
    {
      hash: "demo-seed-mercadona-01",
      store: mercadona,
      date: new Date("2026-05-12T11:30:00Z"),
      file: "demo-mercadona-01.webp",
      title: "Mercadona — Mayo 2026",
      items: [
        {
          product: products.galletas,
          rawName: "GALLETAS TOSTADAS 500G",
          suggestedName: "Galletas Tostadas",
          suggestedCat: "Bakery",
          quantity: 1,
          unitPrice: 1.80,
          totalPrice: 1.80,
          baseUnit: "KG" as const,
          unitMeasure: 0.500,
          pricePerBaseUnit: 3.60,
          unitMeasurePerPack: 0.500,
        },
        {
          product: products.leche,
          rawName: "LECHE ENTERA BRICK 1L",
          suggestedName: "Leche Entera",
          suggestedCat: "Dairy & Eggs",
          quantity: 6,
          unitPrice: 0.95,
          totalPrice: 5.70,
          baseUnit: "L" as const,
          unitMeasure: 6.0,
          pricePerBaseUnit: 0.95,
          unitMeasurePerPack: 1.0,
        },
        {
          product: products.aceite,
          rawName: "ACEITE OLIVA VIRGEN EXTRA 1L",
          suggestedName: "Aceite de Oliva Virgen Extra",
          suggestedCat: "Oils & Condiments",
          quantity: 1,
          unitPrice: 9.15,
          totalPrice: 9.15,
          baseUnit: "L" as const,
          unitMeasure: 1.0,
          pricePerBaseUnit: 9.15,
          unitMeasurePerPack: 1.0,
        },
      ],
      tax: [
        { rate: 2, baseAmount: 8.97, taxAmount: 0.18 },
        { rate: 4, baseAmount: 7.21, taxAmount: 0.29 },
      ],
    },

    // Receipt 2: Mercadona (September 2026) - Shrinkflation Occurs! Galletas (420g @ €1.75 -> €4.17/kg)
    {
      hash: "demo-seed-mercadona-02",
      store: mercadona,
      date: new Date("2026-09-18T10:15:00Z"),
      file: "demo-mercadona-02.webp",
      title: "Mercadona — Septiembre 2026 (Reducción de tamaño)",
      items: [
        {
          product: products.galletas,
          rawName: "GALLETAS TOSTADAS 420G",
          suggestedName: "Galletas Tostadas",
          suggestedCat: "Bakery",
          quantity: 1,
          unitPrice: 1.75,
          totalPrice: 1.75,
          baseUnit: "KG" as const,
          unitMeasure: 0.420,
          pricePerBaseUnit: 4.17,
          unitMeasurePerPack: 0.420,
        },
        {
          product: products.aceite,
          rawName: "ACEITE OLIVA VIRGEN EXTRA 1L",
          suggestedName: "Aceite de Oliva Virgen Extra",
          suggestedCat: "Oils & Condiments",
          quantity: 1,
          unitPrice: 8.75,
          totalPrice: 8.75,
          baseUnit: "L" as const,
          unitMeasure: 1.0,
          pricePerBaseUnit: 8.75,
          unitMeasurePerPack: 1.0,
        },
        {
          product: products.pollo,
          rawName: "PECHUGA FILETEADA BANDEJA",
          suggestedName: "Pechuga de Pollo",
          suggestedCat: "Meat & Poultry",
          quantity: 1,
          unitPrice: 7.15,
          totalPrice: 3.86,
          baseUnit: "KG" as const,
          unitMeasure: 0.540,
          pricePerBaseUnit: 7.15,
          isVariableWeight: true,
        },
      ],
      tax: [
        { rate: 2, baseAmount: 8.58, taxAmount: 0.17 },
        { rate: 4, baseAmount: 1.68, taxAmount: 0.07 },
        { rate: 10, baseAmount: 3.51, taxAmount: 0.35 },
      ],
    },

    // Receipt 3: Lidl (June 2026)
    {
      hash: "demo-seed-lidl-01",
      store: lidl,
      date: new Date("2026-06-04T18:20:00Z"),
      file: "demo-lidl-01.webp",
      title: "Lidl — Junio 2026",
      items: [
        {
          product: products.huevos,
          rawName: "HUEVOS CAMPEROS DOCENA M/L",
          suggestedName: "Huevos Camperos M/L",
          suggestedCat: "Dairy & Eggs",
          quantity: 1,
          unitPrice: 2.39,
          totalPrice: 2.39,
          baseUnit: "UNIT" as const,
          unitMeasure: 12,
          pricePerBaseUnit: 0.20,
          unitMeasurePerPack: 12,
        },
        {
          product: products.yogur,
          rawName: "YOGUR NATURAL 4X125G",
          suggestedName: "Yogur Natural",
          suggestedCat: "Dairy & Eggs",
          quantity: 1,
          unitPrice: 1.05,
          totalPrice: 1.05,
          baseUnit: "UNIT" as const,
          unitMeasure: 4,
          pricePerBaseUnit: 0.26,
          unitMeasurePerPack: 4,
        },
        {
          product: products.arroz,
          rawName: "ARROZ REDONDO 1KG",
          suggestedName: "Arroz Redondo",
          suggestedCat: "Pantry",
          quantity: 2,
          unitPrice: 1.29,
          totalPrice: 2.58,
          baseUnit: "KG" as const,
          unitMeasure: 2.0,
          pricePerBaseUnit: 1.29,
          unitMeasurePerPack: 1.0,
        },
      ],
      tax: [
        { rate: 4, baseAmount: 3.31, taxAmount: 0.13 },
        { rate: 10, baseAmount: 2.35, taxAmount: 0.23 },
      ],
    },

    // Receipt 4: Carrefour (July 2026) - Multi-Size format 5L Olive Oil
    {
      hash: "demo-seed-carrefour-01",
      store: carrefour,
      date: new Date("2026-07-22T12:45:00Z"),
      file: "demo-carrefour-01.webp",
      title: "Carrefour — Julio 2026 (Garrafa 5L)",
      items: [
        {
          product: products.aceite,
          rawName: "GARRAFA AOVE 5L",
          suggestedName: "Aceite de Oliva Virgen Extra",
          suggestedCat: "Oils & Condiments",
          quantity: 1,
          unitPrice: 39.75,
          totalPrice: 39.75,
          baseUnit: "L" as const,
          unitMeasure: 5.0,
          pricePerBaseUnit: 7.95,
          unitMeasurePerPack: 5.0,
        },
        {
          product: products.cafe,
          rawName: "CAFE MOLIDO NATURAL 250G",
          suggestedName: "Café Molido Natural",
          suggestedCat: "Beverages",
          quantity: 2,
          unitPrice: 2.15,
          totalPrice: 4.30,
          baseUnit: "KG" as const,
          unitMeasure: 0.500,
          pricePerBaseUnit: 8.60,
          unitMeasurePerPack: 0.250,
        },
      ],
      tax: [
        { rate: 2, baseAmount: 38.97, taxAmount: 0.78 },
        { rate: 10, baseAmount: 3.91, taxAmount: 0.39 },
      ],
    },

    // Receipt 5: Consum (August 2026)
    {
      hash: "demo-seed-consum-01",
      store: consum,
      date: new Date("2026-08-14T17:10:00Z"),
      file: "demo-consum-01.webp",
      title: "Consum — Agosto 2026",
      items: [
        {
          product: products.leche,
          rawName: "LECHE ENTERA PACK 6X1L",
          suggestedName: "Leche Entera",
          suggestedCat: "Dairy & Eggs",
          quantity: 1,
          unitPrice: 5.76,
          totalPrice: 5.76,
          baseUnit: "L" as const,
          unitMeasure: 6.0,
          pricePerBaseUnit: 0.96,
          unitMeasurePerPack: 6.0,
        },
        {
          product: products.pollo,
          rawName: "FILETES PECHUGA POLLO 720G",
          suggestedName: "Pechuga de Pollo",
          suggestedCat: "Meat & Poultry",
          quantity: 1,
          unitPrice: 7.20,
          totalPrice: 5.18,
          baseUnit: "KG" as const,
          unitMeasure: 0.720,
          pricePerBaseUnit: 7.20,
          isVariableWeight: true,
        },
      ],
      tax: [
        { rate: 4, baseAmount: 5.54, taxAmount: 0.22 },
        { rate: 10, baseAmount: 4.71, taxAmount: 0.47 },
      ],
    },

    // Receipt 6: DIA (September 2026)
    {
      hash: "demo-seed-dia-01",
      store: dia,
      date: new Date("2026-09-02T19:30:00Z"),
      file: "demo-dia-01.webp",
      title: "DIA — Septiembre 2026",
      items: [
        {
          product: products.huevos,
          rawName: "DOCENA HUEVOS M/L DIA",
          suggestedName: "Huevos Camperos M/L",
          suggestedCat: "Dairy & Eggs",
          quantity: 1,
          unitPrice: 2.29,
          totalPrice: 2.29,
          baseUnit: "UNIT" as const,
          unitMeasure: 12,
          pricePerBaseUnit: 0.19,
          unitMeasurePerPack: 12,
        },
        {
          product: products.arroz,
          rawName: "ARROZ EXTRA DIA 1KG",
          suggestedName: "Arroz Redondo",
          suggestedCat: "Pantry",
          quantity: 1,
          unitPrice: 1.35,
          totalPrice: 1.35,
          baseUnit: "KG" as const,
          unitMeasure: 1.0,
          pricePerBaseUnit: 1.35,
          unitMeasurePerPack: 1.0,
        },
      ],
      tax: [
        { rate: 4, baseAmount: 2.20, taxAmount: 0.09 },
        { rate: 10, baseAmount: 1.23, taxAmount: 0.12 },
      ],
    },

    // Receipt 7: Lidl (October 2026) - Recent purchase
    {
      hash: "demo-seed-lidl-02",
      store: lidl,
      date: new Date("2026-10-15T16:00:00Z"),
      file: "demo-lidl-02.webp",
      title: "Lidl — Octubre 2026 (Reciente)",
      items: [
        {
          product: products.leche,
          rawName: "LECHE ENTERA MILBONA 1L",
          suggestedName: "Leche Entera",
          suggestedCat: "Dairy & Eggs",
          quantity: 4,
          unitPrice: 0.94,
          totalPrice: 3.76,
          baseUnit: "L" as const,
          unitMeasure: 4.0,
          pricePerBaseUnit: 0.94,
          unitMeasurePerPack: 1.0,
        },
        {
          product: products.aceite,
          rawName: "ACEITE OLIVA VIRGEN EXTRA 1L",
          suggestedName: "Aceite de Oliva Virgen Extra",
          suggestedCat: "Oils & Condiments",
          quantity: 1,
          unitPrice: 8.49,
          totalPrice: 8.49,
          baseUnit: "L" as const,
          unitMeasure: 1.0,
          pricePerBaseUnit: 8.49,
          unitMeasurePerPack: 1.0,
        },
        {
          product: products.yogur,
          rawName: "YOGUR NATURAL 4X125G",
          suggestedName: "Yogur Natural",
          suggestedCat: "Dairy & Eggs",
          quantity: 2,
          unitPrice: 1.09,
          totalPrice: 2.18,
          baseUnit: "UNIT" as const,
          unitMeasure: 8,
          pricePerBaseUnit: 0.27,
          unitMeasurePerPack: 4,
        },
      ],
      tax: [
        { rate: 2, baseAmount: 8.32, taxAmount: 0.17 },
        { rate: 4, baseAmount: 5.71, taxAmount: 0.23 },
      ],
    },

    // Receipt 8: Carrefour (October 2026)
    {
      hash: "demo-seed-carrefour-02",
      store: carrefour,
      date: new Date("2026-10-21T18:40:00Z"),
      file: "demo-carrefour-02.webp",
      title: "Carrefour — Octubre 2026 (Reciente)",
      items: [
        {
          product: products.cafe,
          rawName: "CAFE MOLIDO NATURAL 250G",
          suggestedName: "Café Molido Natural",
          suggestedCat: "Beverages",
          quantity: 1,
          unitPrice: 2.25,
          totalPrice: 2.25,
          baseUnit: "KG" as const,
          unitMeasure: 0.250,
          pricePerBaseUnit: 9.00,
          unitMeasurePerPack: 0.250,
        },
        {
          product: products.huevos,
          rawName: "HUEVOS CAMPEROS 6 UD",
          suggestedName: "Huevos Camperos M/L",
          suggestedCat: "Dairy & Eggs",
          quantity: 1,
          unitPrice: 1.35,
          totalPrice: 1.35,
          baseUnit: "UNIT" as const,
          unitMeasure: 6,
          pricePerBaseUnit: 0.23,
          unitMeasurePerPack: 6,
        },
      ],
      tax: [
        { rate: 4, baseAmount: 1.30, taxAmount: 0.05 },
        { rate: 10, baseAmount: 2.05, taxAmount: 0.20 },
      ],
    },
  ];

  let createdCount = 0;

  for (const dr of demoReceipts) {
    await ensurePlaceholderImage(dr.file, dr.title);

    const total = dr.items.reduce((acc, i) => acc + i.totalPrice, 0);

    const receipt = await prisma.receipt.upsert({
      where: { fileHash: dr.hash },
      update: {
        totalAmount: new Prisma.Decimal(total),
        purchaseDate: dr.date,
        taxBreakdown: dr.tax as unknown as Prisma.InputJsonValue,
      },
      create: {
        userId: user.id,
        storeId: dr.store.id,
        purchaseDate: dr.date,
        totalAmount: new Prisma.Decimal(total),
        sourceFile: dr.file,
        fileHash: dr.hash,
        aiProvider: "demo-generator",
        processingMs: 420,
        status: "CONFIRMED",
        taxBreakdown: dr.tax as unknown as Prisma.InputJsonValue,
      },
    });

    createdCount++;

    // Create line items
    for (const item of dr.items) {
      const lineItemId = `demo-item-${receipt.id}-${item.product.id}`;
      await prisma.receiptItem.upsert({
        where: { id: lineItemId },
        update: {
          quantity: new Prisma.Decimal(item.quantity),
          unitPrice: new Prisma.Decimal(item.unitPrice),
          totalPrice: new Prisma.Decimal(item.totalPrice),
          baseUnit: item.baseUnit,
          unitMeasure: new Prisma.Decimal(item.unitMeasure),
          pricePerBaseUnit: new Prisma.Decimal(item.pricePerBaseUnit),
          confirmed: true,
          excluded: false,
        },
        create: {
          id: lineItemId,
          receiptId: receipt.id,
          productId: item.product.id,
          rawName: item.rawName,
          suggestedName: item.suggestedName,
          suggestedCat: item.suggestedCat,
          matchConfidence: 1.0,
          quantity: new Prisma.Decimal(item.quantity),
          unitPrice: new Prisma.Decimal(item.unitPrice),
          totalPrice: new Prisma.Decimal(item.totalPrice),
          baseUnit: item.baseUnit,
          unitMeasure: new Prisma.Decimal(item.unitMeasure),
          pricePerBaseUnit: new Prisma.Decimal(item.pricePerBaseUnit),
          confirmed: true,
          excluded: false,
        },
      });

      // Upsert ProductAlias
      if (item.unitMeasurePerPack || item.isVariableWeight) {
        await prisma.productAlias.upsert({
          where: {
            storeId_rawAlias: {
              storeId: dr.store.id,
              rawAlias: item.rawName,
            },
          },
          update: {
            productId: item.product.id,
            unitMeasurePerPack: item.unitMeasurePerPack
              ? new Prisma.Decimal(item.unitMeasurePerPack)
              : null,
            isVariableWeight: !!item.isVariableWeight,
          },
          create: {
            storeId: dr.store.id,
            rawAlias: item.rawName,
            productId: item.product.id,
            unitMeasurePerPack: item.unitMeasurePerPack
              ? new Prisma.Decimal(item.unitMeasurePerPack)
              : null,
            isVariableWeight: !!item.isVariableWeight,
          },
        });
      }
    }
  }

  return { success: true, count: createdCount };
}

export async function clearDemoData(): Promise<{ success: boolean; deletedCount: number }> {
  // 1. Find all demo receipts
  const demoReceipts = await prisma.receipt.findMany({
    where: {
      fileHash: { startsWith: "demo-seed-" },
    },
    select: {
      id: true,
      sourceFile: true,
    },
  });

  if (demoReceipts.length === 0) {
    return { success: true, deletedCount: 0 };
  }

  // 2. Remove placeholder files from disk
  for (const r of demoReceipts) {
    const filePath = path.join(UPLOAD_DIR, r.sourceFile);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn(`Could not delete demo file ${filePath}:`, err);
      }
    }
  }

  // 3. Delete in database transaction
  const deletedCount = await prisma.$transaction(async (tx) => {
    // Receipts cascade delete ReceiptItem records
    const res = await tx.receipt.deleteMany({
      where: {
        fileHash: { startsWith: "demo-seed-" },
      },
    });

    // Prune orphaned product aliases that point to products with no remaining items
    // and prune orphaned products that have 0 remaining items
    const orphanedProducts = await tx.product.findMany({
      where: {
        receiptItems: { none: {} },
      },
      select: { id: true },
    });

    const orphanIds = orphanedProducts.map((p) => p.id);
    if (orphanIds.length > 0) {
      await tx.productAlias.deleteMany({
        where: { productId: { in: orphanIds } },
      });
      await tx.product.deleteMany({
        where: { id: { in: orphanIds } },
      });
    }

    return res.count;
  });

  return { success: true, deletedCount };
}
