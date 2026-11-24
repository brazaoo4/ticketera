import crypto from "crypto";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth";
import {
  UPLOAD_DIR,
  detectMagicMimeType,
  getReceiptFilePath,
} from "@/lib/receipts/preprocess";
import { loadSystemSettings } from "@/lib/startup";
import { createZipBuffer, extractZipBuffer } from "./zip";

export const BACKUP_FORMAT_VERSION = "3.0";
const APP_VERSION = "2.5.0";
const SAFE_ARTIFACT_FILENAME_RE = /^[a-zA-Z0-9_-]+\.(webp|pdf|json)$/;

const BackupUserSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  role: z.enum(["USER", "ADMIN"]),
  enabled: z.boolean().default(true),
  createdAt: z.string().optional(),
});

const BackupStoreSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  brandHex: z.string().default("#10b981"),
});

const BackupProductSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  displayName: z.string().min(1),
  category: z.string().min(1),
  baseUnit: z.enum(["KG", "L", "UNIT"]).default("UNIT"),
  isStaple: z.boolean().default(false),
  nutriScore: z.string().nullable().optional(),
  novaGroup: z.number().int().min(1).max(4).nullable().optional(),
  proteinPer100g: z.number().nullable().optional(),
  kcalPer100g: z.number().nullable().optional(),
  ean: z.string().nullable().optional(),
  nutritionSource: z.string().nullable().optional(),
  nutritionUpdatedAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});

const BackupProductAliasSchema = z.object({
  id: z.string().min(1),
  rawAlias: z.string().min(1),
  storeId: z.string().min(1),
  productId: z.string().min(1),
  unitMeasurePerPack: z.number().nullable().optional(),
  isVariableWeight: z.boolean().default(false),
  barcode: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});

const BackupReceiptSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  storeId: z.string().min(1),
  purchaseDate: z.string().min(1),
  totalAmount: z.number().nullable().optional(),
  sourceFile: z.string().min(1),
  fileHash: z.string().min(1),
  externalTicketId: z.string().nullable().optional(),
  aiProvider: z.string().nullable().optional(),
  processingMs: z.number().int().nullable().optional(),
  status: z.enum(["PENDING", "PROCESSING", "REVIEW", "CONFIRMED", "FAILED"]),
  errorMessage: z.string().nullable().optional(),
  taxBreakdown: z.unknown().nullable().optional(),
  createdAt: z.string().optional(),
});

const BackupReceiptItemSchema = z.object({
  id: z.string().min(1),
  receiptId: z.string().min(1),
  productId: z.string().nullable().optional(),
  rawName: z.string().min(1),
  suggestedName: z.string().min(1),
  suggestedCat: z.string().nullable().optional(),
  matchConfidence: z.number().default(0),
  quantity: z.number().default(1),
  unitPrice: z.number().default(0),
  totalPrice: z.number().default(0),
  baseUnit: z.enum(["KG", "L", "UNIT"]).default("UNIT"),
  unitMeasure: z.number().default(1),
  pricePerBaseUnit: z.number().default(0),
  isDiscount: z.boolean().default(false),
  excluded: z.boolean().default(false),
  confirmed: z.boolean().default(false),
});

const BackupMonthlyBudgetSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  category: z.string().min(1),
  monthlyTarget: z.number().positive(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const BackupSystemSettingSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  updatedAt: z.string().optional(),
});

export const BackupDatabaseSchema = z.object({
  users: z.array(BackupUserSchema).optional(),
  stores: z.array(BackupStoreSchema),
  products: z.array(BackupProductSchema),
  productAliases: z.array(BackupProductAliasSchema),
  receipts: z.array(BackupReceiptSchema),
  receiptItems: z.array(BackupReceiptItemSchema),
  monthlyBudgets: z.array(BackupMonthlyBudgetSchema).default([]),
  systemSettings: z.array(BackupSystemSettingSchema).optional(),
});

export const BackupManifestSchema = z.object({
  formatVersion: z.string().min(1),
  scope: z.enum(["instance", "user"]),
  exportedAt: z.string().min(1),
  appVersion: z.string().min(1),
  exportedBy: z.object({
    userId: z.string(),
    username: z.string(),
    role: z.enum(["USER", "ADMIN"]),
  }),
  counts: z.object({
    users: z.number().int().nonnegative(),
    stores: z.number().int().nonnegative(),
    products: z.number().int().nonnegative(),
    productAliases: z.number().int().nonnegative(),
    receipts: z.number().int().nonnegative(),
    receiptItems: z.number().int().nonnegative(),
    monthlyBudgets: z.number().int().nonnegative(),
    artifacts: z.number().int().nonnegative(),
  }),
  checksums: z.object({
    databaseSha256: z.string().min(1),
    artifacts: z.record(z.string(), z.string()),
  }),
});

export type BackupDatabase = z.infer<typeof BackupDatabaseSchema>;
export type BackupManifest = z.infer<typeof BackupManifestSchema>;

export interface ParsedBackupPayload {
  kind: "zip-v3" | "json-v3" | "json-v2";
  formatVersion: string;
  scope: "instance" | "user";
  exportedAt: string;
  checksumsVerified: boolean;
  database: BackupDatabase;
  artifacts: Map<string, Buffer>;
  warnings: string[];
}

