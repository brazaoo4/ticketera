export interface ShrinkflationIncident {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  category: string;
  storeId: string;
  storeName: string;
  storeHex: string;
  storeSlug: string;
  date: string; // ISO date string of the smaller package purchase
  oldDate: string; // ISO date string of previous purchase
  oldMeasure: number;
  newMeasure: number;
  oldUnitPrice: number;
  newUnitPrice: number;
  oldNormPrice: number;
  newNormPrice: number;
  percentNormIncrease: number;
  percentMeasureReduction: number;
  baseUnit: "KG" | "L" | "UNIT";
  receiptId: string;
  oldReceiptId: string;
}

export interface GetShrinkflationOptions {
  userId?: string;
  productId?: string;
  productSlug?: string;
  sinceDate?: Date;
}

export function formatMeasure(measure: number, baseUnit: "KG" | "L" | "UNIT"): string {
  if (baseUnit === "KG") {
    if (measure < 1) {
      return `${Math.round(measure * 1000)}g`;
    }
    return `${measure.toFixed(measure % 1 === 0 ? 0 : 2)} kg`;
  }
  if (baseUnit === "L") {
    if (measure < 1) {
      return `${Math.round(measure * 1000)} ml`;
    }
    return `${measure.toFixed(measure % 1 === 0 ? 0 : 2)} L`;
  }
  return `${measure} ud`;
}
