"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  parseDiaAuthInput,
  fetchDiaTicketsPage,
  getDiaAccountLabel,
} from "@/lib/integrations/dia/client";
import { encryptCredentials } from "@/lib/crypto/vault";
import { syncDiaConnection } from "@/lib/queue/dia-sync-worker";
import { triggerDiaSyncNow } from "@/lib/queue/dia-sync-queue";

export async function connectDiaAccountAction(rawInput: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized. Please log in." };
  }

  const trimmed = rawInput?.trim();
  if (!trimmed) {
    return {
      success: false,
      error: "Input is empty. Please paste your curl command or cookies.",
    };
  }

  let creds;
  try {
    creds = parseDiaAuthInput(trimmed);
  } catch (parseErr) {
    return {
      success: false,
      error: parseErr instanceof Error ? parseErr.message : "Failed to parse Dia credentials.",
    };
  }

  // Verify credentials by attempting to fetch recent tickets
  let pageRes;
  try {
    pageRes = await fetchDiaTicketsPage(creds, { offset: 0, pageSize: 1 });
  } catch (authErr) {
    return {
      success: false,
      error:
        authErr instanceof Error
          ? authErr.message
          : "Authentication failed. Please verify that your Dia session is still active.",
    };
  }

  const updatedCreds = pageRes.rotatedCreds || creds;
  const accountLabel = getDiaAccountLabel(
    updatedCreds.customerAccess,
    pageRes.data.customer?.display_name
  );
  const encryptedAuthData = encryptCredentials(updatedCreds);

  let connection;
  try {
    connection = await prisma.storeConnection.upsert({
      where: {
        userId_storeSlug: {
          userId: session.user.id,
          storeSlug: "dia",
        },
      },
      create: {
        userId: session.user.id,
        storeSlug: "dia",
        accountLabel,
        encryptedAuthData,
        status: "ACTIVE",
        syncEnabled: true,
        lastSyncAt: new Date(),
        lastKeepAliveAt: new Date(),
      },
      update: {
        accountLabel,
        encryptedAuthData,
        status: "ACTIVE",
        syncEnabled: true,
        lastKeepAliveAt: new Date(),
        lastError: null,
      },
    });
  } catch (dbErr) {
    return {
      success: false,
      error: dbErr instanceof Error ? dbErr.message : "Failed to save connection to database.",
    };
  }

  // Trigger immediate initial sync
  try {
    await triggerDiaSyncNow(connection.id);
  } catch {
    // If BullMQ is offline, run sync directly in background
    syncDiaConnection(connection.id).catch(console.error);
  }

  revalidatePath("/admin/integrations");
  revalidatePath("/my-receipts");
  return {
    success: true,
    accountLabel,
    message: `Connected successfully to Club Dia (${accountLabel})! Initial sync started.`,
  };
}

export async function syncDiaNowAction(connectionId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const res = await syncDiaConnection(connectionId);
    revalidatePath("/admin/integrations");
    revalidatePath("/my-receipts");

    if (!res.success) {
      return { success: false, error: res.error || "Sync failed" };
    }

    return {
      success: true,
      importedCount: res.importedCount ?? 0,
      skippedCount: res.skippedCount ?? 0,
      message: `Sync complete: ${res.importedCount ?? 0} imported, ${res.skippedCount ?? 0} already up-to-date.`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Sync encountered an unexpected error.",
    };
  }
}

export async function toggleDiaSyncAction(connectionId: string, syncEnabled: boolean) {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await prisma.storeConnection.update({
      where: { id: connectionId },
      data: { syncEnabled },
    });
    revalidatePath("/admin/integrations");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to toggle sync.",
    };
  }
}

export async function disconnectDiaAccountAction(connectionId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await prisma.storeConnection.delete({
      where: { id: connectionId },
    });
    revalidatePath("/admin/integrations");
    revalidatePath("/my-receipts");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to disconnect account.",
    };
  }
}
