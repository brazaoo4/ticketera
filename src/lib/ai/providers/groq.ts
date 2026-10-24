import { ParsedReceipt, ParsedReceiptSchema } from "../schema";
import { RECEIPT_PARSE_SYSTEM_PROMPT } from "../prompt";

const DEFAULT_GROQ_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "qwen/qwen3.8-27b",
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

export async function parseWithGroq(input: {
  buffer: Buffer;
  mimeType: string;
  extractedText: string | null;
}): Promise<ParsedReceipt> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY not configured");
  }

  const preferredModel = process.env.GROQ_MODEL?.trim();
  const modelsToTry = Array.from(
    new Set([preferredModel, ...DEFAULT_GROQ_MODELS].filter(Boolean) as string[])
  );

  const url = "https://api.groq.com/openai/v1/chat/completions";

  let userContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;

  if (input.extractedText && input.extractedText.length >= 40) {
    userContent = `Extract all receipt line items from this digital ticket text:\n\n${input.extractedText}`;
  } else {
    const base64Image = input.buffer.toString("base64");
    userContent = [
      {
        type: "text",
        text: "Please extract all receipt line items from this image according to the schema.",
      },
      {
        type: "image_url",
        image_url: {
          url: `data:${input.mimeType || "image/webp"};base64,${base64Image}`,
        },
      },
    ];
  }

  const modelErrors: string[] = [];

  for (const model of modelsToTry) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: RECEIPT_PARSE_SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(45000),
      });

      if (!res.ok) {
        const errorText = await res.text();
        modelErrors.push(`${model} (HTTP ${res.status}): ${errorText.slice(0, 100)}`);
        continue;
      }

      const json = await res.json();
      const rawContent = json?.choices?.[0]?.message?.content;

      if (!rawContent) {
        modelErrors.push(`${model}: empty choice content`);
        continue;
      }

      const parsedJson = JSON.parse(rawContent);
      const normalized = normalizeRawReceipt(parsedJson);
      const result = ParsedReceiptSchema.safeParse(normalized);

      if (!result.success) {
        const validationErrors = result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(", ");
        modelErrors.push(`${model} Zod validation error: ${validationErrors}`);
        continue;
      }

      console.log(`[Groq] ✓ Successfully parsed receipt using ${model}`);
      return result.data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      modelErrors.push(`${model}: ${msg}`);
    }
  }

  throw new Error(`All Groq models failed: ${modelErrors.join(" | ")}`);
}
