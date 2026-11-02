import sharp from "sharp";

/**
 * Ensures browser Canvas/DOM globals are present in Node.js runtime,
 * preventing pdfjs-dist from throwing "ReferenceError: DOMMatrix is not defined".
 */
export function ensureCanvasGlobals() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const canvas = require("@napi-rs/canvas");
    if (!globalThis.DOMMatrix && canvas.DOMMatrix) globalThis.DOMMatrix = canvas.DOMMatrix;
    if (!globalThis.ImageData && canvas.ImageData) globalThis.ImageData = canvas.ImageData;
    if (!globalThis.Path2D && canvas.Path2D) globalThis.Path2D = canvas.Path2D;
  } catch {
    // In headless or minimal environments without native canvas, use safe stubs
  }

  if (typeof globalThis.DOMMatrix === "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.DOMMatrix = class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    } as any;
  }
  if (typeof globalThis.ImageData === "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.ImageData = class ImageData {
      width: number;
      height: number;
      data: Uint8ClampedArray;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
        this.data = new Uint8ClampedArray(w * h * 4);
      }
    } as any;
  }
  if (typeof globalThis.Path2D === "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.Path2D = class Path2D {} as any;
  }
}

// Ensure globals exist on module evaluation
ensureCanvasGlobals();

/**
 * Safe PDF text extractor utility
 * Supports pdf-parse v2 (class PDFParse) and fallback
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string | null> {
  if (!buffer || buffer.length < 4) return null;
  ensureCanvasGlobals();
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    const result = await parser.getText({ pageJoiner: "" });
    await parser.destroy();

    // Check individual pages text to ensure we don't count synthetic page headers or empty markers
    let combined = "";
    if (result && Array.isArray(result.pages)) {
      combined = result.pages.map((p) => (p.text || "").trim()).filter(Boolean).join("\n");
    } else if (result && typeof result.text === "string") {
      combined = result.text.trim();
    }

    // Clean out any synthetic markers like "-- 1 of 1 --"
    const cleaned = combined.replace(/--\s*\d+\s*of\s*\d+\s*--/gi, "").trim();

    if (cleaned.length >= 40 && /[a-zA-Z0-9]{3,}/.test(cleaned)) {
      return cleaned;
    }
    return null;
  } catch (err) {
    console.warn("[PdfExtract] PDF text parsing warning:", err);
    await parser.destroy().catch(() => null);
    return null;
  }
}

/**
 * Renders PDF page(s) to a high-resolution, contrast-enhanced WebP image.
 * Uses pdf-parse v2 screenshot rendering combined with Sharp image processing.
 * Multi-page PDFs are vertically composited into a single continuous receipt.
 */
export async function renderPdfToImage(buffer: Buffer): Promise<Buffer> {
  ensureCanvasGlobals();
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    // scale: 2 produces crisp, legible receipt text without excessive memory consumption
    const screenshot = await parser.getScreenshot({ scale: 2 });
    await parser.destroy();

    if (!screenshot || !screenshot.pages || screenshot.pages.length === 0) {
      throw new Error("PDF rendering produced 0 pages");
    }

    const pageBuffers = screenshot.pages.map((p) => Buffer.from(p.data));

    if (pageBuffers.length === 1) {
      return await sharp(pageBuffers[0], { limitInputPixels: 64_000_000 })
        .grayscale()
        .normalize()
        .sharpen()
        .webp({ quality: 82 })
        .toBuffer();
    }

    // Multi-page PDF: vertically composite into a single continuous receipt
    const TARGET_WIDTH = 1600;
    const compositeInputs: { input: Buffer; top: number; left: number }[] = [];
    let currentTop = 0;

    for (const pageBuf of pageBuffers) {
      const resized = await sharp(pageBuf, { limitInputPixels: 64_000_000 })
        .resize({ width: TARGET_WIDTH, withoutEnlargement: false })
        .png()
        .toBuffer({ resolveWithObject: true });

      compositeInputs.push({
        input: resized.data,
        top: currentTop,
        left: 0,
      });

      currentTop += resized.info.height;
    }

    return await sharp({
      create: {
        width: TARGET_WIDTH,
        height: Math.max(currentTop, 100),
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
      limitInputPixels: 64_000_000,
    })
      .composite(compositeInputs)
      .grayscale()
      .normalize()
      .sharpen()
      .webp({ quality: 82 })
      .toBuffer();
  } catch (err) {
    await parser.destroy().catch(() => null);
    throw err;
  }
}
