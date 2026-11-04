export interface DiaTokenDetection {
  sessionId: string | null;
  customerAccess: string | null;
  customerCode: string | null;
  isValid: boolean;
  missingFields: string[];
}

/**
 * Universal, browser-safe token detector for Dia credentials.
 * Works with cURL (Windows/CMD/PowerShell/Bash), Fetch snippets, DevTools cookie tables,
 * raw cookie strings, and JSON payloads.
 */
export function detectDiaTokens(rawInput: string): DiaTokenDetection {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      sessionId: null,
      customerAccess: null,
      customerCode: null,
      isValid: false,
      missingFields: ["session_id", "customer_access", "customer_code"],
    };
  }

  // 1. Try parsing JSON format
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      const sId = parsed.sessionId || parsed.session_id || parsed.SESSION_ID;
      const cAcc = parsed.customerAccess || parsed.customer_access || parsed.CUSTOMER_ACCESS;
      const cCod = parsed.customerCode || parsed.customer_code || parsed.CUSTOMER_CODE;
      const sessionId = sId ? String(sId).trim() : null;
      const customerAccess = cAcc ? String(cAcc).trim() : null;
      const customerCode = cCod ? String(cCod).trim() : null;

      const missing: string[] = [];
      if (!sessionId) missing.push("session_id");
      if (!customerAccess) missing.push("customer_access");
      if (!customerCode) missing.push("customer_code");

      return {
        sessionId,
        customerAccess,
        customerCode,
        isValid: missing.length === 0,
        missingFields: missing,
      };
    } catch {
      // Fall through to regex-based extraction
    }
  }

  // 2. Normalize Windows CMD caret escapes and backslash continuation
  const normalized = trimmed
    .replace(/\^\r?\n/g, " ")
    .replace(/\\\r?\n/g, " ")
    .replace(/\^([\"\'&%^])/g, "$1");

  const extract = (name: string): string | null => {
    // PowerShell WebRequestSession
    const psRegex = new RegExp(`Cookie\\(\\s*["']${name}["']\\s*,\\s*["']([^"']+)["']`, "i");
    const psMatch = normalized.match(psRegex);
    if (psMatch?.[1]) return psMatch[1].trim();

    // Standard Cookie header, DevTools tab-separated table, or key=value / key: value
    const stdRegex = new RegExp(`(?:^|[;\\s\"'&])${name}\\s*(?:=|:|\\t)\\s*([^;\"'\\s\\r\\n&]+)`, "i");
    const stdMatch = normalized.match(stdRegex);
    return stdMatch?.[1] ? stdMatch[1].trim() : null;
  };

  const sessionId = extract("session_id");
  const customerAccess = extract("customer_access");
  const customerCode = extract("customer_code");

  const missing: string[] = [];
  if (!sessionId) missing.push("session_id");
  if (!customerAccess) missing.push("customer_access");
  if (!customerCode) missing.push("customer_code");

  return {
    sessionId,
    customerAccess,
    customerCode,
    isValid: missing.length === 0,
    missingFields: missing,
  };
}
