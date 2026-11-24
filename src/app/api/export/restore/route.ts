import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  executeBackupRestore,
  inspectBackupPayload,
} from "@/lib/backup/bundle";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let adminUser;
  try {
    adminUser = await requireAdminUser();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    const status = msg.startsWith("Forbidden") ? 403 : 401;
    return NextResponse.json({ error: msg }, { status });
  }

  const rateResult = await checkRateLimit({
    key: `backup-restore:${adminUser.id}`,
    limit: 12,
    windowSeconds: 15 * 60,
  });
  if (!rateResult.success) {
    return NextResponse.json(
      { error: "Too many restore requests. Please wait before retrying." },
      {
        status: 429,
        headers: { "Retry-After": String(rateResult.resetSeconds) },
      }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const action = String(formData.get("action") || "inspect");
    const mode = String(formData.get("mode") || "merge") === "replace"
      ? "replace"
      : "merge";
    const confirmReplace = String(formData.get("confirmReplace") || "").trim();

    if (!file || !(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "No backup archive (.zip or .json) uploaded." },
        { status: 400 }
      );
    }

    const maxBackupMb = parseInt(process.env.MAX_BACKUP_SIZE_MB || "250", 10);
    const maxBytes = maxBackupMb * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `Backup file exceeds ${maxBackupMb} MB limit.` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (action === "inspect") {
      const inspection = await inspectBackupPayload({
        buffer,
        filename: file.name,
      });
      return NextResponse.json({ success: true, inspection });
    }

    if (action === "restore") {
      const report = await executeBackupRestore({
        buffer,
        filename: file.name,
        adminUser,
        mode,
        confirmReplace,
      });

      revalidatePath("/", "layout");
      revalidatePath("/products");
      revalidatePath("/stores");
      revalidatePath("/compare");
      revalidatePath("/my-receipts");
      revalidatePath("/my-stats");
      revalidatePath("/admin/products");
      revalidatePath("/admin/settings");

      return NextResponse.json({ success: true, report });
    }

    return NextResponse.json(
      { error: `Unsupported action "${action}". Expected "inspect" or "restore".` },
      { status: 400 }
    );
  } catch (err) {
    console.error("[BackupRestoreRoute] Error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to inspect or restore backup bundle.",
      },
      { status: 400 }
    );
  }
}