export interface BackupInspectionResult {
  formatVersion: string;
  kind: "zip-v3" | "json-v3" | "json-v2";
  scope: "instance" | "user";
  exportedAt: string;
  checksumsVerified: boolean;
  receiptsCount: number;
  newReceipts: number;
  duplicateReceipts: number;
  productsCount: number;
  newProducts: number;
  existingProducts: number;
  storesCount: number;
  newStores: number;
  budgetsCount: number;
  artifactFilesCount: number;
  totalArtifactBytes: number;
  warnings: string[];
}

export interface BackupRestoreResult {
  mode: "merge" | "replace";
  restoredReceipts: number;
  skippedReceipts: number;
  restoredProducts: number;
  restoredAliases: number;
  restoredBudgets: number;
  restoredArtifacts: number;
  warnings: string[];
}

function sha256Hex(buffer: Buffer | string): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function isZipMagic(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

/**
 * Converts legacy Ticketera v2.0 JSON exports into the normalized BackupDatabase structure.
 */
export function normalizeLegacyJsonBackup(raw: Record<string, unknown>): BackupDatabase {
  const legacyReceipts = Array.isArray(raw.receipts) ? raw.receipts : [];
  const legacyUserId = typeof raw.userId === "string" && raw.userId ? raw.userId : "legacy-user";

  const storesMap = new Map<string, z.infer<typeof BackupStoreSchema>>();
  const productsMap = new Map<string, z.infer<typeof BackupProductSchema>>();
  const receipts: Array<z.infer<typeof BackupReceiptSchema>> = [];
  const receiptItems: Array<z.infer<typeof BackupReceiptItemSchema>> = [];

  for (const rRaw of legacyReceipts) {
    if (!rRaw || typeof rRaw !== "object") continue;
    const r = rRaw as Record<string, unknown>;
    const storeRaw = (r.store && typeof r.store === "object" ? r.store : {}) as Record<
      string,
      unknown
    >;

    const storeSlug = String(storeRaw.slug || "other");
    const storeId = String(storeRaw.id || `legacy-store-${storeSlug}`);
    if (!storesMap.has(storeId)) {
      storesMap.set(storeId, {
        id: storeId,
        name: String(storeRaw.name || storeSlug),
        slug: storeSlug,
        brandHex: String(storeRaw.brandHex || "#10b981"),
      });
    }

    const receiptId = String(r.id || crypto.randomUUID());
    const purchaseDate = String(r.purchaseDate || new Date().toISOString());
    const totalAmount =
      typeof r.totalAmount === "number" ? r.totalAmount : Number(r.totalAmount ?? 0);
    const fileHash = `legacy-import-${sha256Hex(
      `${receiptId}:${purchaseDate}:${totalAmount}:${storeSlug}`
    )}`;

    receipts.push({
      id: receiptId,
      userId: legacyUserId,
      storeId,
      purchaseDate,
      totalAmount,
      sourceFile: `${receiptId}.webp`,
      fileHash,
      externalTicketId: null,
      aiProvider: typeof r.aiProvider === "string" ? r.aiProvider : null,
      processingMs: null,
      status: "CONFIRMED",
      errorMessage: null,
      taxBreakdown: r.taxBreakdown ?? null,
    });

    const items = Array.isArray(r.items) ? r.items : [];
    for (const itemRaw of items) {
      if (!itemRaw || typeof itemRaw !== "object") continue;
      const it = itemRaw as Record<string, unknown>;
      const prodRaw =
        it.product && typeof it.product === "object"
          ? (it.product as Record<string, unknown>)
          : null;

      let productId: string | null = null;
      if (prodRaw && typeof prodRaw.slug === "string" && prodRaw.slug) {
        productId = String(prodRaw.id || `legacy-prod-${prodRaw.slug}`);
        if (!productsMap.has(productId)) {
          const baseUnit =
            prodRaw.baseUnit === "KG" || prodRaw.baseUnit === "L"
              ? prodRaw.baseUnit
              : "UNIT";
          productsMap.set(productId, {
            id: productId,
            slug: String(prodRaw.slug),
            displayName: String(prodRaw.displayName || it.suggestedName || it.rawName || "Product"),
            category: String(prodRaw.category || it.category || "Other"),
            baseUnit,
            isStaple: Boolean(prodRaw.isStaple),
            nutriScore:
              typeof prodRaw.nutriScore === "string" ? prodRaw.nutriScore : null,
            novaGroup:
              typeof prodRaw.novaGroup === "number" ? prodRaw.novaGroup : null,
            proteinPer100g:
              typeof prodRaw.proteinPer100g === "number"
                ? prodRaw.proteinPer100g
                : null,
            kcalPer100g:
              typeof prodRaw.kcalPer100g === "number" ? prodRaw.kcalPer100g : null,
            ean: typeof prodRaw.ean === "string" ? prodRaw.ean : null,
          });
        }
      }

      const itemBaseUnit =
        it.baseUnit === "KG" || it.baseUnit === "L" ? it.baseUnit : "UNIT";

      receiptItems.push({
        id: String(it.id || crypto.randomUUID()),
        receiptId,
        productId,
        rawName: String(it.rawName || it.suggestedName || "ITEM"),
        suggestedName: String(it.suggestedName || it.rawName || "Item"),
        suggestedCat: typeof it.category === "string" ? it.category : "Other",
        matchConfidence: productId ? 1.0 : 0.0,
        quantity: Number(it.quantity ?? 1) || 1,
        unitPrice: Number(it.unitPrice ?? 0) || 0,
        totalPrice: Number(it.totalPrice ?? 0) || 0,
        baseUnit: itemBaseUnit,
        unitMeasure: Number(it.unitMeasure ?? 1) || 1,
        pricePerBaseUnit: Number(it.pricePerBaseUnit ?? 0) || 0,
        isDiscount: Boolean(it.isDiscount),
        excluded: false,
        confirmed: true,
      });
    }
  }

  return BackupDatabaseSchema.parse({
    stores: Array.from(storesMap.values()),
    products: Array.from(productsMap.values()),
    productAliases: [],
    receipts,
    receiptItems,
    monthlyBudgets: [],
  });
}

/**
 * Validates an artifact filename and its binary payload (magic bytes for WebP/PDF, JSON.parse for JSON).
 */
export function validateArtifactFile(filename: string, data: Buffer): void {
  if (!SAFE_ARTIFACT_FILENAME_RE.test(filename)) {
    throw new Error(`Unsafe backup artifact filename: ${filename}`);
  }
  const lower = filename.toLowerCase();
  if (lower.endsWith(".webp")) {
    const mime = detectMagicMimeType(data);
    if (mime !== "image/webp") {
      throw new Error(`Artifact "${filename}" failed WebP magic-byte verification.`);
    }
  } else if (lower.endsWith(".pdf")) {
    const mime = detectMagicMimeType(data);
    if (mime !== "application/pdf") {
      throw new Error(`Artifact "${filename}" failed PDF magic-byte verification.`);
    }
  } else if (lower.endsWith(".json")) {
    try {
      JSON.parse(data.toString("utf8"));
    } catch {
      throw new Error(`Artifact "${filename}" contains invalid JSON.`);
    }
  }
}

/**
 * Parses and cryptographically verifies a backup archive (.zip v3 or .json v2/v3).
 */
export function parseAndVerifyBackupPayload(
  buffer: Buffer,
  filename: string
): ParsedBackupPayload {
  const warnings: string[] = [];

  if (isZipMagic(buffer) || filename.toLowerCase().endsWith(".zip")) {
    const entries = extractZipBuffer(buffer);
    const manifestBuf = entries.get("manifest.json");
    const dbBuf = entries.get("database.json");

    if (!manifestBuf || !dbBuf) {
      throw new Error(
        "Invalid Ticketera backup archive: missing manifest.json or database.json."
      );
    }

    const manifest = BackupManifestSchema.parse(
      JSON.parse(manifestBuf.toString("utf8"))
    );

    const actualDbSha = sha256Hex(dbBuf);
    if (actualDbSha !== manifest.checksums.databaseSha256) {
      throw new Error(
        "Backup integrity check failed: database.json SHA-256 mismatch."
      );
    }

    const database = BackupDatabaseSchema.parse(
      JSON.parse(dbBuf.toString("utf8"))
    );

    const artifacts = new Map<string, Buffer>();
    for (const [entryPath, data] of entries.entries()) {
      if (!entryPath.startsWith("uploads/")) continue;
      const fname = entryPath.slice("uploads/".length);
      validateArtifactFile(fname, data);

      const expectedHash = manifest.checksums.artifacts[fname];
      if (!expectedHash) {
        throw new Error(
          `Backup integrity check failed: missing manifest checksum for uploads/${fname}.`
        );
      }
      if (sha256Hex(data) !== expectedHash) {
        throw new Error(
          `Backup integrity check failed: checksum mismatch for uploads/${fname}.`
        );
      }

      artifacts.set(fname, data);
    }

    for (const expectedName of Object.keys(manifest.checksums.artifacts)) {
      if (!artifacts.has(expectedName)) {
        warnings.push(
          `Manifest referenced uploads/${expectedName}, which was missing from archive.`
        );
      }
    }

    return {
      kind: "zip-v3",
      formatVersion: manifest.formatVersion,
      scope: manifest.scope,
      exportedAt: manifest.exportedAt,
      checksumsVerified: true,
      database,
      artifacts,
      warnings,
    };
  }

  // JSON backup fallback (v3 JSON or v2.0 JSON export)
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new Error("Uploaded file is neither a valid .zip bundle nor valid JSON.");
  }

  if (!parsedJson || typeof parsedJson !== "object") {
    throw new Error("Invalid JSON backup structure.");
  }

  const obj = parsedJson as Record<string, unknown>;
  if (obj.manifest && obj.database) {
    const manifest = BackupManifestSchema.parse(obj.manifest);
    const database = BackupDatabaseSchema.parse(obj.database);
    return {
      kind: "json-v3",
      formatVersion: manifest.formatVersion,
      scope: manifest.scope,
      exportedAt: manifest.exportedAt,
      checksumsVerified: false,
      database,
      artifacts: new Map(),
      warnings: [
        "JSON-only backup does not contain receipt image/PDF files from UPLOAD_DIR.",
      ],
    };
  }

  if (Array.isArray(obj.receipts)) {
    const database = normalizeLegacyJsonBackup(obj);
    return {
      kind: "json-v2",
      formatVersion: typeof obj.version === "string" ? obj.version : "2.0",
      scope: "user",
      exportedAt:
        typeof obj.exportDate === "string"
          ? obj.exportDate
          : new Date().toISOString(),
      checksumsVerified: false,
      database,
      artifacts: new Map(),
      warnings: [
        "Legacy JSON backup contains receipt records only; stored image/PDF files are not included.",
      ],
    };
  }

  throw new Error("Unrecognized backup file format.");
}

