import { z } from "zod";
import { CANONICAL_CATEGORIES, type CanonicalCategory } from "./schema";
import { DEFAULT_GEMINI_MODELS } from "./providers/gemini";
import { DEFAULT_GROQ_MODELS } from "./providers/groq";
import { DEFAULT_OPENAI_MODELS } from "./providers/openai";

export interface RawPosItemInput {
  index: number;
  rawName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isVariableWeight: boolean;
  weight: number;
  discountHints: string[];
}

export interface CatalogProductHint {
  displayName: string;
  category: string;
  baseUnit: "KG" | "L" | "UNIT";
}

export const ResolvedPosItemSchema = z.object({
  index: z.coerce.number().int().nonnegative(),
  suggested_name: z.string().trim().min(1).max(250),
  category: z.string().max(100).default("Other"),
  base_unit: z.enum(["KG", "L", "UNIT"]).default("UNIT"),
  unit_measure_per_pack: z.coerce.number().positive().default(1),
  is_bag_or_fee: z.boolean().default(false),
});

export const ResolvedPosItemsResponseSchema = z.object({
  items: z.array(ResolvedPosItemSchema).max(200),
});

export type ResolvedPosItem = z.infer<typeof ResolvedPosItemSchema>;

export interface ResolvePosItemsResult {
  items: ResolvedPosItem[];
  aiProvider: string;
  processingMs: number;
}

const SPANISH_TO_ENGLISH_CATEGORY_MAP: Record<string, CanonicalCategory> = {
  "lácteos y huevos": "Dairy & Eggs",
  "lacteos y huevos": "Dairy & Eggs",
  "carnicería": "Meat & Poultry",
  "carniceria": "Meat & Poultry",
  "pescadería": "Fish & Seafood",
  "pescaderia": "Fish & Seafood",
  "fruta y verdura": "Fruits & Vegetables",
  "panadería": "Bakery",
  "panaderia": "Bakery",
  "despensa": "Pantry",
  "aceites": "Oils & Condiments",
  "bebidas": "Beverages",
  "congelados": "Frozen Foods",
  "limpieza y hogar": "Cleaning & Household",
  "cuidado personal": "Personal Care",
  "otros": "Other",
};

const CANONICAL_CATEGORY_BY_LOWER = new Map<string, CanonicalCategory>(
  CANONICAL_CATEGORIES.map((c) => [c.toLowerCase(), c])
);

export function normalizeCanonicalCategory(raw?: string | null): CanonicalCategory {
  if (!raw || typeof raw !== "string") return "Other";
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  const exact = CANONICAL_CATEGORY_BY_LOWER.get(lower);
  if (exact) return exact;

  const mapped = SPANISH_TO_ENGLISH_CATEGORY_MAP[lower];
  if (mapped) return mapped;

  return "Other";
}

export function hasConfiguredAiProvider(): boolean {
  return Boolean(
    process.env.GEMINI_API_KEY?.trim() ||
      process.env.GROQ_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim()
  );
}

