import path from "path";
import fs from "fs";
import crypto from "crypto";
import sharp from "sharp";
import { extractTextFromPdf } from "./pdf-extract";

export const UPLOAD_DIR =
  process.env.UPLOAD_DIR ||
  (process.env.NODE_ENV === "production"
    ? "/app/uploads"
    : path.join(process.cwd(), "uploads"));

// Ensure uploads directory exists synchronously on module load
try {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
} catch (err) {
  console.warn("Could not ensure UPLOAD_DIR exists on init:", err);
}

export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Validates binary magic bytes to accurately identify image and PDF files,
 * defending against MIME spoofing and disguised executable uploads.
 */
export function detectMagicMimeType(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 4) return null;

  // PDF: %PDF (25 50 44 46)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return "application/pdf";
  }

  // JPEG: FF D8 FF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP: 'RIFF' .... 'WEBP'
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  // HEIF / HEIC / AVIF: offset 4-8 is 'ftyp'
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12).toLowerCase();
    if (brand.startsWith("avif")) return "image/avif";
    if (
      brand.startsWith("heic") ||
      brand.startsWith("heix") ||
      brand.startsWith("mif1") ||
      brand.startsWith("msf1")
    ) {
      return "image/heic";
    }
  }

  return null;
}

export interface PreprocessResult {
  kind: "image" | "pdf-text" | "pdf-vision";
  sourceFile: string; // Relative name, e.g. "clx123.webp" or "clx123.pdf"
  fullPath: string;
  processedBuffer: Buffer;
  extractedText: string | null;
  mimeType: string;
}