/**
 * Builds a complete portable .zip backup bundle containing database records and stored receipt artifacts.
 * Explicitly excludes StoreConnection credentials.
 */
export async function buildPortableBackupBundle(params: {
  user: AuthenticatedUser;
}): Promise<{ buffer: Buffer; filename: string; manifest: BackupManifest }> {
  const { user } = params;
  const isAdmin = user.role === "ADMIN";
  const scope: "instance" | "user" = isAdmin ? "instance" : "user";

  const [
    users,
    stores,
    receipts,
    receiptItems,
    monthlyBudgets,
    systemSettings,
  ] = await Promise.all([
    isAdmin
      ? prisma.user.findMany({
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            username: true,
            password: true,
            role: true,
            enabled: true,
            createdAt: true,
          },
        })
      : Promise.resolve(undefined),
    prisma.store.findMany({ orderBy: { name: "asc" } }),
    prisma.receipt.findMany({
      where: isAdmin ? {} : { userId: user.id },
      orderBy: { purchaseDate: "asc" },
    }),
    prisma.receiptItem.findMany({
      where: isAdmin ? {} : { receipt: { userId: user.id } },
      orderBy: { id: "asc" },
    }),
    prisma.monthlyBudget.findMany({
      where: isAdmin ? {} : { userId: user.id },
      orderBy: { category: "asc" },
    }),
    isAdmin
      ? prisma.systemSetting.findMany({ orderBy: { key: "asc" } })
      : Promise.resolve(undefined),
  ]);

  const productIds = Array.from(
    new Set(
      receiptItems
        .map((i) => i.productId)
        .filter((id): id is string => Boolean(id))
    )
  );

  const [products, productAliases] = await Promise.all([
    isAdmin
      ? prisma.product.findMany({ orderBy: { displayName: "asc" } })
      : productIds.length > 0
      ? prisma.product.findMany({
          where: { id: { in: productIds } },
          orderBy: { displayName: "asc" },
        })
      : Promise.resolve([]),
    isAdmin
      ? prisma.productAlias.findMany({ orderBy: { rawAlias: "asc" } })
      : productIds.length > 0
      ? prisma.productAlias.findMany({
          where: { productId: { in: productIds } },
          orderBy: { rawAlias: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const database: BackupDatabase = {
    ...(users
      ? {
          users: users.map((u) => ({
            id: u.id,
            username: u.username,
            password: u.password,
            role: u.role as "USER" | "ADMIN",
            enabled: u.enabled,
            createdAt: u.createdAt.toISOString(),
          })),
        }
      : {}),
    stores: stores.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      brandHex: s.brandHex,
    })),
    products: products.map((p) => ({
      id: p.id,
      slug: p.slug,
      displayName: p.displayName,
      category: p.category,
      baseUnit: p.baseUnit as "KG" | "L" | "UNIT",
      isStaple: p.isStaple,
      nutriScore: p.nutriScore,
      novaGroup: p.novaGroup,
      proteinPer100g: p.proteinPer100g !== null ? Number(p.proteinPer100g) : null,
      kcalPer100g: p.kcalPer100g !== null ? Number(p.kcalPer100g) : null,
      ean: p.ean,
      nutritionSource: p.nutritionSource,
      nutritionUpdatedAt: p.nutritionUpdatedAt
        ? p.nutritionUpdatedAt.toISOString()
        : null,
      createdAt: p.createdAt.toISOString(),
    })),
    productAliases: productAliases.map((a) => ({
      id: a.id,
      rawAlias: a.rawAlias,
      storeId: a.storeId,
      productId: a.productId,
      unitMeasurePerPack:
        a.unitMeasurePerPack !== null ? Number(a.unitMeasurePerPack) : null,
      isVariableWeight: a.isVariableWeight,
      barcode: a.barcode,
      createdAt: a.createdAt.toISOString(),
    })),
    receipts: receipts.map((r) => ({
      id: r.id,
      userId: r.userId,
      storeId: r.storeId,
      purchaseDate: r.purchaseDate.toISOString(),
      totalAmount: r.totalAmount !== null ? Number(r.totalAmount) : null,
      sourceFile: r.sourceFile,
      fileHash: r.fileHash,
      externalTicketId: r.externalTicketId,
      aiProvider: r.aiProvider,
      processingMs: r.processingMs,
      status: r.status as
        | "PENDING"
        | "PROCESSING"
        | "REVIEW"
        | "CONFIRMED"
        | "FAILED",
      errorMessage: r.errorMessage,
      taxBreakdown: r.taxBreakdown,
      createdAt: r.createdAt.toISOString(),
    })),
    receiptItems: receiptItems.map((i) => ({
      id: i.id,
      receiptId: i.receiptId,
      productId: i.productId,
      rawName: i.rawName,
      suggestedName: i.suggestedName,
      suggestedCat: i.suggestedCat,
      matchConfidence: Number(i.matchConfidence),
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      totalPrice: Number(i.totalPrice),
      baseUnit: i.baseUnit as "KG" | "L" | "UNIT",
      unitMeasure: Number(i.unitMeasure),
      pricePerBaseUnit: Number(i.pricePerBaseUnit),
      isDiscount: i.isDiscount,
      excluded: i.excluded,
      confirmed: i.confirmed,
    })),
    monthlyBudgets: monthlyBudgets.map((b) => ({
      id: b.id,
      userId: b.userId,
      category: b.category,
      monthlyTarget: Number(b.monthlyTarget),
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    })),
    ...(systemSettings
      ? {
          systemSettings: systemSettings.map((s) => ({
            key: s.key,
            value: s.value,
            updatedAt: s.updatedAt.toISOString(),
          })),
        }
      : {}),
  };

  // Collect all physical receipt artifacts from UPLOAD_DIR
  const candidateFilenames = new Set<string>();
  for (const r of receipts) {
    candidateFilenames.add(`${r.id}.webp`);
    candidateFilenames.add(`${r.id}.pdf`);
    candidateFilenames.add(`${r.id}.json`);
    if (r.sourceFile && r.sourceFile !== "temp") {
      candidateFilenames.add(path.basename(r.sourceFile));
    }
  }

  const artifactEntries: Array<{ name: string; data: Buffer; compress: boolean }> = [];
  const artifactChecksums: Record<string, string> = {};

  for (const fname of Array.from(candidateFilenames).sort()) {
    if (!SAFE_ARTIFACT_FILENAME_RE.test(fname)) continue;
    let resolvedPath: string;
    try {
      resolvedPath = getReceiptFilePath(fname);
    } catch {
      continue;
    }
    if (!fs.existsSync(resolvedPath)) continue;

    try {
      const stat = await fs.promises.stat(resolvedPath);
      if (!stat.isFile()) continue;
      const data = await fs.promises.readFile(resolvedPath);
      artifactChecksums[fname] = sha256Hex(data);
      artifactEntries.push({
        name: `uploads/${fname}`,
        data,
        compress: fname.toLowerCase().endsWith(".json"),
      });
    } catch {
      // Skip unreadable file safely
    }
  }

  const dbBuffer = Buffer.from(JSON.stringify(database, null, 2), "utf8");
  const exportedAt = new Date().toISOString();

  const manifest: BackupManifest = {
    formatVersion: BACKUP_FORMAT_VERSION,
    scope,
    exportedAt,
    appVersion: APP_VERSION,
    exportedBy: {
      userId: user.id,
      username: user.username,
      role: user.role,
    },
    counts: {
      users: database.users?.length ?? 0,
      stores: database.stores.length,
      products: database.products.length,
      productAliases: database.productAliases.length,
      receipts: database.receipts.length,
      receiptItems: database.receiptItems.length,
      monthlyBudgets: database.monthlyBudgets.length,
      artifacts: artifactEntries.length,
    },
    checksums: {
      databaseSha256: sha256Hex(dbBuffer),
      artifacts: artifactChecksums,
    },
  };

  const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");

  const zipBuffer = createZipBuffer([
    { name: "manifest.json", data: manifestBuffer, compress: true },
    { name: "database.json", data: dbBuffer, compress: true },
    ...artifactEntries,
  ]);

  const datePart = exportedAt.slice(0, 10);
  const filename = `ticketera-backup-${datePart}.zip`;

  return { buffer: zipBuffer, filename, manifest };
}

/**
 * Performs a read-only validation and dry-run comparison against the active PostgreSQL database.
 */
export async function inspectBackupPayload(params: {
  buffer: Buffer;
  filename: string;
}): Promise<BackupInspectionResult> {
  const parsed = parseAndVerifyBackupPayload(params.buffer, params.filename);

  const [existingReceipts, existingProducts, existingStores] = await Promise.all([
    prisma.receipt.findMany({
      select: { fileHash: true, externalTicketId: true },
    }),
    prisma.product.findMany({
      select: { slug: true },
    }),
    prisma.store.findMany({
      select: { slug: true },
    }),
  ]);

  const existingHashes = new Set(existingReceipts.map((r) => r.fileHash));
  const existingExternalIds = new Set(
    existingReceipts
      .map((r) => r.externalTicketId)
      .filter((id): id is string => Boolean(id))
  );
  const existingProductSlugs = new Set(existingProducts.map((p) => p.slug));
  const existingStoreSlugs = new Set(existingStores.map((s) => s.slug));

  let duplicateReceipts = 0;
  let newReceipts = 0;
  for (const r of parsed.database.receipts) {
    if (
      existingHashes.has(r.fileHash) ||
      (r.externalTicketId && existingExternalIds.has(r.externalTicketId))
    ) {
      duplicateReceipts++;
    } else {
      newReceipts++;
    }
  }

  let existingProductsCount = 0;
  let newProductsCount = 0;
  for (const p of parsed.database.products) {
    if (existingProductSlugs.has(p.slug)) {
      existingProductsCount++;
    } else {
      newProductsCount++;
    }
  }

  let newStoresCount = 0;
  for (const s of parsed.database.stores) {
    if (!existingStoreSlugs.has(s.slug)) {
      newStoresCount++;
    }
  }

  let totalArtifactBytes = 0;
  for (const buf of parsed.artifacts.values()) {
    totalArtifactBytes += buf.length;
  }

  return {
    formatVersion: parsed.formatVersion,
    kind: parsed.kind,
    scope: parsed.scope,
    exportedAt: parsed.exportedAt,
    checksumsVerified: parsed.checksumsVerified,
    receiptsCount: parsed.database.receipts.length,
    newReceipts,
    duplicateReceipts,
    productsCount: parsed.database.products.length,
    newProducts: newProductsCount,
    existingProducts: existingProductsCount,
    storesCount: parsed.database.stores.length,
    newStores: newStoresCount,
    budgetsCount: parsed.database.monthlyBudgets.length,
    artifactFilesCount: parsed.artifacts.size,
    totalArtifactBytes,
    warnings: parsed.warnings,
  };
}

/**
 * Atomically restores database records and UPLOAD_DIR receipt artifacts from a verified backup payload.
 */
export async function executeBackupRestore(params: {
  buffer: Buffer;
  filename: string;
  adminUser: AuthenticatedUser;
  mode: "merge" | "replace";
  confirmReplace?: string;
}): Promise<BackupRestoreResult> {
  const { buffer, filename, adminUser, mode, confirmReplace } = params;

  if (mode === "replace" && confirmReplace !== "RESTORE") {
    throw new Error(
      'Full replace restore requires typing "RESTORE" to confirm overwriting current records.'
    );
  }

  const parsed = parseAndVerifyBackupPayload(buffer, filename);
  const { database, artifacts, warnings } = parsed;
  const artifactRenameMap = new Map<string, string>();
  const skipArtifactIds = new Set<string>();

  let restoredReceipts = 0;
  let skippedReceipts = 0;
  let restoredProducts = 0;
  let restoredAliases = 0;
  let restoredBudgets = 0;

  await prisma.$transaction(
    async (tx) => {
      if (mode === "replace") {
        await tx.receiptItem.deleteMany({});
        await tx.receipt.deleteMany({});
        await tx.productAlias.deleteMany({});
        await tx.product.deleteMany({});
        await tx.monthlyBudget.deleteMany({});
      }

      // 1. Resolve Users (never overwrite existing passwords/roles; never delete active adminUser)
      const userIdMap = new Map<string, string>();
      const existingUsers = await tx.user.findMany({
        select: { id: true, username: true },
      });
      const existingByUsername = new Map(existingUsers.map((u) => [u.username, u.id]));
      const existingUserIds = new Set(existingUsers.map((u) => u.id));

      for (const bu of database.users || []) {
        const byNameId = existingByUsername.get(bu.username);
        if (byNameId) {
          userIdMap.set(bu.id, byNameId);
        } else {
          const targetId = existingUserIds.has(bu.id) ? crypto.randomUUID() : bu.id;
          const created = await tx.user.create({
            data: {
              id: targetId,
              username: bu.username,
              password: bu.password,
              role: bu.role,
              enabled: bu.enabled,
              ...(bu.createdAt ? { createdAt: new Date(bu.createdAt) } : {}),
            },
          });
          userIdMap.set(bu.id, created.id);
          existingByUsername.set(created.username, created.id);
          existingUserIds.add(created.id);
        }
      }

      // 2. Resolve Stores
      const storeIdMap = new Map<string, string>();
      const existingStores = await tx.store.findMany();
      const storeBySlug = new Map(existingStores.map((s) => [s.slug, s]));
      const existingStoreIds = new Set(existingStores.map((s) => s.id));

      for (const bs of database.stores) {
        const existing = storeBySlug.get(bs.slug);
        if (existing) {
          storeIdMap.set(bs.id, existing.id);
        } else {
          const targetId = existingStoreIds.has(bs.id) ? crypto.randomUUID() : bs.id;
          const created = await tx.store.create({
            data: {
              id: targetId,
              name: bs.name,
              slug: bs.slug,
              brandHex: bs.brandHex,
            },
          });
          storeIdMap.set(bs.id, created.id);
          storeBySlug.set(created.slug, created);
          existingStoreIds.add(created.id);
        }
      }

      // 3. Resolve Products
      const productIdMap = new Map<string, string>();
      const existingProducts = await tx.product.findMany();
      const productBySlug = new Map(existingProducts.map((p) => [p.slug, p]));
      const existingProductIds = new Set(existingProducts.map((p) => p.id));

      for (const bp of database.products) {
        const existing = productBySlug.get(bp.slug);
        if (existing) {
          productIdMap.set(bp.id, existing.id);
          // Backfill null nutrition/EAN metadata in merge mode
          const patch: Prisma.ProductUpdateInput = {};
          if (!existing.isStaple && bp.isStaple) patch.isStaple = true;
          if (!existing.nutriScore && bp.nutriScore) patch.nutriScore = bp.nutriScore;
          if (existing.novaGroup === null && bp.novaGroup != null) {
            patch.novaGroup = bp.novaGroup;
          }
          if (existing.proteinPer100g === null && bp.proteinPer100g != null) {
            patch.proteinPer100g = new Prisma.Decimal(bp.proteinPer100g);
          }
          if (existing.kcalPer100g === null && bp.kcalPer100g != null) {
            patch.kcalPer100g = new Prisma.Decimal(bp.kcalPer100g);
          }
          if (!existing.ean && bp.ean) patch.ean = bp.ean;
          if (!existing.nutritionUpdatedAt && bp.nutritionUpdatedAt) {
            patch.nutritionSource = bp.nutritionSource || "openfoodfacts";
            patch.nutritionUpdatedAt = new Date(bp.nutritionUpdatedAt);
          }
          if (Object.keys(patch).length > 0) {
            await tx.product.update({ where: { id: existing.id }, data: patch });
          }
        } else {
          const targetId = existingProductIds.has(bp.id)
            ? crypto.randomUUID()
            : bp.id;
          const created = await tx.product.create({
            data: {
              id: targetId,
              slug: bp.slug,
              displayName: bp.displayName,
              category: bp.category,
              baseUnit: bp.baseUnit,
              isStaple: bp.isStaple,
              nutriScore: bp.nutriScore ?? null,
              novaGroup: bp.novaGroup ?? null,
              proteinPer100g:
                bp.proteinPer100g != null
                  ? new Prisma.Decimal(bp.proteinPer100g)
                  : null,
              kcalPer100g:
                bp.kcalPer100g != null ? new Prisma.Decimal(bp.kcalPer100g) : null,
              ean: bp.ean ?? null,
              nutritionSource: bp.nutritionSource ?? null,
              nutritionUpdatedAt: bp.nutritionUpdatedAt
                ? new Date(bp.nutritionUpdatedAt)
                : null,
              ...(bp.createdAt ? { createdAt: new Date(bp.createdAt) } : {}),
            },
          });
          productIdMap.set(bp.id, created.id);
          productBySlug.set(created.slug, created);
          existingProductIds.add(created.id);
          restoredProducts++;
        }
      }

      // 4. Resolve ProductAliases
      const existingAliases = await tx.productAlias.findMany({
        select: { id: true, storeId: true, rawAlias: true, barcode: true },
      });
      const existingAliasMap = new Map(
        existingAliases.map((a) => [`${a.storeId}__${a.rawAlias}`, a])
      );
      const existingAliasIds = new Set(existingAliases.map((a) => a.id));

      for (const ba of database.productAliases) {
        const mappedStoreId = storeIdMap.get(ba.storeId);
        const mappedProductId = productIdMap.get(ba.productId);
        if (!mappedStoreId || !mappedProductId) continue;

        const key = `${mappedStoreId}__${ba.rawAlias}`;
        const existing = existingAliasMap.get(key);
        if (existing) {
          if (!existing.barcode && ba.barcode) {
            await tx.productAlias.update({
              where: { id: existing.id },
              data: { barcode: ba.barcode },
            });
          }
          continue;
        }

        const targetId = existingAliasIds.has(ba.id) ? crypto.randomUUID() : ba.id;
        await tx.productAlias.create({
          data: {
            id: targetId,
            rawAlias: ba.rawAlias,
            storeId: mappedStoreId,
            productId: mappedProductId,
            unitMeasurePerPack:
              ba.unitMeasurePerPack != null
                ? new Prisma.Decimal(ba.unitMeasurePerPack)
                : null,
            isVariableWeight: ba.isVariableWeight,
            barcode: ba.barcode ?? null,
            ...(ba.createdAt ? { createdAt: new Date(ba.createdAt) } : {}),
          },
        });
        existingAliasIds.add(targetId);
        existingAliasMap.set(key, {
          id: targetId,
          storeId: mappedStoreId,
          rawAlias: ba.rawAlias,
          barcode: ba.barcode ?? null,
        });
        restoredAliases++;
      }

      // 5. Resolve Receipts & ReceiptItems
      const existingReceipts = await tx.receipt.findMany({
        select: { id: true, fileHash: true, externalTicketId: true },
      });
      const existingReceiptIds = new Set(existingReceipts.map((r) => r.id));
      const existingHashes = new Set(existingReceipts.map((r) => r.fileHash));
      const existingExternalIds = new Set(
        existingReceipts
          .map((r) => r.externalTicketId)
          .filter((id): id is string => Boolean(id))
      );

      const itemsByReceiptId = new Map<
        string,
        Array<z.infer<typeof BackupReceiptItemSchema>>
      >();
      for (const item of database.receiptItems) {
        const list = itemsByReceiptId.get(item.receiptId) || [];
        list.push(item);
        itemsByReceiptId.set(item.receiptId, list);
      }

      for (const r of database.receipts) {
        const isDuplicate =
          existingHashes.has(r.fileHash) ||
          (r.externalTicketId && existingExternalIds.has(r.externalTicketId));
        if (isDuplicate) {
          skippedReceipts++;
          skipArtifactIds.add(r.id);
          continue;
        }

        const mappedUserId = userIdMap.get(r.userId) || adminUser.id;
        const mappedStoreId = storeIdMap.get(r.storeId);
        if (!mappedStoreId) {
          skippedReceipts++;
          continue;
        }

        let targetReceiptId = r.id;
        let targetSourceFile = path.basename(r.sourceFile || `${r.id}.webp`);
        if (existingReceiptIds.has(r.id)) {
          targetReceiptId = crypto.randomUUID();
          for (const ext of ["webp", "pdf", "json"]) {
            artifactRenameMap.set(`${r.id}.${ext}`, `${targetReceiptId}.${ext}`);
          }
          if (targetSourceFile.startsWith(`${r.id}.`)) {
            targetSourceFile = `${targetReceiptId}${targetSourceFile.slice(
              r.id.length
            )}`;
          }
        }

        await tx.receipt.create({
          data: {
            id: targetReceiptId,
            userId: mappedUserId,
            storeId: mappedStoreId,
            purchaseDate: new Date(r.purchaseDate),
            totalAmount:
              r.totalAmount != null ? new Prisma.Decimal(r.totalAmount) : null,
            sourceFile: targetSourceFile,
            fileHash: r.fileHash,
            externalTicketId: r.externalTicketId ?? null,
            aiProvider: r.aiProvider ?? null,
            processingMs: r.processingMs ?? null,
            status: r.status,
            errorMessage: r.errorMessage ?? null,
            taxBreakdown:
              r.taxBreakdown !== undefined && r.taxBreakdown !== null
                ? (r.taxBreakdown as Prisma.InputJsonValue)
                : Prisma.DbNull,
            ...(r.createdAt ? { createdAt: new Date(r.createdAt) } : {}),
          },
        });

        existingReceiptIds.add(targetReceiptId);
        existingHashes.add(r.fileHash);
        if (r.externalTicketId) existingExternalIds.add(r.externalTicketId);

        const rItems = itemsByReceiptId.get(r.id) || [];
        if (rItems.length > 0) {
          await tx.receiptItem.createMany({
            data: rItems.map((it) => ({
              id:
                mode === "replace"
                  ? it.id
                  : `${targetReceiptId}-${crypto.randomUUID().slice(0, 8)}`,
              receiptId: targetReceiptId,
              productId: it.productId ? productIdMap.get(it.productId) ?? null : null,
              rawName: it.rawName,
              suggestedName: it.suggestedName,
              suggestedCat: it.suggestedCat ?? null,
              matchConfidence: it.matchConfidence,
              quantity: new Prisma.Decimal(it.quantity),
              unitPrice: new Prisma.Decimal(it.unitPrice),
              totalPrice: new Prisma.Decimal(it.totalPrice),
              baseUnit: it.baseUnit,
              unitMeasure: new Prisma.Decimal(it.unitMeasure),
              pricePerBaseUnit: new Prisma.Decimal(it.pricePerBaseUnit),
              isDiscount: it.isDiscount,
              excluded: it.excluded,
              confirmed: it.confirmed,
            })),
          });
        }

        restoredReceipts++;
      }

      // 6. Resolve MonthlyBudgets
      const existingBudgets = await tx.monthlyBudget.findMany({
        select: { userId: true, category: true },
      });
      const existingBudgetKeys = new Set(
        existingBudgets.map((b) => `${b.userId}__${b.category}`)
      );

      for (const mb of database.monthlyBudgets) {
        const mappedUserId = userIdMap.get(mb.userId) || adminUser.id;
        const bKey = `${mappedUserId}__${mb.category}`;
        if (existingBudgetKeys.has(bKey)) continue;

        await tx.monthlyBudget.create({
          data: {
            userId: mappedUserId,
            category: mb.category,
            monthlyTarget: new Prisma.Decimal(mb.monthlyTarget),
          },
        });
        existingBudgetKeys.add(bKey);
        restoredBudgets++;
      }

      // 7. Resolve SystemSettings
      if (database.systemSettings && database.systemSettings.length > 0) {
        for (const s of database.systemSettings) {
          if (mode === "replace") {
            await tx.systemSetting.upsert({
              where: { key: s.key },
              update: { value: s.value },
              create: { key: s.key, value: s.value },
            });
          } else {
            const exists = await tx.systemSetting.findUnique({
              where: { key: s.key },
            });
            if (!exists) {
              await tx.systemSetting.create({
                data: { key: s.key, value: s.value },
              });
            }
          }
        }
      }
    },
    { timeout: 60000 }
  );

  // Sync in-memory settings (e.g. PUBLIC_CATALOG)
  await loadSystemSettings().catch(() => null);

  // Write validated receipt artifacts to UPLOAD_DIR atomically
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  let restoredArtifacts = 0;
  for (const [origFname, data] of artifacts.entries()) {
    const dotIdx = origFname.lastIndexOf(".");
    const baseId = dotIdx > 0 ? origFname.slice(0, dotIdx) : origFname;

    if (mode === "merge" && skipArtifactIds.has(baseId)) {
      continue;
    }

    const targetFname = artifactRenameMap.get(origFname) || origFname;
    if (!SAFE_ARTIFACT_FILENAME_RE.test(targetFname)) continue;

    let destPath: string;
    try {
      destPath = getReceiptFilePath(targetFname);
    } catch {
      continue;
    }

    if (mode === "merge" && fs.existsSync(destPath)) {
      continue;
    }

    const tmpPath = `${destPath}.tmp-${crypto.randomUUID().slice(0, 8)}`;
    await fs.promises.writeFile(tmpPath, data);
    await fs.promises.rename(tmpPath, destPath);
    restoredArtifacts++;
  }

  return {
    mode,
    restoredReceipts,
    skippedReceipts,
    restoredProducts,
    restoredAliases,
    restoredBudgets,
    restoredArtifacts,
    warnings,
  };
}
