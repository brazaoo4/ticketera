"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  parseDiaAuthInput,
  fetchDiaTicketsPage,
  getDiaAccountLabel,
  getDiaJwtExpiration,
} from "@/lib/integrations/dia/client";
import { encryptCredentials } from "@/lib/crypto/vault";
import { syncDiaConnection } from "@/lib/queue/dia-sync-worker";
import { ensureDiaSyncSchedule } from "@/lib/queue/dia-sync-queue";

async function resolveAuthUser() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized. Please log in.");
  }

  let user = null;
  if (session.user.id) {
    user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
  }

  if (!user && session.user.username) {
    user = await prisma.user.findUnique({
      where: { username: session.user.username },
    });
  }

  if (!user) {
    user = await prisma.user.findFirst({
      where: { role: "ADMIN", enabled: true },
    });
  }

  if (!user) {
    throw new Error("User account not found in database. Please log out and log in again.");
  }

  return { session, user };
}

async function verifyConnectionOwnership(connectionId: string) {
  const { session, user } = await resolveAuthUser();

  const connection = await prisma.storeConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, userId: true },
  });

  if (!connection) {
    throw new Error("Store connection not found.");
  }

  if (session.user.role !== "ADMIN" && connection.userId !== user.id) {
    throw new Error("Forbidden: You do not have permission to manage this connection.");
  }

  return { session, connection, user };
}

export async function connectDiaAccountAction(rawInput: string) {
  let authData;
  try {
    authData = await resolveAuthUser();
  } catch (authErr) {
    return {
      success: false,
      error: authErr instanceof Error ? authErr.message : "Unauthorized. Please log in.",
    };
  }

  const { user } = authData;

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
  const tokenExpiresAt = getDiaJwtExpiration(updatedCreds.customerAccess);
  const encryptedAuthData = encryptCredentials(updatedCreds);

  let connection;
  try {
    connection = await prisma.storeConnection.upsert({
      where: {
        userId_storeSlug: {
          userId: user.id,
          storeSlug: "dia",
        },
      },
      create: {
        userId: user.id,
        storeSlug: "dia",
        accountLabel,
        encryptedAuthData,
        status: "ACTIVE",
        syncEnabled: true,
        lastSyncAt: new Date(),
        lastKeepAliveAt: new Date(),
        tokenExpiresAt,
        consecutiveFailures: 0,
      },
      update: {
        accountLabel,
        encryptedAuthData,
        status: "ACTIVE",
        syncEnabled: true,
        lastKeepAliveAt: new Date(),
        tokenExpiresAt,
        consecutiveFailures: 0,
        lastError: null,
      },
    });
  } catch (dbErr) {
    return {
      success: false,
      error: dbErr instanceof Error ? dbErr.message : "Failed to save connection to database.",
    };
  }

  // Ensure background keepalive scheduler is active
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
