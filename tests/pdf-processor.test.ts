import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { extractTextFromPdf, renderPdfToImage } from "../src/lib/receipts/pdf-extract";
import { preprocessReceipt, UPLOAD_DIR } from "../src/lib/receipts/preprocess";

const FIXTURE_PATH = path.join(__dirname, "fixtures", "sample-dia.pdf");

test("extractTextFromPdf returns null on image-based Dia PDF (no synthetic joiners)", async (t) => {
  if (!fs.existsSync(FIXTURE_PATH)) {
    t.skip("sample-dia.pdf fixture not present in environment");
    return;
  }
  const buf = await fs.promises.readFile(FIXTURE_PATH);
  const text = await extractTextFromPdf(buf);

  // Dia receipts are bitmap images inside a PDF, so extractTextFromPdf must return null
  // and NOT return fake joiner strings like "-- 1 of 1 --"
  assert.equal(text, null);
});

test("extractTextFromPdf safely returns null on invalid or empty buffer", async () => {
  const emptyBuf = Buffer.from("");
  const res = await extractTextFromPdf(emptyBuf);
  assert.equal(res, null);

  const corruptedBuf = Buffer.from("%PDF-1.5 corrupted content without proper objects");
  const corruptedRes = await extractTextFromPdf(corruptedBuf);
  assert.equal(corruptedRes, null);
});

test("renderPdfToImage rasterizes Dia PDF to high-res, optimized WebP", async (t) => {
  if (!fs.existsSync(FIXTURE_PATH)) {
    t.skip("sample-dia.pdf fixture not present in environment");
    return;
  }
  const buf = await fs.promises.readFile(FIXTURE_PATH);
  const webpBuf = await renderPdfToImage(buf);

  assert.ok(Buffer.isBuffer(webpBuf));
  assert.ok(webpBuf.length > 50_000, "Rendered WebP should contain substantial image data");
  assert.ok(webpBuf.length < 1_000_000, "Rendered WebP should be well-compressed under 1MB");

  const metadata = await sharp(webpBuf).metadata();
  assert.equal(metadata.format, "webp");
  assert.ok(metadata.width && metadata.width >= 700, "Width should be high resolution for OCR");
  assert.ok(metadata.height && metadata.height >= 2000, "Height should capture long receipt");
});

test("preprocessReceipt creates both pristine PDF and companion WebP for PDF uploads", async (t) => {
  if (!fs.existsSync(FIXTURE_PATH)) {
    t.skip("sample-dia.pdf fixture not present in environment");
    return;
  }
  const testId = `test-pdf-${Date.now()}`;
  const buf = await fs.promises.readFile(FIXTURE_PATH);

  const result = await preprocessReceipt(testId, buf, "application/pdf");

  assert.equal(result.mimeType, "image/webp");
  assert.equal(result.sourceFile, `${testId}.webp`);
  assert.ok(result.processedBuffer.length > 50_000);

  const originalPdfPath = path.join(UPLOAD_DIR, `${testId}.pdf`);
  const companionWebpPath = path.join(UPLOAD_DIR, `${testId}.webp`);

  assert.ok(fs.existsSync(originalPdfPath), "Original PDF must be preserved on disk");
  assert.ok(fs.existsSync(companionWebpPath), "Rendered WebP must be created on disk");

  // Cleanup test artifacts
  await fs.promises.unlink(originalPdfPath).catch(() => null);
  await fs.promises.unlink(companionWebpPath).catch(() => null);
});
