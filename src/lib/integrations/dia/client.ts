import {
  DiaAuthCredentials,
  DiaTicketDetailParams,
  DiaTicketDetailResponse,
  DiaTicketListResponse,
  DiaTicketSummary,
} from "@/lib/integrations/dia/types";

const DIA_BASE_URL = "https://www.dia.es/api/v3/eservice-back";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";

export class DiaSessionExpiredError extends Error {
  constructor(message = "Dia session has expired or requires re-authentication.") {
    super(message);
    this.name = "DiaSessionExpiredError";
  }
}

/**
 * Extracts and normalizes DiaAuthCredentials from any user-provided string format:
 * - Windows CMD cURL (`curl --url ^"https://...^" -b ^"...^"`)
 * - Bash cURL (`curl '...' -H 'cookie: ...'`)
 * - Raw Cookie header (`session_id=...; customer_access=...; customer_code=...`)
 * - JSON string (`{"sessionId": "...", ...}`)
 */
export function parseDiaAuthInput(rawInput: string): DiaAuthCredentials {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error("Empty credentials provided.");
  }

  // 1. Try parsing JSON format
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      const sessionId =
        parsed.sessionId || parsed.session_id || parsed.SESSION_ID;
      const customerAccess =
        parsed.customerAccess || parsed.customer_access || parsed.CUSTOMER_ACCESS;
      const customerCode =
        parsed.customerCode || parsed.customer_code || parsed.CUSTOMER_CODE;

      if (sessionId && customerAccess && customerCode) {
        return {
          sessionId: String(sessionId).trim(),
          customerAccess: String(customerAccess).trim(),
          customerCode: String(customerCode).trim(),
        };
      }
    } catch {
      // Continue to regex parsing
    }
  }

  // 2. Clean up Windows CMD escape characters (`^"`, `^^`, etc.) and multiline continuations
  const normalized = trimmed
    .replace(/\^\r?\n/g, " ")
    .replace(/\\\r?\n/g, " ")
    .replace(/\^([\"\'&%^])/g, "$1");

  // Helper regex to extract specific cookie value across cURL, PowerShell, DevTools table, or key=value/key:value
  const extractCookie = (name: string): string | null => {
    // 2a. PowerShell WebRequestSession format: Cookie("name", "value"...)
    const psRegex = new RegExp(
      `Cookie\\(\\s*["']${name}["']\\s*,\\s*["']([^"']+)["']`,
      "i"
    );
    const psMatch = normalized.match(psRegex);
    if (psMatch?.[1]) return psMatch[1].trim();

    // 2b. Standard cookie / header / key=value / key:value / DevTools tab-separated row
    const stdRegex = new RegExp(
      `(?:^|[;\\s\"\'&])${name}\\s*(?:=|:|\\t)\\s*([^;\"\'\\s\\r\\n&]+)`,
      "i"
    );
    const stdMatch = normalized.match(stdRegex);
    return stdMatch?.[1] ? stdMatch[1].trim() : null;
  };

  const sessionId = extractCookie("session_id");
  const customerAccess = extractCookie("customer_access");
  const customerCode = extractCookie("customer_code");

  if (!sessionId) {
    throw new Error(
      "Missing `session_id` in credentials. Please ensure your cookie string or cURL includes `session_id=...`."
    );
  }
  if (!customerAccess) {
    throw new Error(
      "Missing `customer_access` in credentials. Please ensure your cookie string or cURL includes `customer_access=...`."
    );
  }
  if (!customerCode) {
    throw new Error(
      "Missing `customer_code` in credentials. Please ensure your cookie string or cURL includes `customer_code=...`."
    );
  }

  return {
    sessionId,
    customerAccess,
    customerCode,
  };
}

/**
 * Decodes the non-secret customer identity information stored inside the customer_access JWT payload.
 */
export function getDiaAccountLabel(customerAccess: string, displayName?: string): string {
  try {
    const parts = customerAccess.split(".");
    if (parts.length >= 2) {
      const payload = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf8")
      );
      const code = payload["custom:customer_code"] || payload.sub;
      if (displayName && code) {
        return `${displayName} (#${code})`;
      }
      if (displayName) return displayName;
      if (code) return `Club Dia (#${code})`;
    }
  } catch {
    // ignore decoding error
  }
  return displayName || "Club Dia";
}

/**
 * Checks for any rotated credentials returned in Dia API response headers or Set-Cookie.
 */
export function extractRotatedCredentials(
  res: Response,
  current: DiaAuthCredentials
): DiaAuthCredentials {
  let updatedSessionId = current.sessionId;
  let updatedCustomerAccess = current.customerAccess;
  let updatedCustomerCode = current.customerCode;

  // 1. Check custom response headers
  const headerSession = res.headers.get("session_id");
  if (headerSession && headerSession.trim()) {
    updatedSessionId = headerSession.trim();
  }

  const headerCa = res.headers.get("customer_access");
  if (headerCa && headerCa.trim()) {
    updatedCustomerAccess = headerCa.trim();
  }

  const headerCc = res.headers.get("customer_code");
  if (headerCc && headerCc.trim()) {
    updatedCustomerCode = headerCc.trim();
  }

  // 2. Check Set-Cookie headers
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") || ""];

  for (const cookieStr of setCookies) {
    if (!cookieStr) continue;
    const parts = cookieStr.split(";")[0]?.trim();
    if (!parts) continue;

    if (parts.startsWith("session_id=")) {
      const val = parts.slice("session_id=".length).trim();
      if (val) updatedSessionId = val;
    } else if (parts.startsWith("customer_access=")) {
      const val = parts.slice("customer_access=".length).trim();
      if (val) updatedCustomerAccess = val;
    } else if (parts.startsWith("customer_code=")) {
      const val = parts.slice("customer_code=".length).trim();
      if (val) updatedCustomerCode = val;
    }
  }

  return {
    sessionId: updatedSessionId,
    customerAccess: updatedCustomerAccess,
    customerCode: updatedCustomerCode,
  };
}

function buildDiaHeaders(creds: DiaAuthCredentials): Record<string, string> {
  const cookieHeader = `session_id=${creds.sessionId}; customer_access=${creds.customerAccess}; customer_code=${creds.customerCode}`;
  return {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "x-locale": "es",
    "User-Agent": USER_AGENT,
    session_id: creds.sessionId,
    Cookie: cookieHeader,
  };
}

/**
 * Fetches a paginated page of recent digital tickets from Dia's API.
 * Accepts either (creds, offset, pageSize) or (creds, { offset, pageSize }).
 */
export async function fetchDiaTicketsPage(
  creds: DiaAuthCredentials,
  optionsOrOffset?: number | { offset?: number; pageSize?: number },
  maybePageSize?: number
): Promise<{
  data: DiaTicketListResponse;
  rotatedCreds: DiaAuthCredentials;
}> {
  let offset = 0;
  let pageSize = 6;

  if (typeof optionsOrOffset === "number") {
    offset = optionsOrOffset;
    if (typeof maybePageSize === "number") pageSize = maybePageSize;
  } else if (optionsOrOffset && typeof optionsOrOffset === "object") {
    if (typeof optionsOrOffset.offset === "number") offset = optionsOrOffset.offset;
    if (typeof optionsOrOffset.pageSize === "number") pageSize = optionsOrOffset.pageSize;
  }

  const url = `${DIA_BASE_URL}/customer/current/tickets?offset=${offset}&page_size=${pageSize}`;
  const res = await fetch(url, {
    method: "GET",
    headers: buildDiaHeaders(creds),
    signal: AbortSignal.timeout(15_000),
  });

  // Dia returns 222 with { location: "https://www.dia.es/login" } or similar when unauthenticated
  if (res.status === 222 || res.status === 401 || res.status === 403) {
    throw new DiaSessionExpiredError(
      `Dia returned status ${res.status}. Session has expired or credentials are invalid.`
    );
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(
      `Dia tickets request failed (${res.status} ${res.statusText}): ${errorText.slice(0, 200)}`
    );
  }

  const rotatedCreds = extractRotatedCredentials(res, creds);
  const data = (await res.json()) as DiaTicketListResponse;

  return { data, rotatedCreds };
}

/**
 * Fetches the complete structured detail of a single Dia ticket.
 * Accepts either DiaTicketSummary or DiaTicketDetailParams.
 */
export async function fetchDiaTicketDetail(
  creds: DiaAuthCredentials,
  summaryOrParams: DiaTicketSummary | DiaTicketDetailParams
): Promise<{
  data: DiaTicketDetailResponse;
  rotatedCreds: DiaAuthCredentials;
}> {
  const p: DiaTicketDetailParams =
    "detail_params" in summaryOrParams
      ? summaryOrParams.detail_params
      : summaryOrParams;

  const url = `${DIA_BASE_URL}/customer/current/tickets/${p.ticket}?begin=${p.begin}&business=${p.business}&country=${p.country}&pos=${p.pos}&store=${p.store}`;

  const res = await fetch(url, {
    method: "GET",
    headers: buildDiaHeaders(creds),
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 222 || res.status === 401 || res.status === 403) {
    throw new DiaSessionExpiredError(
      `Dia returned status ${res.status} while fetching ticket ${p.ticket}.`
    );
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(
      `Dia ticket detail request failed (${res.status} ${res.statusText}): ${errorText.slice(0, 200)}`
    );
  }

  const rotatedCreds = extractRotatedCredentials(res, creds);
  const data = (await res.json()) as DiaTicketDetailResponse;

  return { data, rotatedCreds };
}
