import React from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import {
  FileText,
  Camera,
  Calendar,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { ExportDataMenu } from "@/components/common/export-data-menu";

export const dynamic = "force-dynamic";

export default async function MyReceiptsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/my-receipts");
  }

  let receipts: Array<{
    id: string;
    purchaseDate: Date;
    totalAmount: Prisma.Decimal | null;
    status: string;
    aiProvider: string | null;
    processingMs: number | null;
    store: { name: string; brandHex: string; slug: string };
    _count: { items: number };
  }> = [];

  try {
    receipts = await prisma.receipt.findMany({
      where: { userId: session.user.id },
      include: {
        store: true,
        _count: { select: { items: true } },
      },
      orderBy: { purchaseDate: "desc" },
    });
  } catch (error) {
    console.warn("[MyReceipts] Could not load user receipts from DB:", error);
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "CONFIRMED":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            CONFIRMED
          </span>
        );
      case "REVIEW":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
            REVIEW READY
          </span>
        );
      case "PROCESSING":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
            PROCESSING
          </span>
        );
      case "FAILED":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            FAILED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
            <span>HISTORY</span>
            <span>/</span>
            <span className="text-emerald-400">MY RECEIPTS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-emerald-400" />
            <span>My Grocery Receipts</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Digitized, parsed, and confirmed receipts on your account.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <ExportDataMenu range="all" />
          <Link
            href="/upload"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs whitespace-nowrap shrink-0 shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
          >
            <Camera className="w-4 h-4 stroke-[2.2]" />
            <span>Upload New Receipt</span>
          </Link>
        </div>
      </div>

      {/* Receipts List or Empty State */}
      {receipts.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-12 text-center max-w-xl mx-auto space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center mx-auto text-zinc-400">
            <FileText className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-zinc-200">
              You don&apos;t have any receipts recorded yet
            </h2>
            <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
              Take a photo of your receipt from Mercadona, Lidl, Carrefour, Alcampo, Consum, DIA or Aldi to start tracking prices and building your personal index.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs shadow-md shadow-emerald-500/20 transition-all"
            >
              <Camera className="w-4 h-4 stroke-[2.2]" />
              <span>Upload My First Receipt</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {receipts.map((r) => (
            <Link
              key={r.id}
              href={`/receipts/${r.id}/review`}
              className="group rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4 hover:border-zinc-700 hover:bg-zinc-900/90 hover:shadow-xl transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                {/* Top Row: Store Badge & Status */}
                <div className="flex items-center justify-between">
                  <span
                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-white shadow-sm"
                    style={{ backgroundColor: r.store.brandHex }}
                  >
                    {r.store.name}
                  </span>
                  {getStatusBadge(r.status)}
                </div>

                {/* Metadata Row: Date & Latency */}
                <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                    <span>
                      {new Date(r.purchaseDate).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "2-digit",
                      })}
                    </span>
                  </span>

                  {r.aiProvider && (
                    <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                      <Sparkles className="w-3 h-3 text-emerald-400" />
                      <span>{r.aiProvider}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Bottom Price & Items Strip */}
              <div className="border-t border-zinc-800/80 pt-3 flex items-baseline justify-between">
                <div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase">
                    Line Items
                  </div>
                  <div className="text-sm font-semibold text-zinc-300">
                    {r._count.items} {r._count.items === 1 ? "item" : "items"}
                  </div>
                </div>

                <div className="text-right flex items-center gap-2">
                  <div>
                    <div className="text-[10px] font-mono text-zinc-500 uppercase">
                      Total
                    </div>
                    <div className="text-lg font-bold font-mono text-white tabular-nums">
                      {r.totalAmount ? `€${Number(r.totalAmount).toFixed(2)}` : "—"}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all ml-1" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
