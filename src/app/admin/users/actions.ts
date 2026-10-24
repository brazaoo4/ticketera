"use server";

import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const CreateUserSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username cannot exceed 32 characters")
    .regex(
      /^[a-zA-Z0-9_.-]+$/,
      "Username can only contain alphanumeric characters, underscores, dashes, and dots"
    ),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters"),
  role: z.enum(["USER", "ADMIN"]).default("USER"),
});

export async function createUserAction(formData: FormData) {
  try {
    await requireAdminUser();
  } catch {
    return { success: false, error: "Unauthorized. Administrator role required." };
  }

  const rawUsername = formData.get("username");
  const rawPassword = formData.get("password");
  const rawRole = formData.get("role") || "USER";

  const result = CreateUserSchema.safeParse({
    username: rawUsername,
    password: rawPassword,
    role: rawRole,
  });

  if (!result.success) {
    const errorMsg = result.error.issues.map((e) => e.message).join(". ");
    return { success: false, error: errorMsg };
  }

  const { username, password, role } = result.data;

  try {
    const existing = await prisma.user.findUnique({
      where: { username },
    });

    if (existing) {
      return { success: false, error: `User "${username}" already exists.` };
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        role: role as "USER" | "ADMIN",
        enabled: true,
      },
    });

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    console.error("Error creating user:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error creating user in database.",
    };
  }
}

export async function toggleUserStatusAction(userId: string) {
  let currentUser;
  try {
    currentUser = await requireAdminUser();
  } catch {
    return { success: false, error: "Unauthorized." };
  }

  if (userId === currentUser.id) {
    return {
      success: false,
      error: "Action rejected: You cannot disable your own active administrator account.",
    };
  }

  try {
    const target = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!target) {
      return { success: false, error: "User not found." };
    }

    // Check if disabling the last active admin
    if (target.role === "ADMIN" && target.enabled) {
      const activeAdminCount = await prisma.user.count({
        where: { role: "ADMIN", enabled: true },
      });
      if (activeAdminCount <= 1) {
        return {
          success: false,
          error: "You cannot disable the only active administrator on the system.",
        };
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { enabled: !target.enabled },
    });

    revalidatePath("/admin/users");
    return { success: true, enabled: updated.enabled };
  } catch (error) {
    console.error("Error toggling user status:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error updating user status.",
    };
  }
}

export async function resetPasswordAction(userId: string, newPassword: string) {
  try {
    await requireAdminUser();
  } catch {
    return { success: false, error: "Unauthorized." };
  }

  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: "New password must be at least 8 characters long." };
  }

  try {
    const target = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!target) {
      return { success: false, error: "User not found." };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    console.error("Error resetting password:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error resetting password.",
    };
  }
}
