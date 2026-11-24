import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { createZipBuffer, extractZipBuffer } from "../src/lib/backup/zip";
import {
  BACKUP_FORMAT_VERSION,
  normalizeLegacyJsonBackup,
  parseAndVerifyBackupPayload,
  validateArtifactFile,
} from "../src/lib/backup/bundle";

const WEBP_STUB = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);

test("ZIP writer/reader round-trips compressed JSON and uncompressed WebP artifacts", () => {
  const jsonBuf = Buffer.from(JSON.stringify({ hello: "ticketera", items: [1, 2, 3] }), "utf8");
  const zip = createZipBuffer([
    { name: "manifest.json", data: jsonBuf, compress: true },
    { name: "uploads/r1.webp", data: WEBP_STUB, compress: false },
  ]);

  const extracted = extractZipBuffer(zip);
  assert.equal(extracted.get("manifest.json")?.toString("utf8"), jsonBuf.toString("utf8"));
  assert.deepEqual(extracted.get("uploads/r1.webp"), WEBP_STUB);
});

test("ZIP reader rejects path traversal, CRC tampering, and oversized entries", () => {
  assert.throws(
    () => createZipBuffer([{ name: "../etc/passwd", data: Buffer.from("x") }]),
    /Path traversal/
  );
  assert.throws(
    () => createZipBuffer([{ name: "/abs/path.txt", data: Buffer.from("x") }]),
    /Absolute ZIP entry/
  );

  // CRC-32 tamper detection
  const zip = createZipBuffer([
    { name: "test.txt", data: Buffer.from("hello world"), compress: false },
  ]);
  const tampered = Buffer.from(zip);
  const idx = tampered.indexOf("hello world");
  assert.ok(idx > 0);
  tampered[idx] = 0x58; // 'X'
  assert.throws(() => extractZipBuffer(tampered), /CRC-32 checksum mismatch/);

  // Decompression bomb / maxEntryBytes protection
  const big = Buffer.alloc(1024, 0x41);
  const bigZip = createZipBuffer([{ name: "big.json", data: big, compress: true }]);
  assert.throws(
    () => extractZipBuffer(bigZip, { maxEntryBytes: 256 }),
    /exceeds per-file size limit/
  );
});

test("parseAndVerifyBackupPayload validates v3 ZIP bundles and legacy v2.0 JSON exports", () => {
  const database = {
    stores: [{ id: "s1", name: "Mercadona", slug: "mercadona", brandHex: "#00754A" }],
    products: [
      {
        id: "p1",
        slug: "leche-entera",
        displayName: "Leche Entera",
        category: "Dairy & Eggs",
        baseUnit: "L",
        isStaple: true,
        nutriScore: "b",
        novaGroup: 1,
        proteinPer100g: 3.2,
        kcalPer100g: 64,
        ean: "8480000105302",
      },
    ],
    productAliases: [],
    receipts: [
      {
        id: "r1",
        userId: "u1",
        storeId: "s1",
        purchaseDate: "2026-11-10T10:00:00.000Z",
        totalAmount: 1.9,
        sourceFile: "r1.webp",
        fileHash: "hash-r1",
        status: "CONFIRMED",
      },
    ],
    receiptItems: [
      {
        id: "i1",
        receiptId: "r1",
        productId: "p1",
        rawName: "LECHE ENTERA 1L",
        suggestedName: "Leche Entera",
        suggestedCat: "Dairy & Eggs",
        matchConfidence: 1.0,
        quantity: 2,
        unitPrice: 0.95,
        totalPrice: 1.9,
        baseUnit: "L",
        unitMeasure: 2,
        pricePerBaseUnit: 0.95,
        isDiscount: false,
        excluded: false,
        confirmed: true,
      },
    ],
    monthlyBudgets: [{ id: "b1", userId: "u1", category: "__OVERALL__", monthlyTarget: 350 }],
  };

  const dbBuf = Buffer.from(JSON.stringify(database), "utf8");
  const dbSha = crypto.createHash("sha256").update(dbBuf).digest("hex");
  const webpSha = crypto.createHash("sha256").update(WEBP_STUB).digest("hex");

  const manifest = {
    formatVersion: BACKUP_FORMAT_VERSION,
    scope: "user",
    exportedAt: "2026-11-24T12:00:00.000Z",
    appVersion: "2.5.0",
    exportedBy: { userId: "u1", username: "bruno", role: "ADMIN" },
    counts: {
      users: 0,
      stores: 1,
      products: 1,
      productAliases: 0,
      receipts: 1,
      receiptItems: 1,
      monthlyBudgets: 1,
      artifacts: 1,
    },
    checksums: {
      databaseSha256: dbSha,
      artifacts: { "r1.webp": webpSha },
    },
  };

  const bundleZip = createZipBuffer([
    { name: "manifest.json", data: Buffer.from(JSON.stringify(manifest)), compress: true },
    { name: "database.json", data: dbBuf, compress: true },
    { name: "uploads/r1.webp", data: WEBP_STUB, compress: false },
  ]);

  const verified = parseAndVerifyBackupPayload(bundleZip, "ticketera-backup.zip");
  assert.equal(verified.kind, "zip-v3");
  assert.equal(verified.checksumsVerified, true);
  assert.equal(verified.database.receipts.length, 1);
  assert.equal(verified.database.monthlyBudgets.length, 1);
  assert.equal(verified.artifacts.size, 1);

  // Artifact magic-byte rejection
  assert.throws(
    () => validateArtifactFile("bad.webp", Buffer.from("not-a-webp")),
    /WebP magic-byte verification/
  );
  assert.throws(
    () => validateArtifactFile("bad.exe", Buffer.from("MZ")),
    /Unsafe backup artifact filename/
  );

  // Legacy v2.0 JSON backup normalization
  const legacyNorm = normalizeLegacyJsonBackup({
    version: "2.0",
    userId: "u1",
    receipts: [
      {
        id: "r-old",
        purchaseDate: "2026-08-01T10:00:00.000Z",
        totalAmount: 3.6,
        store: { id: "s1", name: "Mercadona", slug: "mercadona", brandHex: "#00754A" },
        items: [
          {
            id: "i-old",
            rawName: "ARROZ REDONDO 1KG",
            suggestedName: "Arroz Redondo",
            category: "Pantry",
            quantity: 2,
            unitPrice: 1.8,
            totalPrice: 3.6,
            baseUnit: "KG",
            unitMeasure: 2,
            pricePerBaseUnit: 1.8,
            isDiscount: false,
            product: {
              id: "p-arroz",
              slug: "arroz-redondo",
              displayName: "Arroz Redondo",
              category: "Pantry",
              baseUnit: "KG",
              isStaple: true,
            },
          },
        ],
      },
    ],
  });
  assert.equal(legacyNorm.receipts.length, 1);
  assert.equal(legacyNorm.products.length, 1);
  assert.equal(legacyNorm.receiptItems.length, 1);
});
