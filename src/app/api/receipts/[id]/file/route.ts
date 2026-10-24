import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getReceiptFilePath } from "@/lib/receipts/preprocess";
import fs from "fs";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing receipt ID" }, { status: 400 });
  }

  let receipt = null;
  try {
    receipt = await prisma.receipt.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        sourceFile: true,
      },
    });
  } catch (err) {
    console.error(`[FileRoute] Database error fetching receipt ${id}:`, err);
  }

  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  // Non-admins can only view their own receipts
  if (user.role !== "ADMIN" && receipt.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let filePath: string;
  try {
    filePath = getReceiptFilePath(receipt.sourceFile);
  } catch {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { error: "Stored file not found on disk" },
      { status: 404 }
    );
  }

  try {
    const fileBuffer = await fs.promises.readFile(filePath);
    const isPdf = receipt.sourceFile.endsWith(".pdf");
    const contentType = isPdf ? "application/pdf" : "image/webp";

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename="${receipt.sourceFile}"`,
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    console.error(`[FileRoute] Error reading file for receipt ${id}:`, err);
    return NextResponse.json(
      { error: "Error reading receipt file" },
      { status: 500 }
    );
  }
}