export async function preprocessReceipt(
  receiptId: string,
  buffer: Buffer,
  rawMimeType: string
): Promise<PreprocessResult> {
  // Ensure directory exists
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  const magicMime = detectMagicMimeType(buffer);
  const isPdf =
    magicMime === "application/pdf" ||
    rawMimeType.includes("pdf") ||
    buffer.slice(0, 4).toString("ascii") === "%PDF";

  if (isPdf) {
    const fileName = `${receiptId}.pdf`;
    const fullPath = path.join(UPLOAD_DIR, fileName);

    await fs.promises.writeFile(fullPath, buffer);

    let extractedText: string | null = null;
    try {
      const text = await extractTextFromPdf(buffer);
      if (text && text.length >= 40) {
        extractedText = text;
      }
    } catch (pdfErr) {
      console.warn(`[Preprocess] PDF text extraction failed for ${receiptId}, falling back to vision:`, pdfErr);
    }

    return {
      kind: extractedText ? "pdf-text" : "pdf-vision",
      sourceFile: fileName,
      fullPath,
      processedBuffer: buffer,
      extractedText,
      mimeType: "application/pdf",
    };
  }

  // Otherwise, handle as image through Sharp pipeline (with decompression bomb defense)
  const fileName = `${receiptId}.webp`;
  const fullPath = path.join(UPLOAD_DIR, fileName);

  try {
    const enhancedBuffer = await sharp(buffer, { limitInputPixels: 64_000_000 })
      .rotate() // auto-orient via EXIF
      .resize({
        width: 2000,
        height: 3200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .grayscale()
      .normalize()
      .sharpen()
      .webp({ quality: 82 })
      .toBuffer();

    await fs.promises.writeFile(fullPath, enhancedBuffer);

    return {
      kind: "image",
      sourceFile: fileName,
      fullPath,
      processedBuffer: enhancedBuffer,
      extractedText: null,
      mimeType: "image/webp",
    };
  } catch (sharpErr) {
    console.warn(`[Preprocess] Sharp enhancement failed for ${receiptId}, saving raw buffer:`, sharpErr);
    // Fallback: save raw buffer
    await fs.promises.writeFile(fullPath, buffer);
    return {
      kind: "image",
      sourceFile: fileName,
      fullPath,
      processedBuffer: buffer,
      extractedText: null,
      mimeType: magicMime || rawMimeType || "image/jpeg",
    };
  }
}

/**
 * Vertically stitches 2 or more long-receipt photos into a single coherent receipt image,
 * auto-orienting each piece, resizing to 1600px width, and enhancing contrast for AI OCR.
 */
export async function stitchAndPreprocessImages(
  buffers: Buffer[],
  receiptId: string
): Promise<PreprocessResult> {
  // Ensure directory exists
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  const fileName = `${receiptId}.webp`;
  const fullPath = path.join(UPLOAD_DIR, fileName);

  try {
    const TARGET_WIDTH = 1600;
    const compositeInputs: { input: Buffer; top: number; left: number }[] = [];
    let currentTop = 0;

    for (const buf of buffers) {
      // Auto-orient via EXIF and resize to standard width with decompression bomb limit
      const processed = await sharp(buf, { limitInputPixels: 64_000_000 })
        .rotate()
        .resize({
          width: TARGET_WIDTH,
          withoutEnlargement: false,
        })
        .png() // intermediate lossless representation for composite
        .toBuffer({ resolveWithObject: true });

      compositeInputs.push({
        input: processed.data,
        top: currentTop,
        left: 0,
      });

      currentTop += processed.info.height;
    }

    const totalHeight = Math.max(currentTop, 100);

    const stitchedBuffer = await sharp({
      create: {
        width: TARGET_WIDTH,
        height: totalHeight,
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

    await fs.promises.writeFile(fullPath, stitchedBuffer);

    return {
      kind: "image",
      sourceFile: fileName,
      fullPath,
      processedBuffer: stitchedBuffer,
      extractedText: null,
      mimeType: "image/webp",
    };
  } catch (stitchErr) {
    console.warn(`[Preprocess] Image stitching failed for ${receiptId}, falling back to first image:`, stitchErr);
    // Fallback: preprocess first buffer
    return preprocessReceipt(receiptId, buffers[0], "image/jpeg");
  }
}

export function getReceiptFilePath(sourceFile: string): string {
  // Prevent directory traversal attacks
  const sanitized = path.basename(sourceFile);
  const resolvedUploadDir = path.resolve(UPLOAD_DIR);
  const resolvedPath = path.resolve(UPLOAD_DIR, sanitized);

  if (!resolvedPath.startsWith(resolvedUploadDir + path.sep) && resolvedPath !== resolvedUploadDir) {
    throw new Error("Invalid file path traversal attempt");
  }
  return resolvedPath;
}

/**
 * Compresses an existing receipt WebP image after OCR/AI parsing completes,
 * reducing disk storage by 70-85% while retaining crisp readability.
 */
export async function compressReceiptImage(receiptId: string): Promise<boolean> {
  const fileName = `${receiptId}.webp`;
  const fullPath = path.join(UPLOAD_DIR, fileName);

  try {
    if (!fs.existsSync(fullPath)) {
      return false;
    }

    const statBefore = await fs.promises.stat(fullPath);
    // Skip if file is already very small (under 180 KB)
    if (statBefore.size < 180 * 1024) {
      return true;
    }

    const compressedBuffer = await sharp(fullPath, { limitInputPixels: 64_000_000 })
      .resize({
        width: 1400,
        height: 2400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 68, effort: 6 })
      .toBuffer();

    if (compressedBuffer.length < statBefore.size) {
      await fs.promises.writeFile(fullPath, compressedBuffer);
      const savedPercent = Math.round(
        ((statBefore.size - compressedBuffer.length) / statBefore.size) * 100
      );
      console.log(
        `[Compress] ✓ Compressed receipt image ${fileName}: ${(statBefore.size / 1024).toFixed(0)}KB -> ${(compressedBuffer.length / 1024).toFixed(0)}KB (-${savedPercent}%)`
      );
    }

    return true;
  } catch (err) {
    console.warn(`[Compress] Notice: Could not post-compress receipt ${receiptId}:`, err);
    return false;
  }
}

