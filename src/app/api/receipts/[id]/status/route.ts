import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

  try {
    const receipt = await prisma.receipt.findUnique({
      where: { id },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
            brandHex: true,
          },
        },
        _count: {
          select: { items: true },
        },
      },
    });

    if (!receipt) {
      return NextResponse.json(
        { error: "Receipt not found" },
        { status: 404 }
      );
    }

    // Access check: User must own the receipt or be ADMIN
    if (user.role !== "ADMIN" && receipt.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      id: receipt.id,
      status: receipt.status,
      aiProvider: receipt.aiProvider,
      processingMs: receipt.processingMs,
      errorMessage: receipt.errorMessage,
      itemCount: receipt._count.items,
      totalAmount: receipt.totalAmount ? Number(receipt.totalAmount) : null,
      purchaseDate: receipt.purchaseDate,
      store: receipt.store,
    });
  } catch (err) {
    console.error(`[StatusRoute] Error fetching status for ${id}:`, err);
    return NextResponse.json(
      { error: "Error fetching receipt status" },
      { status: 500 }
    );
  }
}
