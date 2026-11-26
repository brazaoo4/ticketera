import React from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminHeaderTabs } from "@/components/admin/admin-header-tabs";
import { UserManagementClient } from "./user-management-client";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/");
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      role: true,
      enabled: true,
      createdAt: true,
      _count: {
        select: { receipts: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const serializedUsers = users.map((u) => ({
    ...u,
    role: u.role as "ADMIN" | "USER",
    createdAt: u.createdAt.toISOString(),
  }));

  const totalUsers = users.length;
  const adminCount = users.filter((u) => u.role === "ADMIN").length;
  const enabledCount = users.filter((u) => u.enabled).length;
  const totalReceipts = users.reduce((acc, u) => acc + u._count.receipts, 0);

  return (
    <div className="max-w-[1120px] mx-auto px-4 sm:px-6 py-7 sm:py-10 space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-display font-bold text-[28px] sm:text-[34px] leading-tight text-[var(--text-primary)]">
          Settings and administration
        </h1>
        <p className="text-[14px] text-[var(--text-muted)]">
          Manage household accounts, roles, password resets, and sign-in access.
        </p>
      </div>

      <AdminHeaderTabs />

      {/* 4-Column Hairline Metrics Strip */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] grid grid-cols-2 lg:grid-cols-4 overflow-hidden">
        <div className="p-4 sm:p-5 space-y-1">
          <div className="text-[13px] text-[var(--text-muted)]">
            Total accounts
          </div>
          <div className="font-display font-bold text-[24px] tabular-nums text-[var(--text-primary)]">
            {totalUsers}
          </div>
        </div>
        <div className="p-4 sm:p-5 space-y-1 border-l border-[var(--border)]">
          <div className="text-[13px] text-[var(--text-muted)]">
            Administrators
          </div>
          <div className="font-display font-bold text-[24px] tabular-nums text-[var(--text-primary)]">
            {adminCount}
          </div>
        </div>
        <div className="p-4 sm:p-5 space-y-1 border-t lg:border-t-0 lg:border-l border-[var(--border)]">
          <div className="text-[13px] text-[var(--text-muted)]">
            Active accounts
          </div>
          <div className="font-display font-bold text-[24px] tabular-nums text-[var(--positive)]">
            {enabledCount}
          </div>
        </div>
        <div className="p-4 sm:p-5 space-y-1 border-t lg:border-t-0 border-l border-[var(--border)]">
          <div className="text-[13px] text-[var(--text-muted)]">
            Receipts uploaded
          </div>
          <div className="font-display font-bold text-[24px] tabular-nums text-[var(--text-primary)]">
            {totalReceipts}
          </div>
        </div>
      </div>

      <UserManagementClient
        users={serializedUsers}
        currentUserId={session.user.id}
      />
    </div>
  );
}
