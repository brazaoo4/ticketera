import test from "node:test";
import assert from "node:assert/strict";
import { detectDiaTokens } from "../src/lib/integrations/dia/tokens";

test("detectDiaTokens detects tokens from standard cookie string", () => {
  const raw = "session_id=123-abc; customer_access=eyJhbGciOi...; customer_code=CODE999";
  const res = detectDiaTokens(raw);
  assert.equal(res.isValid, true);
  assert.equal(res.sessionId, "123-abc");
  assert.equal(res.customerAccess, "eyJhbGciOi...");
  assert.equal(res.customerCode, "CODE999");
  assert.deepEqual(res.missingFields, []);
});

test("detectDiaTokens detects tokens from DevTools tab-separated table copy", () => {
  const raw = `
session_id\t123-abc\twww.dia.es\t/\t2026-11-04
customer_access\ttoken_xyz\twww.dia.es\t/\t2026-11-04
customer_code\tcode_123\twww.dia.es\t/\t2026-11-04
`;
  const res = detectDiaTokens(raw);
  assert.equal(res.isValid, true);
  assert.equal(res.sessionId, "123-abc");
  assert.equal(res.customerAccess, "token_xyz");
  assert.equal(res.customerCode, "code_123");
});

test("detectDiaTokens detects tokens from JSON input", () => {
  const raw = JSON.stringify({
    sessionId: "sess-1",
    customerAccess: "acc-1",
    customerCode: "cod-1",
  });
  const res = detectDiaTokens(raw);
  assert.equal(res.isValid, true);
  assert.equal(res.sessionId, "sess-1");
  assert.equal(res.customerAccess, "acc-1");
  assert.equal(res.customerCode, "cod-1");
});

test("detectDiaTokens reports missing tokens when incomplete", () => {
  const raw = "session_id=sess-only";
  const res = detectDiaTokens(raw);
  assert.equal(res.isValid, false);
  assert.equal(res.sessionId, "sess-only");
  assert.equal(res.customerAccess, null);
  assert.equal(res.customerCode, null);
  assert.ok(res.missingFields.includes("customer_access"));
  assert.ok(res.missingFields.includes("customer_code"));
});

test("detectDiaTokens handles empty input", () => {
  const res = detectDiaTokens("   ");
  assert.equal(res.isValid, false);
  assert.equal(res.sessionId, null);
  assert.equal(res.missingFields.length, 3);
});
