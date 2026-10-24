import { z } from "zod";

export const CANONICAL_CATEGORIES = [
  "Dairy & Eggs",
  "Meat & Poultry",
  "Fish & Seafood",
  "Fruits & Vegetables",
  "Bakery",
  "Pantry",
  "Oils & Condiments",
  "Beverages",
  "Frozen Foods",
  "Cleaning & Household",
  "Personal Care",
  "Other",
] as const;

export type CanonicalCategory = (typeof CANONICAL_CATEGORIES)[number];

export const ParsedReceiptItemSchema = z.object({
  raw_name: z.string().min(1).max(250),
  suggested_name: z.string().min(1).max(250),
  category: z.string().max(100).default("Other"),
  quantity: z.coerce.number().default(1),
  unit_price: z.coerce.number().default(0),
  total_price: z.coerce.number().default(0),
  base_unit: z.enum(["KG", "L", "UNIT"]).default("UNIT"),
  unit_measure: z.coerce.number().default(1),
  price_per_base_unit: z.coerce.number().default(0),
  is_discount: z.boolean().default(false),
  is_bag_or_fee: z.boolean().default(false),
});

export const ParsedReceiptTaxBracketSchema = z.object({
  rate: z.coerce.number(), // e.g. 0, 2, 4, 5, 7.5, 10, 21
  base_amount: z.coerce.number(), // Base imponible
  tax_amount: z.coerce.number(), // Cuota IVA
});

export const ParsedReceiptSchema = z.object({
  is_valid_receipt: z.boolean().default(true),
  rejection_reason: z.string().max(500).nullable().optional().default(null),
  store: z.string().max(100).nullable().default(null),
  date: z.string().max(50).nullable().default(null),
  total: z.coerce.number().nullable().default(null),
  tax_breakdown: z.array(ParsedReceiptTaxBracketSchema).max(20).nullable().optional(),
  items: z.array(ParsedReceiptItemSchema).max(150).default([]),
});

export type ParsedReceiptTaxBracket = z.infer<typeof ParsedReceiptTaxBracketSchema>;
export type ParsedReceiptItem = z.infer<typeof ParsedReceiptItemSchema>;
export type ParsedReceipt = z.infer<typeof ParsedReceiptSchema>;