export const POS_ITEM_RESOLVE_SYSTEM_PROMPT = `You are an expert Spanish grocery receipt normalizer. Given raw abbreviated POS receipt line items from a Spanish supermarket and a list of existing canonical catalog products, expand each item into a clean, generic Spanish product name, canonical English category, base unit, and single-pack measure.

Return ONLY valid JSON matching this schema:
{
  "items": [
    {
      "index": number,
      "suggested_name": "string",
      "category": ${CANONICAL_CATEGORIES.map((c) => `"${c}"`).join(" | ")},
      "base_unit": "KG" | "L" | "UNIT",
      "unit_measure_per_pack": number,
      "is_bag_or_fee": boolean
    }
  ]
}

Strict Rules:
1. Preserve every input "index" exactly once in the output array.
2. Catalog-First Matching: Check "existing_catalog". If an item genuinely refers to the same product as an entry in "existing_catalog", set "suggested_name" to that EXACT catalog displayName and align "category" and "base_unit" with it. Never force a match to a different product (e.g., do not match "Mandarina" to "Naranja" or "Carne Picada Vacuno" to "Filete Lomo").
3. Product Name Cleaning ("suggested_name"):
   - Provide a clean, title-cased generic Spanish canonical product name so identical products match across Mercadona, DIA, Lidl, Carrefour, etc.
   - Expand POS truncations clearly:
     - "ACEITE OLIVA V.EXTRA" -> "Aceite de Oliva Virgen Extra"
     - "ATÚN CLARO AC OLIVA" -> "Atún Claro en Aceite de Oliva"
     - "CREM DENT FLUOR+CALC" -> "Pasta de Dientes con Flúor y Calcio"
     - "CERVEZA TRIGO PAULAN" -> "Cerveza de Trigo Paulaner"
     - "PORCIONES NATU 16 UD" -> "Queso en Porciones Natural"
     - "ENSALAD 4 ESTACIONES" -> "Ensalada Cuatro Estaciones"
     - "VASOS ARROZ REDONDO" -> "Vasitos de Arroz Redondo"
     - "PECHUGA POLLO ENTERA" -> "Pechuga de Pollo Entera"
     - "MANZANILLA TETERÍA" -> "Manzanilla"
     - "MENESTRA VEGECAMPO" -> "Menestra de Verduras"
   - Strip supermarket/private-label brands ("DIA", "VEGECAMPO", "CAPRICHO", "TETERÍA", "AL PUNTO", "LACTEA", "MARI MARINERA", "BONTÉ", "EL MOLINO", "LA DESPENSA", "SNACK MANIAC", "SELECCIÓN MUNDIAL", "HACENDADO", "MILBONA", etc.) unless a well-known external brand defines the product (e.g., "Coca-Cola Zero", "Red Bull Sin Azúcar", "Fuze Tea de Maracuyá").
   - Strip weight, volume, and pack-count suffixes (1L, 1kg, 210 G, 16 UD, Pack 6, Docena) from "suggested_name".
4. Categories MUST strictly be one of the English canonical categories: ${CANONICAL_CATEGORIES.map((c) => `"${c}"`).join(", ")}.
   - Ready-to-drink iced teas (e.g. "FUZE TEA", "TÉ AL MANGO ZERO") -> "Beverages".
   - Herbal infusions and tea bags (e.g. "MANZANILLA TETERÍA", "TILA") -> "Pantry".
   - Toothpaste ("CREM DENT FLUOR+CALC") -> "Personal Care".
   - Frozen vegetable mixes ("MENESTRA VEGECAMPO") -> "Frozen Foods".
   - Cheese portions ("PORCIONES NATU 16 UD") -> "Dairy & Eggs".
   - Muesli, cereal bars, pasta, nuts, canned tuna, broth ("MUESLI TRIPLE CHOCO", "BARRITA CHOCO Y SAL", "PASTA PESTO PROTEINA", "CALDO DE CARNE") -> "Pantry".
5. Base Unit & Single-Pack Measure ("base_unit", "unit_measure_per_pack"):
   - "unit_measure_per_pack" MUST represent ONE single pack/item/can/bottle (do NOT multiply by "quantity").
   - Use "discount_hints" when available for exact sizes! For example:
     - "RED BULL SIN AZÚCAR" with discount_hints ["RED BULL 250 ML"] -> base_unit: "L", unit_measure_per_pack: 0.25.
     - "FUZE TEA DE MARACUYÁ" with discount_hints ["FUZE TEA 330 ML"] -> base_unit: "L", unit_measure_per_pack: 0.33.
   - If "is_variable_weight" is true and "weight" > 0, set base_unit: "KG" and unit_measure_per_pack: weight.
   - Meat & Poultry, Fish & Seafood, and loose Fruits & Vegetables use "KG" (1 if weighed/unstated, or package weight like 0.5 for 500g).
   - Milk, Water, Soft Drinks, Beer, Wine, Oil, Vinegar, Broth ("1 L") use "L" (e.g. 1, 0.33, 0.25, 1.5).
   - Packaged counts like "PORCIONES NATU 16 UD" or "HUEVOS 12UD" use "UNIT" and the item count per pack (16, 12).
   - Items with an unknown net weight/volume (e.g. "ENSALADA CÉSAR 210 G" -> 0.21 KG or 1 UNIT if prepared salad, "TARTA QUESO" -> 1 UNIT) should use conservative, accurate values.
6. Set "is_bag_or_fee": true ONLY for carrier bags ("BOLSA PLASTICO", "BOLSA COMPRA"), bottle deposits, or delivery fees.
`;

