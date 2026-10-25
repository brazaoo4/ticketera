"use server";

import { requireAdminUser } from "@/lib/auth";
import { setPublicCatalogSetting } from "@/lib/settings";
import { revalidatePath } from "next/cache";

export async function updatePublicCatalogAction(enabled: boolean) {
  try {
    await requireAdminUser();
    await setPublicCatalogSetting(enabled);

    // Revalidate paths so public/private layout updates
    revalidatePath("/", "layout");
    revalidatePath("/products");
    revalidatePath("/stores");
    revalidatePath("/compare");
    revalidatePath("/admin/settings");

    return {
      success: true,
      isPublicCatalog: enabled,
      message: enabled
        ? "Public catalogue mode enabled. Visitors can now browse products and stores without logging in."
        : "Private mode enabled. The entire catalogue now requires user sign-in.",
    };
  } catch (err: unknown) {
    console.error("Failed to update public catalog setting:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update setting",
    };
  }
}
