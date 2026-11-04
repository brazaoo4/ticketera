import fs from "fs";
import path from "path";
import sharp from "sharp";
import { UPLOAD_DIR } from "@/lib/receipts/preprocess";
import { DiaTicketDetailResponse, DiaTicketSummary } from "./types";

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
    JSON.stringify({ summary, detail }, null, 2),
    "utf8"
  );

  const width = 640;
  const items = (detail.corporate?.items || []).filter((i) => !i.cancel);
  const taxes = detail.corporate?.taxes || [];

  let currentY = 50;

  // Header SVG
  let svgContent = `
    <style>
      .brand { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; font-size: 32px; font-weight: 900; fill: #D52B1E; letter-spacing: 2px; }
      .title { font-family: monospace; font-size: 14px; fill: #52525b; text-anchor: middle; }
      .meta { font-family: monospace; font-size: 13px; fill: #27272a; }
      .bold { font-weight: bold; }
      .item-name { font-family: monospace; font-size: 13px; font-weight: 600; fill: #09090b; }
      .item-sub { font-family: monospace; font-size: 11px; fill: #71717a; }
      .item-price { font-family: monospace; font-size: 14px; font-weight: 700; fill: #09090b; text-anchor: end; }
      .discount { font-family: monospace; font-size: 12px; fill: #059669; }
      .total-label { font-family: monospace; font-size: 20px; font-weight: 800; fill: #09090b; }
      .total-val { font-family: monospace; font-size: 24px; font-weight: 900; fill: #D52B1E; text-anchor: end; }
      .tax { font-family: monospace; font-size: 11px; fill: #52525b; }
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
    ? `${summary.store_info.postal_code || ""} ${summary.store_info.city}`
    : "";
  const cif = detail.corporate?.info?.fiscal_code ? `CIF: ${detail.corporate.info.fiscal_code}` : "";

  svgContent += `
    <text x="${width / 2}" y="${(currentY += 20)}" class="title">${escapeXml(storeName)}</text>
    ${storeAddress ? `<text x="${width / 2}" y="${(currentY += 18)}" class="title">${escapeXml(storeAddress)}</text>` : ""}
    ${storeCity ? `<text x="${width / 2}" y="${(currentY += 18)}" class="title">${escapeXml(storeCity)}</text>` : ""}
    ${cif ? `<text x="${width / 2}" y="${(currentY += 18)}" class="title">${escapeXml(cif)}</text>` : ""}
  `;

  currentY += 25;
  const formattedDate = new Date(detail.header?.submitted_date || summary.submitted_date).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const displayCode = detail.header?.display_code ? `Factura Simplificada: ${detail.header.display_code}` : "";

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
    const isVariable = item.variable_weight && item.weight > 0;
    const subText = isVariable
      ? `${item.weight.toFixed(3)} kg x ${item.price_per_unit.toFixed(2)} €/kg`
      : `${item.quantity} ud x ${item.price_per_unit.toFixed(2)} €`;

    svgContent += `
      <text x="40" y="${currentY}" class="item-name">${escapeXml(item.name)}</text>
      <text x="${width - 40}" y="${currentY}" class="item-price">${item.amount.toFixed(2)} €</text>
      <text x="40" y="${(currentY += 16)}" class="item-sub">${escapeXml(subText)}</text>
    `;

    currentY += 14;

    // Item Discounts
    if (item.discounts && item.discounts.length > 0) {
      for (const d of item.discounts) {
        svgContent += `
          <text x="50" y="${currentY}" class="discount">↳ ${escapeXml(d.description)}</text>
          <text x="${width - 40}" y="${currentY}" class="discount" text-anchor="end">${d.amount.toFixed(2)} €</text>
        `;
        currentY += 18;
      }
    }

    currentY += 10;
  }

  // Totals Section
  currentY += 10;
  const totalAmount = detail.amount?.total_amount ?? summary.total_amount;
  const discountsTotal = detail.amount?.total_discounts ?? 0;
  const subtotal = detail.amount?.total_amount_without_discounts ?? totalAmount;

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

  const totalHeight = Math.max(600, currentY + 45);
  const finalSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}"><rect width="${width}" height="${totalHeight}" fill="#fafafa" rx="12" />${svgContent}</svg>`;
  const webpPath = path.join(UPLOAD_DIR, `${receiptId}.webp`);

  await sharp(Buffer.from(finalSvg))
    .webp({ quality: 90 })
    .toFile(webpPath);

  return { webpPath, jsonPath };
}
