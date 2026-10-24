/**
 * Safe PDF text extractor utility
 * Supports pdf-parse v2 (class PDFParse) and fallback
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string | null> {
  try {
    const { PDFParse } = await import("pdf-parse");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parser = new PDFParse({ data: new Uint8Array(buffer) } as any);
    const result = await parser.getText();
    await parser.destroy();
    if (result && typeof result.text === "string" && result.text.trim().length > 0) {
      return result.text.trim();
    }
    return null;
  } catch (err) {
    console.warn("[PdfExtract] PDF text parsing warning:", err);
    return null;
  }
}
