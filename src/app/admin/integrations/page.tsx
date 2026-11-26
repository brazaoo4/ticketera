import React from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminHeaderTabs } from "@/components/admin/admin-header-tabs";
import { DiaIntegrationClient } from "./dia-integration-client";

export const dynamic = "force-dynamic";

export default async function AdminIntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string; reconnect?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/");
  }

  const sp = await searchParams;
  const initialOpenModal = sp?.connect === "dia" || sp?.reconnect === "1";

  const rawInterval = Number(process.env.DIA_SYNC_INTERVAL_MINUTES);
  const syncIntervalMinutes =
    Number.isFinite(rawInterval) && rawInterval > 0
      ? Math.round(rawInterval)
      : 10;

  const connections = await prisma.storeConnection.findMany({
    select: {
      id: true,
      storeSlug: true,
      accountLabel: true,
      syncEnabled: true,
      status: true,
      lastSyncAt: true,
      lastKeepAliveAt: true,
      lastTicketDate: true,
      tokenExpiresAt: true,
      consecutiveFailures: true,
      totalSyncedCount: true,
      lastError: true,
      user: {
        select: {
          id: true,
          username: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-[1120px] mx-auto px-4 sm:px-6 py-7 sm:py-10 space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-display font-bold text-[28px] sm:text-[34px] leading-tight text-[var(--text-primary)]">
          Settings and administration
        </h1>
        <p className="text-[14px] text-[var(--text-muted)]">
          Connect supermarket accounts to import digital receipts automatically.
        </p>
      </div>

      <AdminHeaderTabs />

      <DiaIntegrationClient
        connections={connections}
        currentUserId={session.user.id}
        syncIntervalMinutes={syncIntervalMinutes}
        initialOpenModal={initialOpenModal}
      />
    </div>
  );
}
