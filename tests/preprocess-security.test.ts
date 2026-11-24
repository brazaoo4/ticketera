import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import {
  assertSafeReceiptId,
  compressReceiptImage,
  getReceiptArtifactPath,
  getReceiptFilePath,
  UPLOAD_DIR,
} from "../src/lib/receipts/preprocess";

test("assertSafeReceiptId accepts valid IDs and rejects traversal or special characters", () => {
  assert.equal(assertSafeReceiptId("cmwnsg20w000i01abc123"), "cmwnsg20w000i01abc123");
  assert.equal(assertSafeReceiptId("test-dia_1795082400"), "test-dia_1795082400");

  for (const invalid of [
    "",
    "../secret",
    "a/b",
    "a\\b",
    "id.with.dots",
    "id with spaces",
    "a".repeat(129),
  ]) {
    assert.throws(() => assertSafeReceiptId(invalid), /Invalid receipt identifier/);
  }
});

test("getReceiptArtifactPath and getReceiptFilePath enforce UPLOAD_DIR containment", () => {
  const expectedPrefix = path.resolve(UPLOAD_DIR) + path.sep;
  const webpPath = getReceiptArtifactPath("cmwnsg20w000i01abc123", "webp");
  assert.ok(webpPath.startsWith(expectedPrefix));
  assert.ok(webpPath.endsWith("cmwnsg20w000i01abc123.webp"));

  assert.throws(() => getReceiptArtifactPath("../etc/passwd", "json"), /Invalid receipt identifier/);
  assert.throws(() => getReceiptFilePath(".."), /Invalid file path traversal attempt/);
  assert.throws(() => getReceiptFilePath("."), /Invalid file path traversal attempt/);
  assert.throws(() => getReceiptFilePath("foo..bar.webp"), /Invalid file path traversal attempt/);
});

test("compressReceiptImage rejects invalid receiptId before touching filesystem", async () => {
  await assert.rejects(
    () => compressReceiptImage("../outside"),
    /Invalid receipt identifier/
  );
});