export function buildPosItemResolvePrompt(
  storeName: string,
  items: RawPosItemInput[],
  catalogProducts: CatalogProductHint[]
): string {
  const limitedCatalog = catalogProducts.slice(0, 400);
  const catalogLines =
    limitedCatalog.length > 0
      ? limitedCatalog
          .map((p) => `- ${p.displayName} [${p.category} | ${p.baseUnit}]`)
          .join("\n")
      : "(empty catalog)";

  const payloadItems = items.map((item) => ({
    index: item.index,
    raw_name: item.rawName,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    total_price: item.totalPrice,
    is_variable_weight: item.isVariableWeight,
    weight: item.weight,
    discount_hints: item.discountHints,
  }));

  return `Supermarket: ${storeName}

existing_catalog:
${catalogLines}

pos_items:
${JSON.stringify(payloadItems, null, 2)}

Return ONLY valid JSON with key "items".`;
}

export function parseResolvedItemsJson(rawText: string): ResolvedPosItem[] {
  const stripped = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(stripped) as unknown;
  const wrapped = Array.isArray(parsed) ? { items: parsed } : parsed;

  if (!wrapped || typeof wrapped !== "object") {
    throw new Error("AI response was not a JSON object");
  }

  const obj = wrapped as Record<string, unknown>;
  const rawItems = Array.isArray(obj.items) ? obj.items : [];

  const normalizedItems = rawItems.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") return entry;
    const item = entry as Record<string, unknown>;

    const rawCategory =
      typeof item.category === "string"
        ? item.category
        : typeof item.suggested_category === "string"
        ? item.suggested_category
        : "Other";

    const rawBaseUnit =
      typeof item.base_unit === "string" ? item.base_unit.trim().toUpperCase() : "UNIT";
    const baseUnit =
      rawBaseUnit === "KG" || rawBaseUnit === "L" || rawBaseUnit === "UNIT"
        ? rawBaseUnit
        : "UNIT";

    const rawMeasure = Number(item.unit_measure_per_pack ?? item.unit_measure ?? 1);
    const unitMeasurePerPack =
      Number.isFinite(rawMeasure) && rawMeasure > 0 ? Number(rawMeasure.toFixed(3)) : 1;

    return {
      index: item.index,
      suggested_name: item.suggested_name,
      category: normalizeCanonicalCategory(rawCategory),
      base_unit: baseUnit,
      unit_measure_per_pack: unitMeasurePerPack,
      is_bag_or_fee: Boolean(item.is_bag_or_fee),
    };
  });

  const validated = ResolvedPosItemsResponseSchema.safeParse({ items: normalizedItems });
  if (!validated.success) {
    const issues = validated.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    throw new Error(`Zod validation error: ${issues}`);
  }

  return validated.data.items;
}

