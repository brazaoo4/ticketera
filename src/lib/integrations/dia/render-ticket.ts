import fs from "fs";
import path from "path";
import sharp from "sharp";
import { UPLOAD_DIR } from "@/lib/receipts/preprocess";
import { DiaTicketDetailResponse, DiaTicketSummary } from "./types";

export const DIA_TICKET_RENDER_VERSION = 2;

/**
 * Escapes characters for XML/SVG text nodes.
 */
function escapeXml(unsafe?: unknown): string {
  if (unsafe == null) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Truncates long labels so monospace text never overlaps right-aligned amounts.
 */
export function truncateText(text: string, maxLen: number): string {
  const clean = text.trim();
  if (clean.length <= maxLen) return clean;
  if (maxLen <= 1) return clean.slice(0, maxLen);
  return `${clean.slice(0, maxLen - 1).trimEnd()}…`;
}

/**
 * Builds an SVG representation of a digital Club Dia thermal receipt using
 * explicit DejaVu font families bundled in the Alpine runtime image.
 */
export function buildDiaTicketSvg(
  summary: DiaTicketSummary,
  detail: DiaTicketDetailResponse
): { svg: string; width: number; height: number } {
  const width = 640;
  const items = (detail.corporate?.items || []).filter((i) => !i.cancel);
  const taxes = detail.corporate?.taxes || [];

  let currentY = 50;

  let svgContent = `
    <style>
      .brand { font-family: "DejaVu Sans", "Liberation Sans", Arial, sans-serif; font-size: 32px; font-weight: 900; fill: #D52B1E; letter-spacing: 2px; }
      .title { font-family: "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace; font-size: 14px; fill: #52525b; text-anchor: middle; }
      .meta { font-family: "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace; font-size: 13px; fill: #27272a; }
      .bold { font-weight: bold; }
      .item-name { font-family: "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace; font-size: 13px; font-weight: 600; fill: #09090b; }
      .item-sub { font-family: "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace; font-size: 11px; fill: #71717a; }
      .item-price { font-family: "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace; font-size: 14px; font-weight: 700; fill: #09090b; text-anchor: end; }
      .discount { font-family: "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace; font-size: 12px; fill: #059669; }
      .total-label { font-family: "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace; font-size: 20px; font-weight: 800; fill: #09090b; }
      .total-val { font-family: "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace; font-size: 24px; font-weight: 900; fill: #D52B1E; text-anchor: end; }
      .tax { font-family: "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace; font-size: 11px; fill: #52525b; }
      .divider { stroke: #d4d4d8; stroke-width: 1; stroke-dasharray: 4,4; }
      .solid-divider { stroke: #18181b; stroke-width: 2; }
    </style>

    <!-- Header Section -->
    <text x="${width / 2}" y="${currentY}" class="brand" text-anchor="middle">DIA %</text>
  `;

  currentY += 30;
  const storeName = detail.corporate?.info?.name || "DIA";
  const storeAddress = detail.header?.store_address || summary.store_info?.address || "";
  const storeCity = summary.store_info?.city
    ? `${summary.store_info.postal_code || ""} ${summary.store_info.city}`.trim()
    : "";
  const cif = detail.corporate?.info?.fiscal_code ? `CIF: ${detail.corporate.info.fiscal_code}` : "";

  svgContent += `
    <text x="${width / 2}" y="${(currentY += 20)}" class="title">${escapeXml(storeName)}</text>
    ${storeAddress ? `<text x="${width / 2}" y="${(currentY += 18)}" class="title">${escapeXml(storeAddress)}</text>` : ""}
    ${storeCity ? `<text x="${width / 2}" y="${(currentY += 18)}" class="title">${escapeXml(storeCity)}</text>` : ""}
    ${cif ? `<text x="${width / 2}" y="${(currentY += 18)}" class="title">${escapeXml(cif)}</text>` : ""}
  `;

  currentY += 25;
  const formattedDate = new Date(
    detail.header?.submitted_date || summary.submitted_date || Date.now()
  ).toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const displayCode = detail.header?.display_code
    ? `Factura Simplificada: ${detail.header.display_code}`
    : "";

  svgContent += `
    <line x1="40" y1="${currentY}" x2="${width - 40}" y2="${currentY}" class="solid-divider" />
    <text x="40" y="${(currentY += 22)}" class="meta bold">FECHA: ${escapeXml(formattedDate)}</text>
    ${displayCode ? `<text x="40" y="${(currentY += 18)}" class="meta">${escapeXml(displayCode)}</text>` : ""}
    <line x1="40" y1="${(currentY += 15)}" x2="${width - 40}" y2="${currentY}" class="divider" />
  `;

  currentY += 25;
  // Items Header
  svgContent += `
    <text x="40" y="${currentY}" class="item-sub bold">DESCRIPCIÓN</text>
    <text x="${width - 40}" y="${currentY}" class="item-sub bold" text-anchor="end">TOTAL</text>
    <line x1="40" y1="${(currentY += 8)}" x2="${width - 40}" y2="${currentY}" class="divider" />
  `;

  currentY += 15;

  // Items List
  for (const item of items) {
    const itemWeight = Number(item.weight ?? 0);
    const itemPricePerUnit = Number(item.price_per_unit ?? 0);
    const itemQuantity = Number(item.quantity ?? 1);
    const itemAmount = Number(item.amount ?? 0);
    const isVariable = Boolean(item.variable_weight && itemWeight > 0);
    const subText = isVariable
      ? `${itemWeight.toFixed(3)} kg x ${itemPricePerUnit.toFixed(2)} €/kg`
      : `${itemQuantity} ud x ${itemPricePerUnit.toFixed(2)} €`;

    const displayItemName = truncateText(String(item.name || ""), 44);

    svgContent += `
      <text x="40" y="${currentY}" class="item-name">${escapeXml(displayItemName)}</text>
      <text x="${width - 40}" y="${currentY}" class="item-price">${itemAmount.toFixed(2)} €</text>
      <text x="40" y="${(currentY += 16)}" class="item-sub">${escapeXml(subText)}</text>
    `;

    currentY += 14;

    // Item Discounts
    if (Array.isArray(item.discounts) && item.discounts.length > 0) {
      for (const d of item.discounts) {
        const discountDesc = truncateText(String(d.description || ""), 40);
        const discountAmount = Number(d.amount ?? 0);
        svgContent += `
          <text x="50" y="${currentY}" class="discount">• ${escapeXml(discountDesc)}</text>
          <text x="${width - 40}" y="${currentY}" class="discount" text-anchor="end">${discountAmount.toFixed(2)} €</text>
        `;
        currentY += 18;
      }
    }

    currentY += 10;
  }

  // Totals Section
  currentY += 10;
  const totalAmount = Number(detail.amount?.total_amount ?? summary.total_amount ?? 0);
  const discountsTotal = Number(detail.amount?.total_discounts ?? 0);
  const subtotal = Number(detail.amount?.total_amount_without_discounts ?? totalAmount);

  svgContent += `
    <line x1="40" y1="${currentY}" x2="${width - 40}" y2="${currentY}" class="solid-divider" />
  `;

  if (discountsTotal < 0) {
    svgContent += `
      <text x="40" y="${(currentY += 24)}" class="meta">Subtotal sin descuentos:</text>
      <text x="${width - 40}" y="${currentY}" class="meta" text-anchor="end">${subtotal.toFixed(2)} €</text>
      <text x="40" y="${(currentY += 20)}" class="discount bold">Descuentos Club Dia:</text>
      <text x="${width - 40}" y="${currentY}" class="discount bold" text-anchor="end">${discountsTotal.toFixed(2)} €</text>
    `;
  }

  svgContent += `
    <text x="40" y="${(currentY += 34)}" class="total-label">TOTAL A PAGAR</text>
    <text x="${width - 40}" y="${currentY}" class="total-val">${totalAmount.toFixed(2)} €</text>
    <line x1="40" y1="${(currentY += 15)}" x2="${width - 40}" y2="${currentY}" class="divider" />
  `;

  // Taxes breakdown
  if (taxes.length > 0) {
    currentY += 20;
    svgContent += `
      <text x="40" y="${currentY}" class="tax bold">TIPO / %</text>
      <text x="240" y="${currentY}" class="tax bold">BASE</text>
      <text x="${width - 40}" y="${currentY}" class="tax bold" text-anchor="end">CUOTA IVA</text>
    `;

    for (const t of taxes) {
      currentY += 18;
      const rateLabel = t.rate != null ? `${t.rate}%` : String(t.tax || "");
      const baseVal = Number(t.base_amount ?? (t as Record<string, unknown>).base ?? 0);
      const amountVal = Number(t.amount ?? (t as Record<string, unknown>).quota ?? 0);
      const nameLabel = t.name ? ` (${t.name})` : "";
      svgContent += `
        <text x="40" y="${currentY}" class="tax">IVA ${escapeXml(rateLabel)}${escapeXml(nameLabel)}</text>
        <text x="240" y="${currentY}" class="tax">${baseVal.toFixed(2)} €</text>
        <text x="${width - 40}" y="${currentY}" class="tax" text-anchor="end">${amountVal.toFixed(2)} €</text>
      `;
    }
    currentY += 15;
    svgContent += `<line x1="40" y1="${currentY}" x2="${width - 40}" y2="${currentY}" class="divider" />`;
  }

  // Footer: Verifactu & Unique Ticket Code
  currentY += 25;
  const uniqueCode = detail.header?.ticket_unique_code || summary.ticket_unique_code || "";
  svgContent += `
    <text x="${width / 2}" y="${currentY}" class="title">DOCUMENTO DIGITAL CLUB DIA</text>
    <text x="${width / 2}" y="${(currentY += 18)}" class="item-sub" text-anchor="middle">ID: ${escapeXml(uniqueCode)}</text>
    <text x="${width / 2}" y="${(currentY += 18)}" class="item-sub" text-anchor="middle">Ticketera Automated Grocery Sync</text>
  `;

  const height = Math.max(600, currentY + 45);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#fafafa" rx="12" />${svgContent}</svg>`;
  return { svg, width, height };
}

/**
 * Renders an authentic thermal receipt SVG image for a digital Dia ticket and converts it to WebP.
 * This guarantees the Review Workstation receipt viewer has a crisp, legible document preview.
 */
export async function renderDiaTicketToWebp(
  receiptId: string,
  summary: DiaTicketSummary,
  detail: DiaTicketDetailResponse
): Promise<{ webpPath: string; jsonPath: string }> {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  const jsonPath = path.join(UPLOAD_DIR, `${receiptId}.json`);
  await fs.promises.writeFile(
    jsonPath,
    JSON.stringify(
      { renderVersion: DIA_TICKET_RENDER_VERSION, summary, detail },
      null,
      2
    ),
    "utf8"
  );

  const { svg } = buildDiaTicketSvg(summary, detail);
  const webpPath = path.join(UPLOAD_DIR, `${receiptId}.webp`);

  await sharp(Buffer.from(svg))
    .webp({ quality: 90 })
    .toFile(webpPath);

  return { webpPath, jsonPath };
}

/**
 * Re-renders a Dia receipt WebP preview from its persisted JSON companion when
 * missing or generated with an older render version (e.g. pre-fontconfig tofu images).
 */
export async function ensureFreshDiaTicketWebp(receiptId: string): Promise<boolean> {
  const jsonPath = path.join(UPLOAD_DIR, `${receiptId}.json`);
  if (!fs.existsSync(jsonPath)) {
    return false;
  }

  try {
    const raw = await fs.promises.readFile(jsonPath, "utf8");
    const parsed = JSON.parse(raw) as {
      renderVersion?: number;
      summary?: DiaTicketSummary;
      detail?: DiaTicketDetailResponse;
    };

    const webpPath = path.join(UPLOAD_DIR, `${receiptId}.webp`);
    if (
      parsed.renderVersion === DIA_TICKET_RENDER_VERSION &&
      fs.existsSync(webpPath)
    ) {
      return false;
    }

    if (parsed.summary && parsed.detail) {
      await renderDiaTicketToWebp(receiptId, parsed.summary, parsed.detail);
      return true;
    }

    return false;
  } catch (err) {
    console.warn(`[DiaRender] Could not refresh DIA ticket preview ${receiptId}:`, err);
    return false;
  }
}

/**
 * Scans UPLOAD_DIR for stored Dia ticket JSON files and refreshes any stale WebP previews.
 */
export async function refreshStaleDiaTicketPreviews(): Promise<number> {
  if (!fs.existsSync(UPLOAD_DIR)) {
    return 0;
  }

  let refreshed = 0;
  const entries = await fs.promises.readdir(UPLOAD_DIR);
  for (const file of entries) {
    if (!file.endsWith(".json")) continue;
    const receiptId = file.slice(0, -5);
    if (!receiptId) continue;
    const didRefresh = await ensureFreshDiaTicketWebp(receiptId);
    if (didRefresh) {
      refreshed++;
    }
  }

  if (refreshed > 0) {
    console.log(
      `⚡ [DiaRender] Refreshed ${refreshed} stale Club Dia receipt ${
        refreshed === 1 ? "preview" : "previews"
      } to render v${DIA_TICKET_RENDER_VERSION}.`
    );
  }

  return refreshed;
}
