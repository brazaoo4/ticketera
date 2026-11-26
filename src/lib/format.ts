export type CanonicalUnit = "L" | "kg" | "unit";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTHS_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function normalizeUnit(unit: string): CanonicalUnit {
  const upper = (unit || "").trim().toUpperCase();
  if (upper === "KG") return "kg";
  if (upper === "L") return "L";
  return "unit";
}

function formatSpanishDecimal(absValue: number, decimals: number): string {
  const fixed = absValue.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const groupedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decPart !== undefined ? `${groupedInt},${decPart}` : groupedInt;
}

/**
 * Formats a euro amount in Spanish Euro style: e.g. `16,65 €`, `-4,80 €`, `1.250,50 €`.
 */
export function formatCurrency(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const normalized = Math.abs(safe) < 0.005 ? 0 : safe;
  const sign = normalized < 0 ? "-" : "";
  return `${sign}${formatSpanishDecimal(Math.abs(normalized), 2)} €`;
}

/**
 * Formats a euro amount rounded to whole euros in Spanish Euro style: e.g. `0 €`, `50 €`, `1.250 €`.
 */
export function formatWholeCurrency(value: number): string {
  const safe = Number.isFinite(value) ? Math.round(value) : 0;
  const normalized = safe === 0 ? 0 : safe;
  const sign = normalized < 0 ? "-" : "";
  return `${sign}${formatSpanishDecimal(Math.abs(normalized), 0)} €`;
}

/**
 * Formats a price range cleanly without stripping currency symbols manually.
 */
export function formatPriceRange(
  low: number,
  high: number,
  mode: "unit" | "pack",
  unit: "L" | "kg" | "unit" | "KG" | "UNIT" | string
): string {
  const safeLow = Number.isFinite(low) ? low : 0;
  const normLow = Math.abs(safeLow) < 0.005 ? 0 : safeLow;
  const sign = normLow < 0 ? "-" : "";
  const lowStr = `${sign}${formatSpanishDecimal(Math.abs(normLow), 2)}`;
  const highStr =
    mode === "unit" ? formatUnitPrice(high, unit) : formatCurrency(high);
  return `${lowStr} to ${highStr}`;
}

/**
 * Formats a normalized unit price: `7,95 €/L`, `1,29 €/kg`, `0,19 €/unit`.
 */
export function formatUnitPrice(
  value: number,
  unit: "L" | "kg" | "unit" | "KG" | "UNIT" | string
): string {
  const safe = Number.isFinite(value) ? value : 0;
  const normalized = Math.abs(safe) < 0.005 ? 0 : safe;
  const sign = normalized < 0 ? "-" : "";
  const canonical = normalizeUnit(unit);
  return `${sign}${formatSpanishDecimal(Math.abs(normalized), 2)} €/${canonical}`;
}

/**
 * Formats a pack or item measure cleanly in everyday English with Spanish commas.
 */
export function formatMeasureText(
  measure: number,
  unit: "L" | "kg" | "unit" | "KG" | "UNIT" | string
): string {
  const safe = Number.isFinite(measure) && measure > 0 ? measure : 0;
  const canonical = normalizeUnit(unit);

  if (canonical === "kg") {
    if (safe < 1) {
      return `${Math.round(safe * 1000)} g`;
    }
    return safe % 1 === 0
      ? `${safe.toFixed(0)} kg`
      : `${formatSpanishDecimal(safe, 2)} kg`;
  }

  if (canonical === "L") {
    if (safe < 1) {
      return `${Math.round(safe * 1000)} ml`;
    }
    return safe % 1 === 0
      ? `${safe.toFixed(0)} L`
      : `${formatSpanishDecimal(safe, 2)} L`;
  }

  if (Math.abs(safe - 1) < 0.001) {
    return "1 unit";
  }
  const qtyLabel =
    safe % 1 === 0 ? safe.toFixed(0) : formatSpanishDecimal(safe, 2);
  return `${qtyLabel} units`;
}

/**
 * Formats the single-pack measure when `totalMeasure` covers `quantity` packs (e.g. `6 L` with qty `6` -> `1 L`).
 */
export function formatPerPackMeasure(
  totalMeasure: number,
  quantity: number,
  unit: "L" | "kg" | "unit" | "KG" | "UNIT" | string
): string {
  const safeQty = Number.isFinite(quantity) && quantity > 1 ? quantity : 1;
  const perPack = safeQty > 1 ? totalMeasure / safeQty : totalMeasure;
  return formatMeasureText(perPack, unit);
}

/**
 * Formats a line item measure with pack count when quantity > 1 (e.g. `6 × 1 L`, `2 × 250 g`).
 */
export function formatLineMeasure(
  totalMeasure: number,
  quantity: number,
  unit: "L" | "kg" | "unit" | "KG" | "UNIT" | string
): string {
  const safeQty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  if (safeQty > 1 && Math.abs(safeQty - Math.round(safeQty)) < 0.001) {
    return `${Math.round(safeQty)} × ${formatMeasureText(totalMeasure / safeQty, unit)}`;
  }
  return formatMeasureText(totalMeasure, unit);
}

/**
 * Formats a percentage delta in Spanish comma style: `-7,2%`, `+15,8%`, `0,0%`, or whole `0%`.
 */
