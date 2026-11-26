"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DesktopNav } from "./desktop-nav";
import { MobileNav } from "./mobile-nav";
import { BrandMark } from "@/components/common/brand-mark";
import { DemoBanner } from "@/components/demo/demo-banner";
import { DiaReauthBanner } from "@/components/integrations/dia-reauth-banner";

export interface UserProfile {
  id: string;
  username: string;
  role: "ADMIN" | "USER";
}

export function AppShell({
  children,
  user,
  isDemoActive = false,
  publicCatalog = false,
  diaReauthRequired = false,
}: {
  children: React.ReactNode;
  user?: UserProfile | null;
  isDemoActive?: boolean;
  publicCatalog?: boolean;
  diaReauthRequired?: boolean;
}) {
  const pathname = usePathname() || "/";
  const isLoginPage = pathname.startsWith("/login");
  const showNavLinks = !!user || publicCatalog;

  return (
    <div className="min-h-screen flex flex-col app-wash text-[var(--text-primary)] selection:bg-[var(--primary)] selection:text-[var(--primary-on)]">
      {!isLoginPage && isDemoActive && !!user && <DemoBanner />}

      {!isLoginPage && diaReauthRequired && user?.role === "ADMIN" && (
        <DiaReauthBanner />
      )}

      <DesktopNav user={user} publicCatalog={publicCatalog} />

      <MobileNav user={user} publicCatalog={publicCatalog} />

      <main
        className={
          isLoginPage ? "flex-1 flex flex-col" : "flex-1 pb-24 md:pb-12"
        }
      >
        {children}
      </main>

      {!isLoginPage && (
        <footer className="hidden md:block border-t border-[var(--border)] bg-[var(--bg-page)]/80 py-6 text-[13px] text-[var(--text-muted)]">
          <div className="max-w-[1120px] mx-auto px-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <BrandMark compact />
              <span aria-hidden="true">·</span>
              <span>Everyday grocery prices and receipts</span>
            </div>

            {showNavLinks && (
              <div className="flex items-center gap-6 whitespace-nowrap shrink-0">
                <Link
                  href="/products"
                  className="hover:text-[var(--text-primary)] transition-colors"
                >
                  Groceries
                </Link>
                <Link
                  href="/compare"
                  className="hover:text-[var(--text-primary)] transition-colors"
                >
                  Compare
                </Link>
                <Link
                  href="/stores"
                  className="hover:text-[var(--text-primary)] transition-colors"
                >
                  Supermarkets
                </Link>
              </div>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