async function resolveWithGemini(userPrompt: string): Promise<ResolvedPosItem[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const preferredModel = process.env.GEMINI_MODEL?.trim();
  const modelsToTry = Array.from(
    new Set([preferredModel, ...DEFAULT_GEMINI_MODELS].filter(Boolean) as string[])
  );

  const body = JSON.stringify({
    contents: [
      {
        parts: [{ text: POS_ITEM_RESOLVE_SYSTEM_PROMPT }, { text: userPrompt }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });

  const modelErrors: string[] = [];

  for (const model of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) {
          const errorText = await res.text();
          const isDailyQuotaExhausted =
            res.status === 429 &&
            (errorText.includes("RESOURCE_EXHAUSTED") ||
              errorText.includes("Quota exceeded") ||
              errorText.includes("free_tier_requests"));

          if (isDailyQuotaExhausted) {
            modelErrors.push(`${model} (HTTP 429 Quota Exhausted)`);
            break;
          }

          if ((res.status === 503 || res.status === 429) && attempt < 2) {
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }

          modelErrors.push(`${model} (HTTP ${res.status}): ${errorText.slice(0, 100)}`);
          break;
        }

        const json = await res.json();
        const rawContent = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawContent) {
          modelErrors.push(`${model}: empty candidate content`);
          break;
        }

        return parseResolvedItemsJson(rawContent);
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

async function resolveWithOpenAICompatible(opts: {
  providerName: string;
  url: string;
  apiKey: string;
  models: string[];
  userPrompt: string;
}): Promise<ResolvedPosItem[]> {
  const modelErrors: string[] = [];

  for (const model of opts.models) {
    try {
      const res = await fetch(opts.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: POS_ITEM_RESOLVE_SYSTEM_PROMPT },
            { role: "user", content: opts.userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(30000),
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

      return parseResolvedItemsJson(rawContent);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      modelErrors.push(`${model}: ${msg}`);
    }
  }

  throw new Error(`All ${opts.providerName} models failed: ${modelErrors.join(" | ")}`);
}

export async function resolvePosItemsWithAI({
  storeName,
  items,
  catalogProducts,
}: {
  storeName: string;
  items: RawPosItemInput[];
  catalogProducts: CatalogProductHint[];
}): Promise<ResolvePosItemsResult> {
  if (items.length === 0) {
    return { items: [], aiProvider: "none", processingMs: 0 };
  }

  const startTime = Date.now();
  const userPrompt = buildPosItemResolvePrompt(storeName, items, catalogProducts);
  const errors: Array<{ provider: string; error: string }> = [];

  if (process.env.GEMINI_API_KEY?.trim()) {
    try {
      const resolved = await resolveWithGemini(userPrompt);
      return {
        items: resolved,
        aiProvider: "gemini-flash",
        processingMs: Math.max(0, Date.now() - startTime),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AI Resolver] ⚠️ Gemini failed: ${msg}`);
      errors.push({ provider: "gemini", error: msg });
    }
  }

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    try {
      const preferredGroq = process.env.GROQ_MODEL?.trim();
      const models = Array.from(
        new Set([preferredGroq, ...DEFAULT_GROQ_MODELS].filter(Boolean) as string[])
      );
      const resolved = await resolveWithOpenAICompatible({
        providerName: "Groq",
        url: "https://api.groq.com/openai/v1/chat/completions",
        apiKey: groqKey,
        models,
        userPrompt,
      });
      return {
        items: resolved,
        aiProvider: "groq-qwen",
        processingMs: Math.max(0, Date.now() - startTime),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AI Resolver] ⚠️ Groq failed: ${msg}`);
      errors.push({ provider: "groq", error: msg });
    }
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    try {
      const preferredOpenAI = process.env.OPENAI_MODEL?.trim();
      const models = Array.from(
        new Set([preferredOpenAI, ...DEFAULT_OPENAI_MODELS].filter(Boolean) as string[])
      );
      const resolved = await resolveWithOpenAICompatible({
        providerName: "OpenAI",
        url: "https://api.openai.com/v1/chat/completions",
        apiKey: openAiKey,
        models,
        userPrompt,
      });
      return {
        items: resolved,
        aiProvider: "gpt-4o-mini",
        processingMs: Math.max(0, Date.now() - startTime),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AI Resolver] ⚠️ OpenAI failed: ${msg}`);
      errors.push({ provider: "openai", error: msg });
    }
  }

  if (errors.length > 0) {
    const errorMsg = errors.map((e) => `[${e.provider}] ${e.error}`).join(" | ");
    throw new Error(`AI item resolution failed across all providers: ${errorMsg}`);
  }

  throw new Error(
    "No AI provider keys configured (GEMINI_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY)."
  );
}
