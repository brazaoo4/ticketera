import { prisma } from "@/lib/db";



export const CORE_STORES = [
  { name: "Mercadona", slug: "mercadona", brandHex: "#00754A" },
  { name: "Lidl", slug: "lidl", brandHex: "#0050AA" },
  { name: "Carrefour", slug: "carrefour", brandHex: "#0E51A0" },
  { name: "Alcampo", slug: "alcampo", brandHex: "#E2001A" },
  { name: "Consum", slug: "consum", brandHex: "#E65300" },
  { name: "DIA", slug: "dia", brandHex: "#D52B1E" },
  { name: "Aldi", slug: "aldi", brandHex: "#00B4E5" },
  { name: "MAS", slug: "mas", brandHex: "#E30613" },
  { name: "Cash Fresh", slug: "cash-fresh", brandHex: "#00843D" },
];

export async function ensureDatabaseSchema() {
  try {
    // Check if the "User" table already exists in public schema
    const checkResult = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'User'
      );
    `;

    if (checkResult?.[0]?.exists) {
      console.log("⚡ [Startup] Database tables already exist. Verifying columns...");
      await prisma.$executeRawUnsafe(`ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "taxBreakdown" JSONB;`).catch(() => null);
      await prisma.$executeRawUnsafe(`ALTER TABLE "ProductAlias" ADD COLUMN IF NOT EXISTS "unitMeasurePerPack" DECIMAL(10,3);`).catch(() => null);
      await prisma.$executeRawUnsafe(`ALTER TABLE "ProductAlias" ADD COLUMN IF NOT EXISTS "isVariableWeight" BOOLEAN NOT NULL DEFAULT false;`).catch(() => null);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "SystemSetting" (
          "key" TEXT NOT NULL,
          "value" TEXT NOT NULL,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
        );
      `).catch(() => null);
      return;
    }

    console.log("⚡ [Startup] First boot detected: provisioning PostgreSQL schema, enums and tables...");

    const ddlStatements = [
      `CREATE EXTENSION IF NOT EXISTS "pg_trgm";`,

      `DO $$ BEGIN
        CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,

      `DO $$ BEGIN
        CREATE TYPE "ReceiptStatus" AS ENUM ('PENDING', 'PROCESSING', 'REVIEW', 'CONFIRMED', 'FAILED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,

      `DO $$ BEGIN
        CREATE TYPE "BaseUnit" AS ENUM ('KG', 'L', 'UNIT');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,

      `CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT NOT NULL,
        "username" TEXT NOT NULL,
        "password" TEXT NOT NULL,
        "role" "Role" NOT NULL DEFAULT 'USER',
        "enabled" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "User_pkey" PRIMARY KEY ("id")
      );`,

      `CREATE TABLE IF NOT EXISTS "Store" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "brandHex" TEXT NOT NULL DEFAULT '#10b981',
        CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
      );`,

      `CREATE TABLE IF NOT EXISTS "Receipt" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "storeId" TEXT NOT NULL,
        "purchaseDate" TIMESTAMP(3) NOT NULL,
        "totalAmount" DECIMAL(10,2),
        "sourceFile" TEXT NOT NULL,
        "fileHash" TEXT NOT NULL,
        "aiProvider" TEXT,
        "processingMs" INTEGER,
        "status" "ReceiptStatus" NOT NULL DEFAULT 'PENDING',
        "errorMessage" TEXT,
        "taxBreakdown" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
      );`,

      `CREATE TABLE IF NOT EXISTS "Product" (
        "id" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "displayName" TEXT NOT NULL,
        "category" TEXT NOT NULL,
        "baseUnit" "BaseUnit" NOT NULL DEFAULT 'UNIT',
        "isStaple" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
      );`,

      `CREATE TABLE IF NOT EXISTS "ProductAlias" (
        "id" TEXT NOT NULL,
        "rawAlias" TEXT NOT NULL,
        "storeId" TEXT NOT NULL,
        "productId" TEXT NOT NULL,
        "unitMeasurePerPack" DECIMAL(10,3),
        "isVariableWeight" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ProductAlias_pkey" PRIMARY KEY ("id")
      );`,

      `CREATE TABLE IF NOT EXISTS "ReceiptItem" (
        "id" TEXT NOT NULL,
        "receiptId" TEXT NOT NULL,
        "productId" TEXT,
        "rawName" TEXT NOT NULL,
        "suggestedName" TEXT NOT NULL,
        "suggestedCat" TEXT,
        "matchConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "quantity" DECIMAL(10,3) NOT NULL,
        "unitPrice" DECIMAL(10,2) NOT NULL,
        "totalPrice" DECIMAL(10,2) NOT NULL,
        "baseUnit" "BaseUnit" NOT NULL DEFAULT 'UNIT',
        "unitMeasure" DECIMAL(10,3) NOT NULL DEFAULT 1,
        "pricePerBaseUnit" DECIMAL(10,2) NOT NULL,
        "isDiscount" BOOLEAN NOT NULL DEFAULT false,
        "excluded" BOOLEAN NOT NULL DEFAULT false,
        "confirmed" BOOLEAN NOT NULL DEFAULT false,
        CONSTRAINT "ReceiptItem_pkey" PRIMARY KEY ("id")
      );`,

      `CREATE TABLE IF NOT EXISTS "SystemSetting" (
        "key" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
      );`,

      `CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Store_name_key" ON "Store"("name");`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Store_slug_key" ON "Store"("slug");`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Receipt_fileHash_key" ON "Receipt"("fileHash");`,
      `CREATE INDEX IF NOT EXISTS "Receipt_storeId_purchaseDate_idx" ON "Receipt"("storeId", "purchaseDate" DESC);`,
      `CREATE INDEX IF NOT EXISTS "Receipt_userId_purchaseDate_idx" ON "Receipt"("userId", "purchaseDate" DESC);`,
      `CREATE INDEX IF NOT EXISTS "Receipt_status_idx" ON "Receipt"("status");`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Product_slug_key" ON "Product"("slug");`,
      `CREATE INDEX IF NOT EXISTS "Product_category_idx" ON "Product"("category");`,
      `CREATE INDEX IF NOT EXISTS "Product_isStaple_idx" ON "Product"("isStaple");`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "ProductAlias_storeId_rawAlias_key" ON "ProductAlias"("storeId", "rawAlias");`,
      `CREATE INDEX IF NOT EXISTS "ReceiptItem_productId_confirmed_excluded_idx" ON "ReceiptItem"("productId", "confirmed", "excluded");`,
      `CREATE INDEX IF NOT EXISTS "ReceiptItem_receiptId_idx" ON "ReceiptItem"("receiptId");`,

      `DO $$ BEGIN
        ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,

      `DO $$ BEGIN
        ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,

      `DO $$ BEGIN
        ALTER TABLE "ProductAlias" ADD CONSTRAINT "ProductAlias_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,

      `DO $$ BEGIN
        ALTER TABLE "ProductAlias" ADD CONSTRAINT "ProductAlias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,

      `DO $$ BEGIN
        ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,

      `DO $$ BEGIN
        ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,

      `ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "taxBreakdown" JSONB;`,
    ];

    for (const statement of ddlStatements) {
      await prisma.$executeRawUnsafe(statement);
    }

    console.log("✅ [Startup] Database schema & tables initialized successfully.");
  } catch (err) {
    console.error("❌ [Startup] Error ensuring database schema:", err);
    throw err;
  }
}

export async function seedSupermarkets() {
  for (const store of CORE_STORES) {
    await prisma.store.upsert({
      where: { slug: store.slug },
      update: {
        name: store.name,
        brandHex: store.brandHex,
      },
      create: {
        name: store.name,
        slug: store.slug,
        brandHex: store.brandHex,
      },
    });
  }
}

export async function migrateCategoriesToEnglish() {
  try {
    await prisma.$executeRawUnsafe(`
      UPDATE "Product" SET category = CASE category
        WHEN 'Lácteos y Huevos' THEN 'Dairy & Eggs'
        WHEN 'Carnicería' THEN 'Meat & Poultry'
        WHEN 'Pescadería' THEN 'Fish & Seafood'
        WHEN 'Fruta y Verdura' THEN 'Fruits & Vegetables'
        WHEN 'Panadería' THEN 'Bakery'
        WHEN 'Despensa' THEN 'Pantry'
        WHEN 'Aceites' THEN 'Oils & Condiments'
        WHEN 'Bebidas' THEN 'Beverages'
        WHEN 'Congelados' THEN 'Frozen Foods'
        WHEN 'Limpieza y Hogar' THEN 'Cleaning & Household'
        WHEN 'Cuidado Personal' THEN 'Personal Care'
        WHEN 'Otros' THEN 'Other'
        ELSE category
      END
      WHERE category IN ('Lácteos y Huevos', 'Carnicería', 'Pescadería', 'Fruta y Verdura', 'Panadería', 'Despensa', 'Aceites', 'Bebidas', 'Congelados', 'Limpieza y Hogar', 'Cuidado Personal', 'Otros');
    `);

    await prisma.$executeRawUnsafe(`
      UPDATE "ReceiptItem" SET "suggestedCat" = CASE "suggestedCat"
        WHEN 'Lácteos y Huevos' THEN 'Dairy & Eggs'
        WHEN 'Carnicería' THEN 'Meat & Poultry'
        WHEN 'Pescadería' THEN 'Fish & Seafood'
        WHEN 'Fruta y Verdura' THEN 'Fruits & Vegetables'
        WHEN 'Panadería' THEN 'Bakery'
        WHEN 'Despensa' THEN 'Pantry'
        WHEN 'Aceites' THEN 'Oils & Condiments'
        WHEN 'Bebidas' THEN 'Beverages'
        WHEN 'Congelados' THEN 'Frozen Foods'
        WHEN 'Limpieza y Hogar' THEN 'Cleaning & Household'
        WHEN 'Cuidado Personal' THEN 'Personal Care'
        WHEN 'Otros' THEN 'Other'
        ELSE "suggestedCat"
      END
      WHERE "suggestedCat" IN ('Lácteos y Huevos', 'Carnicería', 'Pescadería', 'Fruta y Verdura', 'Panadería', 'Despensa', 'Aceites', 'Bebidas', 'Congelados', 'Limpieza y Hogar', 'Cuidado Personal', 'Otros');
    `);
  } catch (err) {
    console.warn("[Startup] Category English migration notice:", err);
  }
}

export async function cleanupSyntheticSeedDataAndDuplicates() {
  try {
    // 1. Purge synthetic seed receipts & their cascaded receipt items
    const deletedSeedReceipts = await prisma.receipt.deleteMany({
      where: {
        OR: [
          { fileHash: { startsWith: "seed-hash-" } },
          { aiProvider: { contains: "Synthetic Seed" } },
        ],
      },
    });
    if (deletedSeedReceipts.count > 0) {
      console.log(`⚡ [Startup] Purged ${deletedSeedReceipts.count} synthetic seed receipts.`);
    }

    // 2. Deduplicate duplicate products (e.g. "Huevos Camperos" and "Huevos Camperos (Docena)")
    const products = await prisma.product.findMany({
      include: {
        receiptItems: true,
        aliases: true,
      },
    });

    const groups = new Map<string, typeof products>();
    for (const p of products) {
      // Normalize slug: strip -1l, -1kg, -500g, -docena, -12ud, etc.
      const normSlug = p.slug
        .replace(/-(1l|1kg|500g|250g|docena|12ud|6ud|pack-4|clase-m|clase-l|clase-m-12ud|igp)$/i, "")
        .replace(/--+/g, "-");
      const existing = groups.get(normSlug) || [];
      existing.push(p);
      groups.set(normSlug, existing);
    }

    for (const [, prods] of groups.entries()) {
      if (prods.length <= 1) continue;

      // Pick primary product: prefer the one with the cleaner slug or more receiptItems
      prods.sort((a, b) => {
        if (b.receiptItems.length !== a.receiptItems.length) {
          return b.receiptItems.length - a.receiptItems.length;
        }
        return a.slug.length - b.slug.length;
      });

      const primary = prods[0];
      const duplicates = prods.slice(1);

      for (const dup of duplicates) {
        console.log(`⚡ [Startup] Merging duplicate product "${dup.displayName}" (${dup.slug}) into "${primary.displayName}" (${primary.slug})`);

        // Reassign receipt items to primary
        await prisma.receiptItem.updateMany({
          where: { productId: dup.id },
          data: { productId: primary.id },
        });

        // Reassign aliases safely
        for (const alias of dup.aliases) {
          const existingAlias = await prisma.productAlias.findUnique({
            where: {
              storeId_rawAlias: {
                storeId: alias.storeId,
                rawAlias: alias.rawAlias,
              },
            },
          });
          if (!existingAlias) {
            await prisma.productAlias.update({
              where: { id: alias.id },
              data: { productId: primary.id },
            });
          }
        }

        // Delete duplicate product
        await prisma.product.delete({
          where: { id: dup.id },
        }).catch(() => null);
      }
    }

    // 3. Prune orphaned products with 0 receipt items
    const pruned = await prisma.product.deleteMany({
      where: {
        receiptItems: { none: {} },
      },
    });
    if (pruned.count > 0) {
      console.log(`⚡ [Startup] Pruned ${pruned.count} orphaned products with 0 receipt items.`);
    }
  } catch (err) {
    console.warn("⚠️ [Startup] Notice during seed & duplicate cleanup:", err);
  }
}

export async function bootstrapAdminUser() {
  const adminUser = process.env.INITIAL_ADMIN_USER?.trim();
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;

  if (adminUser && adminPassword) {
    try {
      const existingUser = await prisma.user.findUnique({
        where: { username: adminUser },
      });
      if (!existingUser) {
        const bcrypt = (await import("bcryptjs")).default;
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await prisma.user.create({
          data: {
            username: adminUser,
            password: hashedPassword,
            role: "ADMIN",
            enabled: true,
          },
        });
        console.log(`✅ [Startup] Bootstrapped initial admin user "${adminUser}" from environment.`);
      }
    } catch (err) {
      console.warn("⚠️ [Startup] Could not bootstrap initial admin user:", err);
    }
  }
}

export async function loadSystemSettings() {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "PUBLIC_CATALOG" },
    });
    if (setting) {
      process.env.PUBLIC_CATALOG = setting.value;
      console.log(`⚡ [Startup] Loaded PUBLIC_CATALOG=${setting.value} from system settings.`);
    } else {
      const defaultValue = process.env.PUBLIC_CATALOG === "true" ? "true" : "false";
      await prisma.systemSetting.upsert({
        where: { key: "PUBLIC_CATALOG" },
        update: {},
        create: { key: "PUBLIC_CATALOG", value: defaultValue },
      });
      process.env.PUBLIC_CATALOG = defaultValue;
      console.log(`⚡ [Startup] Initialized PUBLIC_CATALOG=${defaultValue} in system settings.`);
    }
  } catch (err) {
    console.warn("⚠️ [Startup] Could not load system settings:", err);
  }
}

export async function runStartupSeed() {
  try {
    console.log("⚡ [Startup] Checking initial database state (schema & stores)...");
    await ensureDatabaseSchema();
    await loadSystemSettings();
    await seedSupermarkets();
    await migrateCategoriesToEnglish();
    await cleanupSyntheticSeedDataAndDuplicates();
    await bootstrapAdminUser();
    console.log("✅ [Startup] Database seed check finished successfully.");
  } catch (error) {
    console.warn(
      "⚠️ [Startup] Seed check was skipped or failed (safe during build / offline DB):",
      error instanceof Error ? error.message : error
    );
  }
}

