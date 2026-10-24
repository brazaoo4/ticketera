"use server";

import { requireAuthUser, requireAdminUser } from "@/lib/auth";
import { loadDemoData, clearDemoData } from "./demo-data";
import { revalidatePath } from "next/cache";

export async function loadDemoDataAction() {
  try {
    await requireAuthUser();
    const res = await loadDemoData();
    revalidatePath("/");
    revalidatePath("/products");
    revalidatePath("/stores");
    revalidatePath("/compare");
    revalidatePath("/my-stats");
    revalidatePath("/my-receipts");
    return res;
  } catch (err: unknown) {
    console.error("Error loading demo data:", err);
    return { success: false, error: err instanceof Error ? err.message : "Error loading demo data" };
  }
}

export async function clearDemoDataAction() {
  try {
    await requireAdminUser();
    const res = await clearDemoData();
    revalidatePath("/");
    revalidatePath("/products");
    revalidatePath("/stores");
    revalidatePath("/compare");
    revalidatePath("/my-stats");
    revalidatePath("/my-receipts");
    return res;
  } catch (err: unknown) {
    console.error("Error clearing demo data:", err);
    return { success: false, error: err instanceof Error ? err.message : "Error clearing demo data" };
  }
}
