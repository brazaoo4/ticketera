import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import {
  DiaSessionExpiredError,
  parseDiaAuthInput,
  getDiaAccountLabel,
  getDiaJwtExpiration,
} from "../src/lib/integrations/dia/client";
import {
  getDiaSyncIntervalMinutes,
  isDiaAuthError,
  resolveDiaSyncFailureDecision,
} from "../src/lib/integrations/dia/sync-policy";
import {
  encryptVaultJson,
  decryptVaultJson,
} from "../src/lib/crypto/vault";
import { renderDiaTicketToWebp } from "../src/lib/integrations/dia/render-ticket";
import { inferSpanishGroceryCategory } from "../src/lib/integrations/dia/importer";
import { DiaTicketDetailResponse, DiaTicketSummary } from "../src/lib/integrations/dia/types";
import { UPLOAD_DIR } from "../src/lib/receipts/preprocess";

test("parseDiaAuthInput correctly parses Windows CMD cURL input", () => {
  const input = `curl --url ^"https://www.dia.es/api/v3/eservice-back/customer/current/tickets/166477^" -b ^"session_id=01bc658c-5fca-48b7-887d-136d445ed38b; customer_access=fake-jwt-token; customer_code=JTIH3UXrr3tX0EYUxsl4TgpBQU8psJFljIOIAHN8xhC4zdNznuw=^"`;
  const creds = parseDiaAuthInput(input);
  assert.equal(creds.sessionId, "01bc658c-5fca-48b7-887d-136d445ed38b");
  assert.equal(creds.customerAccess, "fake-jwt-token");
  assert.equal(creds.customerCode, "JTIH3UXrr3tX0EYUxsl4TgpBQU8psJFljIOIAHN8xhC4zdNznuw=");
});

test("parseDiaAuthInput correctly parses Bash cURL input with single quotes", () => {
  const input = `curl 'https://www.dia.es/api/v3/eservice-back/customer/current/tickets' -H 'Cookie: session_id=sess-123; customer_access=jwt-456; customer_code=code-789'`;
  const creds = parseDiaAuthInput(input);
  assert.equal(creds.sessionId, "sess-123");
  assert.equal(creds.customerAccess, "jwt-456");
  assert.equal(creds.customerCode, "code-789");
});

test("parseDiaAuthInput correctly parses raw cookie header string", () => {
  const input = `session_id=sess-abc; customer_access=jwt-xyz; customer_code=code-123; other_cookie=ignored`;
  const creds = parseDiaAuthInput(input);
  assert.equal(creds.sessionId, "sess-abc");
  assert.equal(creds.customerAccess, "jwt-xyz");
  assert.equal(creds.customerCode, "code-123");
});

test("parseDiaAuthInput correctly parses JSON string payload", () => {
  const input = JSON.stringify({
    sessionId: "sess-json",
    customerAccess: "jwt-json",
    customerCode: "code-json",
  });
  const creds = parseDiaAuthInput(input);
  assert.equal(creds.sessionId, "sess-json");
  assert.equal(creds.customerAccess, "jwt-json");
  assert.equal(creds.customerCode, "code-json");
});

test("parseDiaAuthInput throws descriptive error when mandatory tokens are missing", () => {
  assert.throws(
    () => parseDiaAuthInput("session_id=only-session"),
    /Missing .*credentials/
  );
});

test("parseDiaAuthInput correctly parses PowerShell WebRequestSession Cookie syntax", () => {
  const input = `
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$session.Cookies.Add((New-Object System.Net.Cookie("session_id", "ps-sess-111", "/", ".dia.es")))
$session.Cookies.Add((New-Object System.Net.Cookie("customer_access", "ps-jwt-222", "/", ".dia.es")))
$session.Cookies.Add((New-Object System.Net.Cookie("customer_code", "ps-code-333=", "/", ".dia.es")))
Invoke-WebRequest -UseBasicParsing -Uri "https://www.dia.es/api/v3/eservice-back/customer/current/tickets" -WebSession $session
  `;
  const creds = parseDiaAuthInput(input);
  assert.equal(creds.sessionId, "ps-sess-111");
  assert.equal(creds.customerAccess, "ps-jwt-222");
  assert.equal(creds.customerCode, "ps-code-333=");
});

test("parseDiaAuthInput correctly parses DevTools table / key: value lines", () => {
  const input = `
session_id: kv-sess-001
customer_access: kv-jwt-002
customer_code\tkv-code-003=
  `;
  const creds = parseDiaAuthInput(input);
  assert.equal(creds.sessionId, "kv-sess-001");
  assert.equal(creds.customerAccess, "kv-jwt-002");
  assert.equal(creds.customerCode, "kv-code-003=");
});

