import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getReceiptArtifactPath, getReceiptFilePath } from "@/lib/receipts/preprocess";
import { renderPdfToImage } from "@/lib/receipts/pdf-extract";
import { ensureFreshDiaTicketWebp } from "@/lib/integrations/dia/render-ticket";
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
    console.error("[FileRoute] Database error fetching receipt:", id, err);
  }

  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  // Non-admins can only view their own receipts
  if (user.role !== "ADMIN" && receipt.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let companionPdfPath: string | null = null;
  let companionWebpPath: string | null = null;
  try {
    companionPdfPath = getReceiptArtifactPath(receipt.id, "pdf");
    companionWebpPath = getReceiptArtifactPath(receipt.id, "webp");
  } catch {
    return NextResponse.json({ error: "Invalid receipt identifier" }, { status: 400 });
  }

  let sourceFilePath: string | null = null;
  try {
    sourceFilePath = getReceiptFilePath(receipt.sourceFile);
  } catch {
    sourceFilePath = null;
  }

  const effectivePdfPath = fs.existsSync(companionPdfPath)
    ? companionPdfPath
    : (sourceFilePath && receipt.sourceFile.toLowerCase().endsWith(".pdf") && fs.existsSync(sourceFilePath)
      ? sourceFilePath
      : null);
  const hasOriginalPdf = Boolean(effectivePdfPath);

  const url = req.nextUrl;
  const wantOriginal = url.searchParams.get("original") === "true";
  const wantDownload = url.searchParams.get("download") === "true";

  // Case 1: Client explicitly requested the pristine original PDF
  if (wantOriginal && effectivePdfPath) {
    try {
      const pdfBuffer = await fs.promises.readFile(effectivePdfPath);
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": `${wantDownload ? "attachment" : "inline"}; filename="receipt-${receipt.id}.pdf"`,
          "Cache-Control": "private, max-age=86400",
        },
      });
    } catch (pdfErr) {
      console.error("[FileRoute] Error reading original PDF for receipt:", receipt.id, pdfErr);
      return NextResponse.json({ error: "Could not read original PDF" }, { status: 500 });
    }
  }

  // Case 2: Visual image display (WebP)
  await ensureFreshDiaTicketWebp(receipt.id).catch((err) =>
    console.warn("[FileRoute] DIA preview refresh failed for receipt:", receipt.id, err)
  );

  if (fs.existsSync(companionWebpPath)) {
    try {
      const [webpBuffer, stat] = await Promise.all([
        fs.promises.readFile(companionWebpPath),
        fs.promises.stat(companionWebpPath),
      ]);
      const etag = `"${stat.size}-${Math.trunc(stat.mtimeMs)}"`;
      const cacheControl = url.searchParams.has("v")
        ? "private, max-age=86400, stale-while-revalidate=3600"
        : "private, max-age=0, must-revalidate";

      return new NextResponse(new Uint8Array(webpBuffer), {
        status: 200,
        headers: {
          "Content-Type": "image/webp",
          "X-Content-Type-Options": "nosniff",
          "X-Has-Original-Pdf": hasOriginalPdf ? "true" : "false",
          "Content-Disposition": `inline; filename="${receipt.id}.webp"`,
          ETag: etag,
          "Cache-Control": cacheControl,
        },
      });
    } catch (webpErr) {
      console.error("[FileRoute] Error reading WebP companion for receipt:", receipt.id, webpErr);
    }
  }

  // Case 3: Receipt with PDF on disk -> on-demand render and cache WebP
  if (effectivePdfPath && !fs.existsSync(companionWebpPath)) {
    try {
      console.log("[FileRoute] On-demand rendering WebP for PDF receipt:", receipt.id);
      const rawPdf = await fs.promises.readFile(effectivePdfPath);
      const rendered = await renderPdfToImage(rawPdf);
      await fs.promises.writeFile(companionWebpPath, rendered);

      return new NextResponse(new Uint8Array(rendered), {
        status: 200,
        headers: {
          "Content-Type": "image/webp",
          "X-Content-Type-Options": "nosniff",
          "X-Has-Original-Pdf": "true",
          "Content-Disposition": `inline; filename="${receipt.id}.webp"`,
          "Cache-Control": "private, max-age=86400, stale-while-revalidate=3600",
        },
      });
    } catch (renderErr) {
      console.warn("[FileRoute] On-demand PDF render failed for receipt:", receipt.id, renderErr);
    }
  }

  // Case 4: Standard filePath from receipt.sourceFile
  if (!sourceFilePath || !fs.existsSync(sourceFilePath)) {
    return NextResponse.json(
      { error: "Stored file not found on disk" },
      { status: 404 }
    );
  }

  try {
    const fileBuffer = await fs.promises.readFile(sourceFilePath);
    const isPdf = sourceFilePath.endsWith(".pdf");
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
    console.error("[FileRoute] Error reading file for receipt:", receipt.id, err);
    return NextResponse.json(
      { error: "Error reading receipt file" },
      { status: 500 }
    );
  }
}
