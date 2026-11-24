import React from "react";
import fs from "fs";
import path from "path";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Settings as SettingsIcon } from "lucide-react";
import { isPublicCatalogEnabled } from "@/lib/settings";
import { isDemoModeActive } from "@/lib/demo/demo-data";
import { UPLOAD_DIR } from "@/lib/receipts/preprocess";
import { SettingsClient } from "./settings-client";
import { AdminHeaderTabs } from "@/components/admin/admin-header-tabs";

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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner / Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
            <span>ADMINISTRATION</span>
            <span>/</span>
            <span className="text-emerald-400">SYSTEM SETTINGS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <SettingsIcon className="w-6 h-6 text-emerald-400" />
            <span>System Settings</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Manage instance privacy policies, access controls, backups, and system preferences.
          </p>
        </div>
      </div>

      {/* Admin Navigation Tabs */}
      <AdminHeaderTabs />

      {/* Interactive Settings Client */}
      <SettingsClient
        initialPublicCatalog={isPublicCatalog}
        isDemoActive={isDemoActive}
        systemInfo={systemInfo}
        backupSummary={backupSummary}
      />
    </div>
  );
}