test("inferSpanishGroceryCategory classifies Spanish POS items and discount hints", () => {
  assert.equal(inferSpanishGroceryCategory("PECHUGA POLLO ENTERA"), "Meat & Poultry");
  assert.equal(inferSpanishGroceryCategory("CARNE PICADA VACUNO"), "Meat & Poultry");
  assert.equal(inferSpanishGroceryCategory("CERV BOT FRANZISKANE"), "Beverages");
  assert.equal(inferSpanishGroceryCategory("RED BULL SIN AZÚCAR"), "Beverages");
  assert.equal(inferSpanishGroceryCategory("HÉLICES COCCIÓN 3MIN"), "Pantry");
  assert.equal(inferSpanishGroceryCategory("GOMINOLAS MORAS"), "Pantry");
  assert.equal(inferSpanishGroceryCategory("SALSA AGRIDULCE MAGG"), "Oils & Condiments");
  assert.equal(
    inferSpanishGroceryCategory("PRODUCTO ESPECIAL", ["15 % Fruta y verdura"]),
    "Fruits & Vegetables"
  );
  assert.equal(inferSpanishGroceryCategory("BOLSA PLASTICO 70%"), "Other");
});

test("encryptVaultJson and decryptVaultJson perform authenticated roundtrip", () => {
  const data = {
    sessionId: "test-session",
    customerAccess: "test-jwt",
    customerCode: "test-code",
    randomVal: 42,
  };
  const encrypted = encryptVaultJson(data);
  assert.equal(typeof encrypted, "string");
  assert.notEqual(encrypted, JSON.stringify(data));

  const decrypted = decryptVaultJson<typeof data>(encrypted);
  assert.deepEqual(decrypted, data);
});

test("getDiaAccountLabel extracts displayName or JWT customer code", () => {
  // Test with valid mock JWT (header: {"alg":"none"}, payload: {"custom:customer_code":"1032187140","sub":"1032187140"})
  const mockJwt = "eyJhbGciOiJub25lIn0.eyJjdXN0b206Y3VzdG9tZXJfY29kZSI6IjEwMzIxODcxNDAiLCJzdWIiOiIxMDMyMTg3MTQwIn0.";
  const labelWithDisplayName = getDiaAccountLabel(mockJwt, "Bruno");
  assert.equal(labelWithDisplayName, "Bruno (#1032187140)");

  const labelWithoutDisplayName = getDiaAccountLabel(mockJwt);
  assert.equal(labelWithoutDisplayName, "Club Dia (#1032187140)");
});

test("renderDiaTicketToWebp outputs high-contrast legible companion WebP and JSON", async () => {
  const testId = `test-dia-${Date.now()}`;
  const mockSummary: DiaTicketSummary = {
    ticket_unique_code: "ES22057020016647720261031193046",
    submitted_date: "2026-10-31T19:30:46Z",
    total_amount: 25.66,
    online: false,
    pilot_invoice: false,
    return: false,
    store_info: {
      address: "PZ OTELO 3-D",
      city: "Sevilla",
      postal_code: "41009",
    },
    detail_params: {
      begin: 1793475046000,
      business: 1,
      country: "ES",
      pos: 2,
      store: 22057,
      ticket: 166477,
    },
  };

  const mockDetail: DiaTicketDetailResponse = {
    currency: "€",
    online: false,
    header: {
      cashier: 1,
      code: 166477,
      display_code: "166477",
      pos: 2,
      simplified_invoice: true,
      store_address: "PZ OTELO 3-D",
      store_code: 22057,
      submitted_date: "2026-10-31T19:30:46Z",
      ticket_unique_code: "ES22057020016647720261031193046",
    },
    payment: {
      payment_methods: [
        {
          amount: 25.66,
          change_amount: 0,
          payment_method: "TARJETA",
        },
      ],
      total_to_pay: 25.66,
    },
    amount: {
      employee_discount: 0,
      shipping_amount: 0,
      total_accumulated: 0,
      total_amount: 25.66,
      total_amount_without_discounts: 26.19,
      total_discounts: -0.53,
    },
    corporate: {
      amount: 25.66,
      info: {
        fiscal_code: "B90480971",
        name: "ALIMARA CREACIONES S.L.U.",
      },
      items: [
        {
          amount: 0.99,
          cancel: false,
          code: 105299,
          discounts: [
            {
              amount: -0.15,
              coupon: true,
              description: "15 % Fruta y verdura",
            },
          ],
          name: "ENSALAD 4 ESTACIONES",
          price_per_unit: 0.99,
          quantity: 1,
          tax: "A",
          variable_weight: false,
          weight: 0,
        },
        {
          amount: 5.6,
          cancel: false,
          code: 17936,
          name: "PECHUGA POLLO ENTERA",
          price_per_unit: 6.99,
          quantity: 1,
          tax: "B",
          variable_weight: true,
          weight: 0.801,
        },
      ],
      taxes: [
        {
          amount: 0.28,
          base_amount: 7.02,
          name: "SUPERREDUCIDO",
          rate: 4,
          tax: "A",
        },
      ],
    },
  };

  const { webpPath, jsonPath } = await renderDiaTicketToWebp(testId, mockSummary, mockDetail);
  assert.ok(fs.existsSync(webpPath), "WebP file must exist");
  assert.ok(fs.existsSync(jsonPath), "JSON file must exist");

  const meta = await sharp(webpPath).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 640);
  assert.ok(meta.height && meta.height > 600, "Height should accommodate ticket lines");

  // Cleanup test artifacts
  await fs.promises.unlink(webpPath).catch(() => {});
  await fs.promises.unlink(jsonPath).catch(() => {});
});

