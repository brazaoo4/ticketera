"use server";

import { requireAuthUser, requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function createStoreAction(formData: {
  name: string;
  brandHex: string;
}) {
  try {
    await requireAuthUser();
  } catch {
    return { error: "You must be signed in to add a supermarket." };
  }

  const name = formData.name?.trim();
  if (!name || name.length < 2) {
    return { error: "Supermarket name must be at least 2 characters long." };
  }

  let brandHex = formData.brandHex?.trim() || "#10b981";
  if (!/^#[0-9A-Fa-f]{6}$/.test(brandHex)) {
    brandHex = "#10b981";
  }

  // Generate clean slug
  let slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    slug = `store-${Date.now()}`;
  }

  // Ensure slug uniqueness
  const existingWithSlug = await prisma.store.findUnique({ where: { slug } });
  if (existingWithSlug) {
    slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  // Check name uniqueness (case-insensitive)
  const existingWithName = await prisma.store.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (existingWithName) {
    return { error: `A supermarket named "${existingWithName.name}" already exists.` };
  }

  try {
    const store = await prisma.store.create({
      data: {
        name,
        slug,
        brandHex,
      },
    });

    revalidatePath("/stores");
    revalidatePath("/upload");
    revalidatePath("/compare");

    return { success: true, store };
  } catch (err) {
    console.error("Error creating store:", err);
    return { error: "Failed to create supermarket. Please try again." };
  }
}

export async function updateStoreAction(formData: {
  id: string;
  name: string;
  brandHex: string;
}) {
  try {
    await requireAuthUser();
  } catch {
    return { error: "You must be signed in to update a supermarket." };
  }

  const { id, name, brandHex } = formData;
  if (!id) return { error: "Missing supermarket ID." };

  const trimmedName = name?.trim();
  if (!trimmedName || trimmedName.length < 2) {
    return { error: "Supermarket name must be at least 2 characters long." };
  }

  let validHex = brandHex?.trim() || "#10b981";
  if (!/^#[0-9A-Fa-f]{6}$/.test(validHex)) {
    validHex = "#10b981";
  }

  try {
    const store = await prisma.store.update({
      where: { id },
      data: {
        name: trimmedName,
        brandHex: validHex,
      },
    });

    revalidatePath("/stores");
    revalidatePath(`/stores/${store.slug}`);
    revalidatePath("/upload");
    revalidatePath("/compare");

    return { success: true };
  } catch (err) {
    console.error("Error updating store:", err);
    return { error: "Failed to update supermarket." };
  }
}

export async function deleteStoreAction(id: string) {
  try {
    await requireAdminUser();
  } catch {
    return { error: "Unauthorized. Administrator role required to delete a supermarket." };
  }

  if (!id) return { error: "Missing supermarket ID." };

  try {
    const store = await prisma.store.findUnique({
      where: { id },
      include: {
        _count: {
          select: { receipts: true, aliases: true },
        },
      },
    });

    if (!store) {
      return { error: "Supermarket not found." };
    }

    if (store._count.receipts > 0 || store._count.aliases > 0) {
      return {
        error: `Cannot delete "${store.name}": it has ${store._count.receipts} receipts and ${store._count.aliases} product aliases.`,
      };
    }

    await prisma.store.delete({ where: { id } });

    revalidatePath("/stores");
    revalidatePath("/upload");
    revalidatePath("/compare");

    return { success: true };
  } catch (err) {
    console.error("Error deleting store:", err);
    return { error: "Failed to delete supermarket." };
  }
}
