import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getReceiptFilePath } from "@/lib/receipts/preprocess";
import { renderPdfToImage } from "@/lib/receipts/pdf-extract";
import fs from "fs";
import path from "path";

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

  const uploadDir =
    process.env.UPLOAD_DIR ||
    (process.env.NODE_ENV === "production"
      ? "/app/uploads"
      : path.join(process.cwd(), "uploads"));

  const companionPdfPath = path.join(uploadDir, `${id}.pdf`);
  const companionWebpPath = path.join(uploadDir, `${id}.webp`);
  const hasOriginalPdf = fs.existsSync(companionPdfPath);

  const url = req.nextUrl;
  const wantOriginal = url.searchParams.get("original") === "true";

  // Case 1: Client explicitly requested the pristine original PDF
  if (wantOriginal && hasOriginalPdf) {
    try {
      const pdfBuffer = await fs.promises.readFile(companionPdfPath);
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": `attachment; filename="receipt-${id}.pdf"`,
          "Cache-Control": "private, max-age=86400",
        },
      });
    } catch (pdfErr) {
      console.error(`[FileRoute] Error reading original PDF for ${id}:`, pdfErr);
      return NextResponse.json({ error: "Could not read original PDF" }, { status: 500 });
    }
  }

  // Case 2: Visual image display (WebP)
  if (fs.existsSync(companionWebpPath)) {
    try {
      const webpBuffer = await fs.promises.readFile(companionWebpPath);
      return new NextResponse(new Uint8Array(webpBuffer), {
        status: 200,
        headers: {
          "Content-Type": "image/webp",
          "X-Content-Type-Options": "nosniff",
          "X-Has-Original-Pdf": hasOriginalPdf ? "true" : "false",
          "Content-Disposition": `inline; filename="${id}.webp"`,
          "Cache-Control": "private, max-age=86400, stale-while-revalidate=3600",
        },
      });
    } catch (webpErr) {
      console.error(`[FileRoute] Error reading WebP companion for ${id}:`, webpErr);
    }
  }

  // Case 3: Legacy receipt with only .pdf on disk -> on-demand render and cache WebP
  if (hasOriginalPdf && !fs.existsSync(companionWebpPath)) {
    try {
      console.log(`[FileRoute] On-demand rendering WebP for legacy PDF receipt ${id}...`);
      const rawPdf = await fs.promises.readFile(companionPdfPath);
      const rendered = await renderPdfToImage(rawPdf);
      await fs.promises.writeFile(companionWebpPath, rendered);

      return new NextResponse(new Uint8Array(rendered), {
        status: 200,
        headers: {
          "Content-Type": "image/webp",
          "X-Content-Type-Options": "nosniff",
          "X-Has-Original-Pdf": "true",
          "Content-Disposition": `inline; filename="${id}.webp"`,
          "Cache-Control": "private, max-age=86400, stale-while-revalidate=3600",
        },
      });
    } catch (renderErr) {
      console.warn(`[FileRoute] On-demand PDF render failed for ${id}:`, renderErr);
    }
  }

  // Case 4: Standard filePath from receipt.sourceFile
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
    const isPdf = filePath.endsWith(".pdf");
    const contentType = isPdf ? "application/pdf" : "image/webp";

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "X-Has-Original-Pdf": hasOriginalPdf ? "true" : "false",
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