test("getDiaJwtExpiration extracts exp claim from valid JWTs and handles invalid inputs", () => {
  const payload = Buffer.from(JSON.stringify({ exp: 1800000000 })).toString("base64url");
  const jwt = `eyJhbGciOiJSUzI1NiJ9.${payload}.sig`;
  const exp = getDiaJwtExpiration(jwt);
  assert.ok(exp instanceof Date);
  assert.equal(exp.getTime(), 1800000000 * 1000);

  const noExpPayload = Buffer.from(JSON.stringify({ sub: "123" })).toString("base64url");
  assert.equal(getDiaJwtExpiration(`eyJhbGciOiJub25lIn0.${noExpPayload}.sig`), null);
  assert.equal(getDiaJwtExpiration("not-a-jwt"), null);
});

test("getDiaSyncIntervalMinutes defaults to 10 and clamps safely inside session TTL", () => {
  assert.equal(getDiaSyncIntervalMinutes(undefined), 10);
  assert.equal(getDiaSyncIntervalMinutes(""), 10);
  assert.equal(getDiaSyncIntervalMinutes("15"), 15);
  assert.equal(getDiaSyncIntervalMinutes("60"), 25);
  assert.equal(getDiaSyncIntervalMinutes("0"), 10);
  assert.equal(getDiaSyncIntervalMinutes("invalid"), 10);
});

test("isDiaAuthError and resolveDiaSyncFailureDecision require consecutive auth failures before REQUIRES_REAUTH", () => {
  assert.equal(isDiaAuthError(new DiaSessionExpiredError()), true);
  assert.equal(isDiaAuthError(new Error("Dia returned status 222")), true);
  assert.equal(isDiaAuthError(new Error("Dia returned status 403")), true);
  assert.equal(isDiaAuthError(new Error("Dia tickets request failed (502 Bad Gateway)")), false);

  // 1st auth failure enters grace retry instead of immediate lockout
  const firstAuthFail = resolveDiaSyncFailureDecision({
    currentStatus: "ACTIVE",
    previousFailures: 0,
    isAuthError: true,
  });
  assert.deepEqual(firstAuthFail, {
    nextStatus: "FAILED",
    nextFailures: 1,
    shouldScheduleGraceRetry: true,
  });

  // 2nd consecutive auth failure transitions to REQUIRES_REAUTH
  const secondAuthFail = resolveDiaSyncFailureDecision({
    currentStatus: "FAILED",
    previousFailures: 1,
    isAuthError: true,
  });
  assert.deepEqual(secondAuthFail, {
    nextStatus: "REQUIRES_REAUTH",
    nextFailures: 2,
    shouldScheduleGraceRetry: false,
  });

  // Manual retry while already REQUIRES_REAUTH stays REQUIRES_REAUTH immediately
  const alreadyExpired = resolveDiaSyncFailureDecision({
    currentStatus: "REQUIRES_REAUTH",
    previousFailures: 0,
    isAuthError: true,
  });
  assert.deepEqual(alreadyExpired, {
    nextStatus: "REQUIRES_REAUTH",
    nextFailures: 1,
    shouldScheduleGraceRetry: false,
  });

  // Repeated non-auth transient network/5xx failures never lock out into REQUIRES_REAUTH
  const transientFail = resolveDiaSyncFailureDecision({
    currentStatus: "FAILED",
    previousFailures: 4,
    isAuthError: false,
  });
  assert.deepEqual(transientFail, {
    nextStatus: "FAILED",
    nextFailures: 5,
    shouldScheduleGraceRetry: false,
  });
});