export function formatPercent(
  pct: number,
  opts?: { showPlus?: boolean; decimals?: number }
): string {
  const safe = Number.isFinite(pct) ? pct : 0;
  const showPlus = opts?.showPlus ?? true;
  const decimals = opts?.decimals ?? 1;
  const zeroThreshold = 0.5 * Math.pow(10, -decimals);
  if (Math.abs(safe) < zeroThreshold) {
    return `${formatSpanishDecimal(0, decimals)}%`;
  }
  const sign = safe > 0 ? (showPlus ? "+" : "") : "-";
  return `${sign}${formatSpanishDecimal(Math.abs(safe), decimals)}%`;
}

function toValidDate(iso: string | Date): Date | null {
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Deterministic UTC date formatting: `21 Oct 2026`.
 */
export function formatDate(iso: string | Date): string {
  const d = toValidDate(iso);
  if (!d) return "—";
  const day = d.getUTCDate();
  const month = MONTHS_SHORT[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Deterministic UTC short date: `12 May`.
 */
export function formatShortDate(iso: string | Date): string {
  const d = toValidDate(iso);
  if (!d) return "—";
  const day = d.getUTCDate();
  const month = MONTHS_SHORT[d.getUTCMonth()];
  return `${day} ${month}`;
}

/**
 * Deterministic UTC month and year: `October 2026`.
 */
export function formatMonthYear(iso: string | Date): string {
  const d = toValidDate(iso);
  if (!d) return "—";
  return `${MONTHS_FULL[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Deterministic UTC abbreviated month and 2-digit year: `Oct 26`.
 */
export function formatMonthShort(iso: string | Date): string {
  const d = toValidDate(iso);
  if (!d) return "—";
  const yr = String(d.getUTCFullYear()).slice(-2);
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${yr}`;
}

/**
 * Deterministic UTC month key `YYYY-MM` for grouping receipts.
 */
export function getUTCMonthKey(iso: string | Date): string {
  const d = toValidDate(iso);
  if (!d) return "unknown";
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}`;
}

/**
 * Deterministic UTC input string `DD/MM/YYYY`.
 */
export function formatDateInputDDMMYYYY(iso: string | Date): string {
  const d = toValidDate(iso);
  if (!d) return "";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Parses `DD/MM/YYYY` (or `YYYY-MM-DD`) into validated `YYYY-MM-DD`, or null if invalid.
 */
export function parseDDMMYYYYToISO(input: string): string | null {
  const trimmed = (input || "").trim();
  if (!trimmed) return null;

  let day: number;
  let month: number;
  let year: number;

  const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

  if (dmyMatch) {
    day = Number(dmyMatch[1]);
    month = Number(dmyMatch[2]);
    year = Number(dmyMatch[3]);
  } else if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else {
    return null;
  }

  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface StoreBrandStyle {
  color: string;
  fg: string;
  monogram: string;
}

const CANONICAL_STORE_BRANDS: Record<string, StoreBrandStyle> = {
  mercadona: { color: "#15803D", fg: "#FFFFFF", monogram: "MC" },
  carrefour: { color: "#2563EB", fg: "#FFFFFF", monogram: "CR" },
  lidl: { color: "#EAB308", fg: "#181A18", monogram: "LI" },
  dia: { color: "#DC2626", fg: "#FFFFFF", monogram: "DI" },
  consum: { color: "#C2410C", fg: "#FFFFFF", monogram: "CO" },
  alcampo: { color: "#DC2626", fg: "#FFFFFF", monogram: "AC" },
  aldi: { color: "#0284C7", fg: "#FFFFFF", monogram: "AL" },
  "cash fresh": { color: "#15803D", fg: "#FFFFFF", monogram: "CF" },
  "cash-fresh": { color: "#15803D", fg: "#FFFFFF", monogram: "CF" },
  mas: { color: "#B91C1C", fg: "#FFFFFF", monogram: "MA" },
};

function linearizeChannel(v: number): number {
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function computeReadableTextColor(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "#FFFFFF";
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  if ([r, g, b].some((v) => Number.isNaN(v))) return "#FFFFFF";
  const lum =
    0.2126 * linearizeChannel(r) +
    0.7152 * linearizeChannel(g) +
    0.0722 * linearizeChannel(b);
  // Compare WCAG contrast against #FFFFFF (L=1) vs #181A18 (L≈0.0103)
  const darkLum = 0.0103;
  const contrastWhite = 1.05 / (lum + 0.05);
  const contrastDark = (lum + 0.05) / (darkLum + 0.05);
  return contrastDark > contrastWhite ? "#181A18" : "#FFFFFF";
}

function deriveMonogram(name: string): string {
  const parts = name.trim().split(/[\s-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || "ST";
}

/**
 * Returns distinct supermarket brand colors and accessible monogram colors.
 * Prevents Carrefour/Lidl blue collisions and ensures legible text on light tiles.
 */
export function getStoreBrand(
  nameOrSlug: string,
  fallbackHex?: string
): StoreBrandStyle {
  const key = (nameOrSlug || "").trim().toLowerCase();
  if (CANONICAL_STORE_BRANDS[key]) {
    return CANONICAL_STORE_BRANDS[key];
  }
  const color =
    fallbackHex && /^#[0-9A-Fa-f]{6}$/.test(fallbackHex)
      ? fallbackHex
      : "#15803D";
  return {
    color,
    fg: computeReadableTextColor(color),
    monogram: deriveMonogram(nameOrSlug),
  };
}
