import React from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Link2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { AdminHeaderTabs } from "@/components/admin/admin-header-tabs";
import { DiaIntegrationClient } from "./dia-integration-client";
import { getDiaSyncIntervalMinutes } from "@/lib/integrations/dia/sync-policy";

export const dynamic = "force-dynamic";

export default async function AdminIntegrationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/admin/integrations");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/");
  }

  const resolvedParams = searchParams ? await searchParams : {};
  const initialOpenModal = resolvedParams.reconnect === "1";
  const syncIntervalMinutes = getDiaSyncIntervalMinutes();

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
        select: { id: true, username: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner / Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
            <span>ADMINISTRATION</span>
            <span>/</span>
            <span className="text-emerald-400">EXTERNAL INTEGRATIONS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Link2 className="w-6 h-6 text-emerald-400" />
            <span>Store Integrations</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Direct supermarket account connections for automatic receipt ingestion without OCR or headless browsers.
          </p>
        </div>
      </div>

      {/* Admin Navigation Tabs */}
      <AdminHeaderTabs />

      {/* Main Content */}
      <DiaIntegrationClient
        connections={connections}
        currentUserId={session.user.id}
        syncIntervalMinutes={syncIntervalMinutes}
        initialOpenModal={initialOpenModal}
      />
    </div>
  );
}
