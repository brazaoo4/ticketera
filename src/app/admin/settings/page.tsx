import React from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Settings as SettingsIcon } from "lucide-react";
import { isPublicCatalogEnabled } from "@/lib/settings";
import { isDemoModeActive } from "@/lib/demo/demo-data";
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

  const isPublicCatalog = await isPublicCatalogEnabled();
  const isDemoActive = await isDemoModeActive();

  const systemInfo = {
    hasGemini: !!process.env.GEMINI_API_KEY,
    hasGroq: !!process.env.GROQ_API_KEY,
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    uploadDir: process.env.UPLOAD_DIR || "/app/uploads",
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
            Manage instance privacy policies, access controls, and system preferences.
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
      />
    </div>
  );
}
