"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, Users, Link2, ShoppingBag } from "lucide-react";

const ADMIN_TABS = [
  { href: "/admin/settings", label: "General", icon: Settings },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/integrations", label: "Store sync", icon: Link2 },
  { href: "/admin/products", label: "Product catalogue", icon: ShoppingBag },
] as const;

export function AdminHeaderTabs() {
  const pathname = usePathname();
  const activeTabRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        inline: "center",
        block: "nearest",
      });
    }
  }, [pathname]);

  return (
    <div className="border-b border-[var(--border)] -mx-4 px-4 sm:mx-0 sm:px-0">
      <nav
        aria-label="Settings and administration sections"
        className="flex items-center gap-5 overflow-x-auto no-scrollbar"
      >
        {ADMIN_TABS.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              ref={isActive ? activeTabRef : undefined}
              className={`inline-flex items-center gap-2 pb-3 pt-1 text-[14px] font-medium border-b-2 whitespace-nowrap shrink-0 transition-colors ${
                isActive
                  ? "border-[var(--primary)] text-[var(--text-primary)] font-semibold"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  isActive ? "text-[var(--primary)]" : "text-[var(--text-muted)]"
                }`}
              />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
