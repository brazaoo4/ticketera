import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  computeFileHash,
  detectMagicMimeType,
  preprocessReceipt,
} from "@/lib/receipts/preprocess";
import { enqueueReceiptParse } from "@/lib/queue/receipt-queue";

export const dynamic = "force-dynamic";

/**
 * Android Web Share Target handler.
 * Receives shared image or PDF tickets directly from Android's native share sheet (e.g. Mercadona/Lidl app).
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return NextResponse.redirect(new URL("/login?callbackUrl=/upload", req.url), 303);
  }

  // Rate Limiting: max 30 uploads per 15 minutes per user
  const rateResult = await checkRateLimit({
    key: `upload:${user.id}`,
    limit: 30,
    windowSeconds: 15 * 60,
  });

  if (!rateResult.success) {
    return NextResponse.redirect(new URL("/upload?error=ratelimit", req.url), 303);
  }

  try {
    const formData = await req.formData();

    // 1. Locate the shared file (primary field is "file", with fallback scan for any shared file)
    let file = formData.get("file") as File | null;
    if (!file || typeof file === "string" || file.size === 0) {
      for (const [, val] of formData.entries()) {
        if (val && typeof val === "object" && "arrayBuffer" in val && (val as File).size > 0) {
          file = val as File;
          break;
        }
      }
    }

    if (!file || file.size === 0) {
      console.warn("[UploadShare] No valid file found in share payload.");
      return NextResponse.redirect(new URL("/upload?error=nofile", req.url), 303);
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // Validate binary magic bytes (must be JPEG, PNG, WebP, HEIC/AVIF, or PDF)
    const magicMime = detectMagicMimeType(fileBuffer);
    if (!magicMime) {
      console.warn("[UploadShare] Rejected file with invalid magic bytes.");
      return NextResponse.redirect(new URL("/upload?error=invalidtype", req.url), 303);
    }

    const mimeType = magicMime;

    // 2. Validate upload size limit (up to 50MB)
    const maxMb = parseInt(process.env.MAX_UPLOAD_SIZE_MB || "50", 10);
    const maxSizeBytes = maxMb * 1024 * 1024;
    if (fileBuffer.length > maxSizeBytes) {
      console.warn(`[UploadShare] Shared file exceeds ${maxMb}MB limit (${fileBuffer.length} bytes).`);
      return NextResponse.redirect(new URL("/upload?error=toolarge", req.url), 303);
    }

    // 3. SHA-256 deduplication
    const fileHash = computeFileHash(fileBuffer);
    const existing = await prisma.receipt.findUnique({
      where: { fileHash },
      select: { id: true, status: true },
    });

    if (existing) {
      if (existing.status === "FAILED") {
        console.log(`[UploadShare] Purging previous FAILED receipt ${existing.id} so user can re-share.`);
        await prisma.receipt.delete({ where: { id: existing.id } }).catch(() => null);
      } else {
        return NextResponse.redirect(
          new URL(`/upload?duplicateId=${existing.id}&receiptId=${existing.id}`, req.url),
          303
        );
      }
    }

    // 4. Resolve default supermarket (will be refined by AI vision pipeline during worker parse)
    let effectiveStoreId: string;
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

    // 5. Create preliminary Receipt record
    const receipt = await prisma.receipt.create({
      data: {
        userId: user.id,
        storeId: effectiveStoreId,
        purchaseDate: new Date(),
        sourceFile: "temp",
        fileHash,
        status: "PENDING",
      },
    });

    // 6. Preprocess image (Sharp thermal contrast enhancement or PDF text extraction)
    const preprocessed = await preprocessReceipt(
      receipt.id,
      fileBuffer,
      mimeType
    );

    // 7. Update with permanent storage path
    await prisma.receipt.update({
      where: { id: receipt.id },
      data: { sourceFile: preprocessed.sourceFile },
    });

    // 8. Enqueue background AI extraction in BullMQ
    await enqueueReceiptParse(receipt.id);

    // 9. Redirect to the upload workstation with active status polling
    return NextResponse.redirect(
      new URL(`/upload?receiptId=${receipt.id}&shared=1`, req.url),
      303
    );
  } catch (error) {
    console.error("[UploadShare] Unexpected error processing shared receipt:", error);
    return NextResponse.redirect(new URL("/upload?error=processing", req.url), 303);
  }
}

/**
 * Handle direct GET navigation or browser reload on /upload-share gracefully.
 */
export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/upload", req.url), 303);
}
