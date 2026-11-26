import React from "react";
import fs from "fs";
import path from "path";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isPublicCatalogEnabled } from "@/lib/settings";
import { isDemoModeActive } from "@/lib/demo/demo-data";
import { UPLOAD_DIR } from "@/lib/receipts/preprocess";
import { AdminHeaderTabs } from "@/components/admin/admin-header-tabs";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/admin/settings");
  }
  if (session.user.role !== "ADMIN") {
    redirect("/");
  }

  const [
    isPublicCatalog,
    isDemoActive,
    receiptsCount,
    productsCount,
    budgetsCount,
  ] = await Promise.all([
    isPublicCatalogEnabled(),
    isDemoModeActive(),
    prisma.receipt.count().catch(() => 0),
    prisma.product.count().catch(() => 0),
    prisma.monthlyBudget.count().catch(() => 0),
  ]);

  let artifactFilesCount = 0;
  let artifactTotalBytes = 0;
  try {
    if (fs.existsSync(UPLOAD_DIR)) {
      const entries = await fs.promises.readdir(UPLOAD_DIR, {
        withFileTypes: true,
      });
      for (const ent of entries) {
        if (!ent.isFile()) continue;
        if (!/\.(webp|pdf|json)$/i.test(ent.name)) continue;
        const st = await fs.promises
          .stat(path.join(UPLOAD_DIR, ent.name))
          .catch(() => null);
        if (st) {
          artifactFilesCount++;
          artifactTotalBytes += st.size;
        }
      }
    }
  } catch {
    // ignore filesystem summary errors
  }

  const systemInfo = {
    hasGemini: !!process.env.GEMINI_API_KEY,
    hasGroq: !!process.env.GROQ_API_KEY,
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    uploadDir: UPLOAD_DIR,
  };

  const backupSummary = {
    receiptsCount,
    productsCount,
    budgetsCount,
    artifactFilesCount,
    artifactTotalMb: (artifactTotalBytes / (1024 * 1024)).toFixed(2),
  };

  return (
    <div className="max-w-[1120px] mx-auto px-4 sm:px-6 py-7 sm:py-10 space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-display font-bold text-[28px] sm:text-[34px] leading-tight text-[var(--text-primary)]">
          Settings and administration
        </h1>
        <p className="text-[14px] text-[var(--text-muted)]">
          Manage household privacy, sample data, backups, user accounts, store
          sync, and your grocery catalogue.
        </p>
      </div>

      <AdminHeaderTabs />

      <SettingsClient
        initialPublicCatalog={isPublicCatalog}
        isDemoActive={isDemoActive}
        systemInfo={systemInfo}
        backupSummary={backupSummary}
      />
    </div>
  );
}
