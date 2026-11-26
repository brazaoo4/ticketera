import React from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  MyReceiptsClient,
  type SerializedMyReceipt,
  type DiaConnectionSummary,
} from "./my-receipts-client";

export const dynamic = "force-dynamic";

export default async function MyReceiptsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/my-receipts");
  }

  const isAdmin = session.user.role === "ADMIN";

  let currentUserId = session.user.id;
  try {
    const dbUser = await prisma.user.findFirst({
      where: {
        OR: [
          ...(session.user.id ? [{ id: session.user.id }] : []),
          ...(session.user.username ? [{ username: session.user.username }] : []),
          ...(session.user.name ? [{ username: session.user.name }] : []),
        ],
      },
      select: { id: true, role: true },
    });
    if (dbUser) {
      currentUserId = dbUser.id;
    }
  } catch {
    // Keep JWT user id fallback
  }

  let initialReceipts: SerializedMyReceipt[] = [];

  try {
    const receipts = await prisma.receipt.findMany({
      where: isAdmin ? {} : { userId: currentUserId },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
            brandHex: true,
          },
        },
        user: { select: { username: true } },
        _count: { select: { items: true } },
        items: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            rawName: true,
            suggestedName: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            baseUnit: true,
            unitMeasure: true,
            pricePerBaseUnit: true,
            isDiscount: true,
            excluded: true,
            product: {
              select: {
                slug: true,
                displayName: true,
              },
            },
          },
        },
      },
      orderBy: { purchaseDate: "desc" },
    });

    initialReceipts = receipts.map((r) => ({
      id: r.id,
      purchaseDate: r.purchaseDate.toISOString(),
      totalAmount: r.totalAmount ? Number(r.totalAmount) : 0,
      status: r.status,
      sourceFile: r.sourceFile,
      errorMessage: r.errorMessage,
      store: {
        id: r.store.id,
        name: r.store.name,
        slug: r.store.slug,
        brandHex: r.store.brandHex,
      },
      uploaderUsername: r.user?.username ?? null,
      itemCount: r._count.items,
      taxBreakdown: Array.isArray(r.taxBreakdown)
        ? (
            r.taxBreakdown as Array<{
              rate: number;
              baseAmount: number;
              taxAmount: number;
            }>
          ).map((t) => ({
            rate: Number(t.rate) || 0,
            baseAmount: Number(t.baseAmount) || 0,
            taxAmount: Number(t.taxAmount) || 0,
          }))
        : null,
      items: r.items.map((item) => ({
        id: item.id,
        rawName: item.rawName,
        suggestedName: item.suggestedName,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
        baseUnit: (item.baseUnit as "KG" | "L" | "UNIT") || "UNIT",
        unitMeasure: Number(item.unitMeasure),
        pricePerBaseUnit: Number(item.pricePerBaseUnit),
        isDiscount: item.isDiscount,
        excluded: item.excluded,
        productSlug: item.product?.slug ?? null,
        productName: item.product?.displayName ?? null,
      })),
    }));
  } catch (error) {
    console.warn("[MyReceipts] Could not load user receipts:", error);
  }

  let diaConn: DiaConnectionSummary | null = null;
  try {
    const conn = await prisma.storeConnection.findFirst({
      where: isAdmin
        ? { storeSlug: "dia" }
        : { userId: currentUserId, storeSlug: "dia" },
      select: {
        id: true,
        status: true,
        syncEnabled: true,
        totalSyncedCount: true,
      },
    });
    if (conn) {
      diaConn = conn;
    }
  } catch {
    // Ignore store connection lookup error
  }

  return (
    <MyReceiptsClient
      initialReceipts={initialReceipts}
      diaConn={diaConn}
      isAdmin={isAdmin}
    />
  );
}
