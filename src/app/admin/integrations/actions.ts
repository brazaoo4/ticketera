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
import { ensureDiaSyncSchedule } from "@/lib/queue/dia-sync-queue";

async function verifyConnectionOwnership(connectionId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized. Please log in.");
  }

  const connection = await prisma.storeConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, userId: true },
  });

  if (!connection) {
    throw new Error("Store connection not found.");
  }

  if (session.user.role !== "ADMIN" && connection.userId !== session.user.id) {
    throw new Error("Forbidden: You do not have permission to manage this connection.");
  }

  return { session, connection };
}

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

  // Ensure background 35-minute scheduler is active
  ensureDiaSyncSchedule().catch(() => null);

  // Execute immediate initial sync so tickets are ready right away
  let importedCount = 0;
  try {
    const syncRes = await syncDiaConnection(connection.id, { forceImport: true });
    importedCount = syncRes.importedCount ?? 0;
  } catch (syncErr) {
    console.warn("[DiaConnect] Initial sync warning:", syncErr);
  }

  revalidatePath("/admin/integrations");
  revalidatePath("/my-receipts");
  return {
    success: true,
    accountLabel,
    importedCount,
    message:
      importedCount > 0
        ? `Connected to Club Dia (${accountLabel})! Imported ${importedCount} new ${
            importedCount === 1 ? "receipt" : "receipts"
          }.`
        : `Connected successfully to Club Dia (${accountLabel})! All receipts are up to date.`,
  };
}

export async function syncDiaNowAction(connectionId: string) {
  try {
    await verifyConnectionOwnership(connectionId);
    const res = await syncDiaConnection(connectionId, { forceImport: true });
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
  try {
    await verifyConnectionOwnership(connectionId);
    await prisma.storeConnection.update({
      where: { id: connectionId },
      data: { syncEnabled },
    });
    revalidatePath("/admin/integrations");
    revalidatePath("/my-receipts");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to toggle sync.",
    };
  }
}

export async function disconnectDiaAccountAction(connectionId: string) {
  try {
    await verifyConnectionOwnership(connectionId);
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
