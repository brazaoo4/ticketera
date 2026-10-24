import { ParsedReceipt } from "./schema";
import { parseWithGemini } from "./providers/gemini";
import { parseWithGroq } from "./providers/groq";
import { parseWithOpenAI } from "./providers/openai";

export class InvalidReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidReceiptError";
  }
}

export interface ParseReceiptInput {
  buffer: Buffer;
  mimeType: string;
  extractedText: string | null;
  preferredStore?: string;
}

export interface ParseReceiptResult {
  result: ParsedReceipt;
  aiProvider: string;
  processingMs: number;
}

function validateParsedReceipt(result: ParsedReceipt): void {
  if (result.is_valid_receipt === false || result.items.length === 0) {
    const reason =
      result.rejection_reason?.trim() ||
      "La imagen o documento subido no parece ser un ticket de compra válido o no contiene productos legibles.";
    throw new InvalidReceiptError(reason);
  }
}

export async function parseReceiptWithFailover(
  input: ParseReceiptInput
): Promise<ParseReceiptResult> {
  const startTime = Date.now();
  const errors: Array<{ provider: string; error: string }> = [];

  // Provider 1: Gemini Flash
  if (process.env.GEMINI_API_KEY?.trim()) {
    try {
      console.log("[AI Failover] Attempting parsing with Gemini Flash...");
      const result = await parseWithGemini(input);
      validateParsedReceipt(result);
      const processingMs = Date.now() - startTime;
      console.log(`[AI Failover] ✓ Gemini succeeded in ${processingMs}ms (${result.items.length} items parsed)`);
      return { result, aiProvider: "gemini-flash", processingMs };
    } catch (err: unknown) {
      if (err instanceof InvalidReceiptError) {
        console.warn(`[AI Failover] 🛑 Deterministic non-receipt detected by Gemini: ${err.message}. Aborting failover.`);
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AI Failover] ⚠️ Gemini failed: ${msg}`);
      errors.push({ provider: "gemini", error: msg });
    }
  }

  // Provider 2: Groq Multimodal (Qwen 3.8 27B)
  if (process.env.GROQ_API_KEY?.trim()) {
    try {
      console.log("[AI Failover] Attempting parsing with Groq Qwen 3.8 (Multimodal)...");
      const result = await parseWithGroq(input);
      validateParsedReceipt(result);
      const processingMs = Date.now() - startTime;
      console.log(`[AI Failover] ✓ Groq succeeded in ${processingMs}ms (${result.items.length} items parsed)`);
      return { result, aiProvider: "groq-qwen", processingMs };
    } catch (err: unknown) {
      if (err instanceof InvalidReceiptError) {
        console.warn(`[AI Failover] 🛑 Deterministic non-receipt detected by Groq: ${err.message}. Aborting failover.`);
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AI Failover] ⚠️ Groq failed: ${msg}`);
      errors.push({ provider: "groq", error: msg });
    }
  }

  // Provider 3: OpenAI GPT-4o-mini
  if (process.env.OPENAI_API_KEY?.trim()) {
    try {
      console.log("[AI Failover] Attempting parsing with OpenAI GPT-4o-mini...");
      const result = await parseWithOpenAI(input);
      validateParsedReceipt(result);
      const processingMs = Date.now() - startTime;
      console.log(`[AI Failover] ✓ OpenAI succeeded in ${processingMs}ms (${result.items.length} items parsed)`);
      return { result, aiProvider: "gpt-4o-mini", processingMs };
    } catch (err: unknown) {
      if (err instanceof InvalidReceiptError) {
        console.warn(`[AI Failover] 🛑 Deterministic non-receipt detected by OpenAI: ${err.message}. Aborting failover.`);
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AI Failover] ⚠️ OpenAI failed: ${msg}`);
      errors.push({ provider: "openai", error: msg });
    }
  }

  if (errors.length > 0) {
    const errorMsg = errors.map((e) => `[${e.provider}] ${e.error}`).join(" | ");
    throw new Error(`AI parsing failed across all configured providers: ${errorMsg}`);
  }

  throw new Error(
    "No AI provider keys configured. Please set at least one key (GEMINI_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY) in your environment variables to parse receipts."
  );
}
