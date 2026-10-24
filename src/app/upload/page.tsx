import React from "react";
import { prisma } from "@/lib/db";
import { CORE_STORES } from "@/lib/startup";
import { UploadClient } from "./upload-client";

export const dynamic = "force-dynamic";

export default async function UploadPage({
  searchParams,
}: {
  searchParams?: Promise<{ receiptId?: string; duplicateId?: string; error?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const initialReceiptId = typeof resolvedParams.receiptId === "string" ? resolvedParams.receiptId : null;
  const initialDuplicateId = typeof resolvedParams.duplicateId === "string" ? resolvedParams.duplicateId : null;
  const initialError = typeof resolvedParams.error === "string" ? resolvedParams.error : null;

  let stores: Array<{
    id: string;
    name: string;
    slug: string;
    brandHex: string;
  }> = [];

  try {
    stores = await prisma.store.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        brandHex: true,
      },
    });
  } catch (error) {
    console.warn("[UploadPage] Could not load stores from DB, using fallback list:", error);
  }

  if (stores.length === 0) {
    stores = CORE_STORES.map((s, idx) => ({
      id: `fallback-${idx}`,
      name: s.name,
      slug: s.slug,
      brandHex: s.brandHex,
    }));
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <UploadClient
        stores={stores}
        initialReceiptId={initialReceiptId}
        initialDuplicateId={initialDuplicateId}
        initialError={initialError}
      />
    </div>
  );
}
