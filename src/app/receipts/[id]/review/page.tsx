import React from "react";
import { requireAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ReviewWorkstation, SerializedReceipt, SerializedStore } from "./review-workstation";

export const dynamic = "force-dynamic";

export default async function ReceiptReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    redirect(`/login?callbackUrl=/receipts/${id}/review`);
  }

  let receipt = null;
  let stores: SerializedStore[] = [];

  try {
    const [dbReceipt, dbStores] = await Promise.all([
      prisma.receipt.findUnique({
        where: { id },
        include: {
          store: true,
          items: {
            orderBy: [
              { excluded: "asc" },
              { matchConfidence: "asc" },
              { rawName: "asc" },
            ],
            include: { product: true },
          },
        },
      }),
      prisma.store.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          brandHex: true,
          slug: true,
        },
      }),
    ]);

    receipt = dbReceipt;
    stores = dbStores;
  } catch (err) {
    console.error("[ReceiptReview] Error querying database:", err);
  }

  if (!receipt) {
    notFound();
  }

  // Permission check: only owner or ADMIN
  if (user.role !== "ADMIN" && receipt.userId !== user.id) {
    redirect("/my-receipts");
  }

  // 1. Auto-rematch check: If any unconfirmed item on current receipt has matchConfidence < 1.0,
  // check if an exact (storeId, rawAlias) was trained recently in ProductAlias
  if (receipt.status === "REVIEW") {
    const unmappedItems = receipt.items.filter(
      (item) => (!item.productId || Number(item.matchConfidence) < 1.0) && !item.excluded && !item.isDiscount
    );

    if (unmappedItems.length > 0 && receipt.storeId) {
      for (const item of unmappedItems) {
        const cleanRaw = item.rawName.trim().toUpperCase();
        if (!cleanRaw) continue;

        const alias = await prisma.productAlias.findUnique({
          where: {
            storeId_rawAlias: {
              storeId: receipt.storeId,
              rawAlias: cleanRaw,
            },
          },
          include: { product: true },
        });

        if (alias) {
          const effectiveBaseUnit = alias.product.baseUnit;
          let newUnitMeasure = Number(item.unitMeasure) || 1;
          let newPricePerBaseUnit = Number(item.pricePerBaseUnit) || 0;

          if (alias.unitMeasurePerPack !== null && !alias.isVariableWeight) {
            const packMeasure = Number(alias.unitMeasurePerPack);
            const qty = Number(item.quantity) || 1;
            newUnitMeasure = Number((qty * packMeasure).toFixed(3));
            newPricePerBaseUnit =
              newUnitMeasure > 0
                ? Number((Number(item.totalPrice) / newUnitMeasure).toFixed(2))
                : 0;
          }

          await prisma.receiptItem.update({
            where: { id: item.id },
            data: {
              productId: alias.productId,
              matchConfidence: 1.0,
              baseUnit: effectiveBaseUnit,
              unitMeasure: newUnitMeasure,
              pricePerBaseUnit: newPricePerBaseUnit,
            },
          });

          // Update in-memory item for immediate presentation
          item.productId = alias.productId;
          item.matchConfidence = 1.0 as unknown as typeof item.matchConfidence;
          item.product = alias.product;
          item.baseUnit = effectiveBaseUnit;
          item.unitMeasure = newUnitMeasure as unknown as typeof item.unitMeasure;
          item.pricePerBaseUnit = newPricePerBaseUnit as unknown as typeof item.pricePerBaseUnit;
        }
      }
    }
  }

  // 2. Query other receipts in REVIEW status owned by the user for the rapid review queue
  const pendingReviewReceipts = await prisma.receipt.findMany({
    where: {
      userId: user.id,
      status: "REVIEW",
      id: { not: receipt.id },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const nextPendingId = pendingReviewReceipts[0]?.id || null;
  const pendingReviewCount = pendingReviewReceipts.length;

  // Serialize Decimal objects to plain numbers for client component props
  const serializedReceipt: SerializedReceipt = {
    id: receipt.id,
    storeId: receipt.storeId,
    purchaseDate: receipt.purchaseDate.toISOString(),
    totalAmount: receipt.totalAmount ? Number(receipt.totalAmount) : 0,
    status: receipt.status as "REVIEW" | "CONFIRMED",
    aiProvider: receipt.aiProvider,
    processingMs: receipt.processingMs,
    sourceFile: receipt.sourceFile,
    taxBreakdown: Array.isArray(receipt.taxBreakdown)
      ? (receipt.taxBreakdown as Array<{ rate: number; baseAmount: number; taxAmount: number }>).map((t) => ({
          rate: Number(t.rate) || 0,
          baseAmount: Number(t.baseAmount) || 0,
          taxAmount: Number(t.taxAmount) || 0,
        }))
      : null,
    store: {
      id: receipt.store.id,
      name: receipt.store.name,
      brandHex: receipt.store.brandHex,
      slug: receipt.store.slug,
    },
    items: receipt.items.map((item) => ({
      id: item.id,
      rawName: item.rawName,
      suggestedName: item.suggestedName || item.rawName,
      suggestedCat: item.suggestedCat,
      matchConfidence: Number(item.matchConfidence) || 0,
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unitPrice) || 0,
      totalPrice: Number(item.totalPrice) || 0,
      baseUnit: (item.baseUnit as "KG" | "L" | "UNIT") || "UNIT",
      unitMeasure: Number(item.unitMeasure) || 1,
      pricePerBaseUnit: Number(item.pricePerBaseUnit) || 0,
      isDiscount: !!item.isDiscount,
      excluded: !!item.excluded,
      confirmed: !!item.confirmed,
      productId: item.productId,
      product: item.product
        ? {
            id: item.product.id,
            displayName: item.product.displayName,
            category: item.product.category,
            baseUnit: item.product.baseUnit as "KG" | "L" | "UNIT",
            isStaple: !!item.product.isStaple,
          }
        : null,
    })),
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Breadcrumbs */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
          <Link
            href="/my-receipts"
            className="hover:text-zinc-200 transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Receipts</span>
          </Link>
          <span>/</span>
          <span className="text-emerald-400 font-semibold">
            Review Receipt #{receipt.id.slice(-8)}
          </span>
        </div>

        {pendingReviewCount > 0 && (
          <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 font-semibold whitespace-nowrap shrink-0">
            Review Queue: {pendingReviewCount} {pendingReviewCount === 1 ? "pending" : "pending"}
          </span>
        )}
      </div>

      {/* Main Review Workstation Component */}
      <ReviewWorkstation
        receipt={serializedReceipt}
        stores={stores}
        currentUserRole={user.role}
        nextPendingId={nextPendingId}
        pendingReviewCount={pendingReviewCount}
      />
    </div>
  );
}
