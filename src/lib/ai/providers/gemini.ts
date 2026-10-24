import { ParsedReceipt, ParsedReceiptSchema } from "../schema";
import { RECEIPT_PARSE_SYSTEM_PROMPT } from "../prompt";

const DEFAULT_GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-3-flash-preview",
];

function normalizeRawReceipt(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const d = data as Record<string, unknown>;
  const isValid =
    typeof d.is_valid_receipt === "boolean"
      ? d.is_valid_receipt
      : Array.isArray(d.items) && d.items.length > 0;

  return {
    is_valid_receipt: isValid,
    rejection_reason: typeof d.rejection_reason === "string" ? d.rejection_reason : null,
    store: d.store ?? d.supermarket ?? null,
    date: d.date ?? d.purchase_date ?? null,
    total: d.total ?? d.total_amount ?? null,
    tax_breakdown: Array.isArray(d.tax_breakdown) ? d.tax_breakdown : null,
    items: Array.isArray(d.items)
      ? d.items.map((it: unknown) => {
          if (!it || typeof it !== "object") return it;
          const item = it as Record<string, unknown>;
          return {
            ...item,
            category: item.category ?? item.suggested_category ?? "Other",
          };
        })
      : [],
  };
}

export async function parseWithGemini(input: {
  buffer: Buffer;
  mimeType: string;
  extractedText: string | null;
}): Promise<ParsedReceipt> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const preferredModel = process.env.GEMINI_MODEL?.trim();
  const modelsToTry = Array.from(
    new Set([preferredModel, ...DEFAULT_GEMINI_MODELS].filter(Boolean) as string[])
  );

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [{ text: RECEIPT_PARSE_SYSTEM_PROMPT }];

  if (input.extractedText && input.extractedText.length >= 40) {
    parts.push({
      text: `Extract the receipt items from this digital ticket text:\n\n${input.extractedText}`,
    });
  } else {
    parts.push({
      inlineData: {
        mimeType: input.mimeType || "image/webp",
        data: input.buffer.toString("base64"),
      },
    });
    parts.push({
      text: "Please extract all receipt line items from this image according to the required schema.",
    });
  }

  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });

  const modelErrors: string[] = [];

  for (const model of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Retry up to 2 attempts per model for transient 503 / 429
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(45000),
        });

        if (!res.ok) {
          const errorText = await res.text();
          const isDailyQuotaExhausted =
            res.status === 429 &&
            (errorText.includes("RESOURCE_EXHAUSTED") ||
              errorText.includes("Quota exceeded") ||
              errorText.includes("free_tier_requests"));

          if (isDailyQuotaExhausted) {
            console.warn(`[Gemini] ${model} daily free-tier quota exhausted. Skipping immediately to next model.`);
            modelErrors.push(`${model} (HTTP 429 Quota Exhausted)`);
            break; // Skip retry immediately
          }

          if ((res.status === 503 || res.status === 429) && attempt < 2) {
            const waitMs = 1500;
            console.warn(`[Gemini] ${model} returned ${res.status} (attempt ${attempt}/2), backing off ${waitMs}ms...`);
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }
          modelErrors.push(`${model} (HTTP ${res.status}): ${errorText.slice(0, 100)}`);
          break; // Try next model
        }

        const json = await res.json();
        const rawContent = json?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawContent) {
          modelErrors.push(`${model}: empty candidate content`);
          break;
        }

        const parsedJson = JSON.parse(rawContent);
        const normalized = normalizeRawReceipt(parsedJson);
        const result = ParsedReceiptSchema.safeParse(normalized);

        if (!result.success) {
          const validationErrors = result.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(", ");
          modelErrors.push(`${model} Zod validation error: ${validationErrors}`);
          break;
        }

        console.log(`[Gemini] ✓ Successfully parsed receipt using ${model}`);
        return result.data;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt === 1) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        modelErrors.push(`${model}: ${msg}`);
      }
    }
  }

  throw new Error(`All Gemini models failed: ${modelErrors.join(" | ")}`);
}
