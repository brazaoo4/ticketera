import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  computeFileHash,
  detectMagicMimeType,
  preprocessReceipt,
  stitchAndPreprocessImages,
} from "@/lib/receipts/preprocess";
import { enqueueReceiptParse } from "@/lib/queue/receipt-queue";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return NextResponse.json(
      { error: "Unauthorized. Please sign in to upload receipts." },
      { status: 401 }
    );
  }

  // Rate Limiting: max 30 uploads per 15 minutes per user
  const rateResult = await checkRateLimit({
    key: `upload:${user.id}`,
    limit: 30,
    windowSeconds: 15 * 60,
  });

  if (!rateResult.success) {
    return NextResponse.json(
      { error: "Too many receipt uploads. Please wait a few minutes." },
      {
        status: 429,
        headers: { "Retry-After": String(rateResult.resetSeconds) },
      }
    );
  }

  try {
    const formData = await req.formData();
    // Gather all uploaded files (from "files" or "file")
    let rawFiles: File[] = formData.getAll("files") as File[];
    if (!rawFiles || rawFiles.length === 0) {
      rawFiles = formData.getAll("file") as File[];
    }
    // Filter out any empty entries
    const files = rawFiles.filter((f) => f && f.size > 0);

    const mode = (formData.get("mode") as string) || "batch"; // "batch" | "stitch"
    const storeIdParam = formData.get("storeId") as string | null;
    const purchaseDateParam = formData.get("purchaseDate") as string | null;

    if (files.length === 0) {
      return NextResponse.json(
        { error: "No receipt files provided." },
        { status: 400 }
      );
    }

    const maxMb = parseInt(process.env.MAX_UPLOAD_SIZE_MB || "50", 10);
    const maxSizeBytes = maxMb * 1024 * 1024;

    // Resolve store
    let effectiveStoreId: string | null = null;
    if (storeIdParam && storeIdParam !== "auto") {
      const storeExists = await prisma.store.findUnique({
        where: { id: storeIdParam },
      });
      if (storeExists) {
        effectiveStoreId = storeExists.id;
      }
    }

    // If no store selected, grab the first store from DB (or Mercadona)
    if (!effectiveStoreId) {
      const defaultStore = await prisma.store.findFirst({
        orderBy: { name: "asc" },
      });
      if (defaultStore) {
        effectiveStoreId = defaultStore.id;
      } else {
        const fallbackStore = await prisma.store.create({
          data: {
            name: "Mercadona",
            slug: "mercadona",
            brandHex: "#00754A",
          },
        });
        effectiveStoreId = fallbackStore.id;
      }
    }

    const purchaseDate =
      purchaseDateParam && !isNaN(new Date(purchaseDateParam).getTime())
        ? new Date(purchaseDateParam)
        : new Date();

    // MODE 1: Long Receipt Stitch Mode (when mode === 'stitch')
    if (mode === "stitch") {
      if (files.length < 2) {
        return NextResponse.json(
          { error: "Long Receipt stitch mode requires at least 2 images." },
          { status: 400 }
        );
      }

      const hasPdf = files.some(
        (f) =>
          f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
      );
      if (hasPdf) {
        return NextResponse.json(
          {
            error:
              "Long Receipt stitch mode only supports photos or images (JPG, PNG, WebP), not PDF documents.",
          },
          { status: 400 }
        );
      }

      const buffers: Buffer[] = [];
      for (const file of files) {
        if (file.size > maxSizeBytes) {
          return NextResponse.json(
            { error: `File ${file.name} exceeds ${maxMb} MB limit.` },
            { status: 400 }
          );
        }
        const ab = await file.arrayBuffer();
        const buf = Buffer.from(ab);
        const magic = detectMagicMimeType(buf);
        if (!magic || magic === "application/pdf") {
          return NextResponse.json(
            {
              error: `File ${file.name} is not a valid image (JPG, PNG, WebP).`,
            },
            { status: 400 }
          );
        }
        buffers.push(buf);
      }

      // Compute combined hash of all buffers concatenated for deduplication
      const combinedBuffer = Buffer.concat(buffers);
      const fileHash = computeFileHash(combinedBuffer);

      const existing = await prisma.receipt.findUnique({
        where: { fileHash },
        select: { id: true, status: true, totalAmount: true },
      });

      if (existing) {
        if (existing.status === "FAILED") {
          console.log(`[UploadRoute] Purging previous FAILED stitched receipt ${existing.id} for clean retry.`);
          await prisma.receipt.delete({ where: { id: existing.id } }).catch(() => null);
        } else {
          return NextResponse.json({
            duplicate: true,
            receiptId: existing.id,
            status: existing.status,
            message: "Stitched receipt has already been uploaded previously (SHA-256 duplicate match).",
            receipts: [
              {
                receiptId: existing.id,
                fileName: `Long Receipt (${files.length} photos)`,
                status: existing.status,
                duplicate: true,
              },
            ],
          });
        }
      }

      // Create preliminary Receipt record
      const receipt = await prisma.receipt.create({
        data: {
          userId: user.id,
          storeId: effectiveStoreId,
          purchaseDate,
          sourceFile: "temp",
          fileHash,
          status: "PENDING",
        },
      });

      // Stitch and enhance images into single receipt
      const preprocessed = await stitchAndPreprocessImages(buffers, receipt.id);

      await prisma.receipt.update({
        where: { id: receipt.id },
        data: { sourceFile: preprocessed.sourceFile },
      });

      // Enqueue job into BullMQ queue
      await enqueueReceiptParse(receipt.id);

      return NextResponse.json(
        {
          receiptId: receipt.id,
          status: "PENDING",
          message: "Long receipt stitched successfully and enqueued for AI extraction.",
          receipts: [
            {
              receiptId: receipt.id,
              fileName: `Long Receipt (${files.length} photos)`,
              status: "PENDING",
              duplicate: false,
            },
          ],
        },
        { status: 201 }
      );
    }

    // MODE 2: Batch (or single file) Mode: Process each file independently
    const results: Array<{
      receiptId: string;
      fileName: string;
      status: string;
      duplicate: boolean;
      error?: string;
    }> = [];

    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const fileBuffer = Buffer.from(arrayBuffer);
        const magicMime = detectMagicMimeType(fileBuffer);

        if (!magicMime) {
          results.push({
            receiptId: "",
            fileName: file.name,
            status: "FAILED",
            duplicate: false,
            error: "Unsupported format. Only images (JPG, PNG, WebP) or PDFs are accepted.",
          });
          continue;
        }

        const mimeType = magicMime || file.type || "image/jpeg";

        if (fileBuffer.length > maxSizeBytes) {
          results.push({
            receiptId: "",
            fileName: file.name,
            status: "FAILED",
            duplicate: false,
            error: `File exceeds ${maxMb} MB limit.`,
          });
          continue;
        }

        const fileHash = computeFileHash(fileBuffer);
        const existing = await prisma.receipt.findUnique({
          where: { fileHash },
          select: { id: true, status: true },
        });

        if (existing) {
          if (existing.status === "FAILED") {
            console.log(`[UploadRoute] Purging previous FAILED receipt ${existing.id} so user can retry.`);
            await prisma.receipt.delete({ where: { id: existing.id } }).catch(() => null);
          } else {
            results.push({
              receiptId: existing.id,
              fileName: file.name,
              status: existing.status,
              duplicate: true,
            });
            continue;
          }
        }

        const receipt = await prisma.receipt.create({
          data: {
            userId: user.id,
            storeId: effectiveStoreId,
            purchaseDate,
            sourceFile: "temp",
            fileHash,
            status: "PENDING",
          },
        });

        const preprocessed = await preprocessReceipt(
          receipt.id,
          fileBuffer,
          mimeType
        );

        await prisma.receipt.update({
          where: { id: receipt.id },
          data: { sourceFile: preprocessed.sourceFile },
        });

        await enqueueReceiptParse(receipt.id);

        results.push({
          receiptId: receipt.id,
          fileName: file.name,
          status: "PENDING",
          duplicate: false,
        });
      } catch (itemErr) {
        console.error(`[UploadRoute] Error processing file ${file.name}:`, itemErr);
        results.push({
          receiptId: "",
          fileName: file.name,
          status: "FAILED",
          duplicate: false,
          error: itemErr instanceof Error ? itemErr.message : "Processing error",
        });
      }
    }

    const firstSuccess = results.find((r) => r.receiptId && !r.duplicate) || results[0];

    return NextResponse.json(
      {
        receipts: results,
        receiptId: firstSuccess?.receiptId || null,
        status: firstSuccess?.status || "PENDING",
        duplicate: results.length === 1 ? results[0].duplicate : results.every((r) => r.duplicate),
        message: `${results.filter((r) => !r.duplicate && r.status !== "FAILED").length} receipts enqueued for processing.`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[UploadRoute] Upload error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal upload error.",
      },
      { status: 500 }
    );
  }
}
