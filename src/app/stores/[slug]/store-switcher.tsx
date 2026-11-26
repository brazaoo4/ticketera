"use client";

import React from "react";
import { useRouter } from "next/navigation";

export function StoreSwitcher({
  stores,
  currentSlug,
}: {
  stores: Array<{ slug: string; name: string }>;
  currentSlug: string;
}) {
  const router = useRouter();

  return (
    <select
      value={currentSlug}
      onChange={(e) => router.push(`/stores/${e.target.value}`)}
      aria-label="Switch supermarket"
      className="h-9 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] cursor-pointer"
    >
      {stores.map((s) => (
        <option key={s.slug} value={s.slug}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
