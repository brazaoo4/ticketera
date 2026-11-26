"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Home,
  ShoppingBag,
  Camera,
  GitCompare,
  MoreHorizontal,
  Search,
  TrendingUp,
  Store,
  Receipt,
  Settings,
  LogOut,
  LogIn,
  X,
  ArrowRight,
} from "lucide-react";
import { SearchModal } from "./search-modal";
import { InstallAppButton } from "@/components/pwa/install-app-button";
import { BrandMark } from "@/components/common/brand-mark";
import { ThemeSwitch } from "@/components/providers/theme-provider";
import type { UserProfile } from "./app-shell";

export function MobileNav({
  user,
  publicCatalog = false,
}: {
  user?: UserProfile | null;
  publicCatalog?: boolean;
}) {
  const pathname = usePathname() || "/";
  const isLoginPage = pathname.startsWith("/login");
  const isReviewPage =
    pathname.includes("/receipts/") && pathname.includes("/review");

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  useEffect(() => {
    if (!isMoreOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMoreOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMoreOpen]);

  const showNav = !!user || publicCatalog;
  const uploadTarget = user ? "/upload" : "/login?callbackUrl=/upload";

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  const isMoreActive =
    pathname.startsWith("/my-stats") ||
    pathname.startsWith("/stores") ||
    pathname.startsWith("/my-receipts") ||
    pathname.startsWith("/receipts") ||
    pathname.startsWith("/admin");

  return (
    <>
      {/* Mobile Top Bar */}
      <header
        className={`md:hidden sticky top-0 z-40 w-full px-4 h-[58px] flex items-center justify-between gap-2 transition-colors ${
          isLoginPage
            ? "bg-transparent"
            : "bg-[var(--bg-header-scrolled)] backdrop-blur-md border-b border-[var(--border)]"
        }`}
      >
        <Link
          href="/"
          className="inline-flex items-center shrink-0"
          aria-label="Ticketera home"
        >
          <BrandMark compact />
        </Link>

        <div className="flex items-center gap-2 shrink-0">
          {!isLoginPage && showNav && !pathname.startsWith("/products") && (
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              aria-label="Search groceries"
              className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] inline-flex items-center justify-center shrink-0 cursor-pointer"
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          <ThemeSwitch />

          {!isLoginPage && !user && (
            <Link
              href="/login"
              className="h-8 px-3 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-semibold text-[var(--text-primary)] inline-flex items-center whitespace-nowrap shrink-0"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* Mobile Bottom Tab Bar (5 aligned items: Home | Groceries | + Scan | Compare | More) */}
      {!isLoginPage && !isReviewPage && showNav && (
        <nav
          aria-label="Mobile navigation"
          className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--bg-card)]/95 backdrop-blur-md border-t border-[var(--border)] px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          <div className="grid grid-cols-5 items-center max-w-md mx-auto">
            <Link
              href="/"
              aria-current={isActive("/") ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl text-[13px] font-medium transition-colors ${
                isActive("/")
                  ? "text-[var(--primary)] font-semibold"
                  : "text-[var(--text-muted)]"
              }`}
            >
              <Home className="w-[19px] h-[19px]" />
              <span className="whitespace-nowrap">Home</span>
            </Link>

            <Link
              href="/products"
              aria-current={isActive("/products") ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl text-[13px] font-medium transition-colors ${
                isActive("/products")
                  ? "text-[var(--primary)] font-semibold"
                  : "text-[var(--text-muted)]"
              }`}
            >
              <ShoppingBag className="w-[19px] h-[19px]" />
              <span className="whitespace-nowrap">Groceries</span>
            </Link>

            <Link
              href={uploadTarget}
              aria-current={isActive("/upload") ? "page" : undefined}
              className="flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl text-[13px] font-semibold text-[var(--primary)] transition-colors"
            >
              <Camera className="w-[19px] h-[19px]" />
              <span className="whitespace-nowrap">+ Scan</span>
            </Link>

            <Link
              href="/compare"
              aria-current={isActive("/compare") ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl text-[13px] font-medium transition-colors ${
                isActive("/compare")
                  ? "text-[var(--primary)] font-semibold"
                  : "text-[var(--text-muted)]"
              }`}
            >
              <GitCompare className="w-[19px] h-[19px]" />
              <span className="whitespace-nowrap">Compare</span>
            </Link>

            <button
              type="button"
              onClick={() => setIsMoreOpen(true)}
              aria-expanded={isMoreOpen}
              className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl text-[13px] font-medium transition-colors cursor-pointer ${
                isMoreActive
                  ? "text-[var(--primary)] font-semibold"
                  : "text-[var(--text-muted)]"
              }`}
            >
              <MoreHorizontal className="w-[19px] h-[19px]" />
              <span className="whitespace-nowrap">More</span>
            </button>
          </div>
        </nav>
      )}

      {/* Mobile More Bottom Sheet */}
      {isMoreOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-more-heading"
          className="md:hidden fixed inset-0 z-50 flex items-end justify-center bg-[var(--scrim)]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsMoreOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-t-3xl border-t border-[var(--border)] bg-[var(--bg-card)] px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2
                  id="mobile-more-heading"
                  className="font-display text-lg font-semibold text-[var(--text-primary)]"
                >
                  More pages
                </h2>
                {user && (
                  <p className="text-[13px] text-[var(--text-muted)]">
                    Signed in as {user.username}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsMoreOpen(false)}
                aria-label="Close menu"
                className="w-9 h-9 rounded-full border border-[var(--border)] inline-flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="divide-y divide-[var(--border)]">
              {user && (
                <Link
                  href="/my-stats"
                  onClick={() => setIsMoreOpen(false)}
                  className="flex items-center justify-between gap-3 py-3 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <TrendingUp className="w-4 h-4 text-[var(--primary)] shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-[15px] text-[var(--text-primary)]">
                        Spending
                      </div>
                      <div className="text-[13px] text-[var(--text-muted)]">
                        Monthly totals, basket trends, and VAT
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                </Link>
              )}

              <Link
                href="/stores"
                onClick={() => setIsMoreOpen(false)}
                className="flex items-center justify-between gap-3 py-3 text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Store className="w-4 h-4 text-[var(--primary)] shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-[15px] text-[var(--text-primary)]">
                      Supermarkets
                    </div>
                    <div className="text-[13px] text-[var(--text-muted)]">
                      Tracked chains and store prices
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
              </Link>

              {user && (
                <Link
                  href="/my-receipts"
                  onClick={() => setIsMoreOpen(false)}
                  className="flex items-center justify-between gap-3 py-3 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Receipt className="w-4 h-4 text-[var(--primary)] shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-[15px] text-[var(--text-primary)]">
                        Receipts
                      </div>
                      <div className="text-[13px] text-[var(--text-muted)]">
                        Browse and manage saved tickets
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                </Link>
              )}

              {user?.role === "ADMIN" && (
                <Link
                  href="/admin/settings"
                  onClick={() => setIsMoreOpen(false)}
                  className="flex items-center justify-between gap-3 py-3 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Settings className="w-4 h-4 text-[var(--primary)] shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-[15px] text-[var(--text-primary)]">
                        Settings and administration
                      </div>
                      <div className="text-[13px] text-[var(--text-muted)]">
                        Privacy, household users, and store sync
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                </Link>
              )}
            </div>

            <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between gap-3">
              <InstallAppButton className="h-9 px-3 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-primary)] text-[13px] font-medium inline-flex items-center gap-1.5" />

              {user ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsMoreOpen(false);
                    signOut({ callbackUrl: "/login" });
                  }}
                  className="h-9 px-4 rounded-full border border-[var(--border)] text-[var(--negative)] hover:bg-[var(--negative-tint)] text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer ml-auto"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign out</span>
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setIsMoreOpen(false)}
                  className="h-9 px-4 rounded-full bg-[var(--primary)] text-[var(--primary-on)] text-[13px] font-semibold inline-flex items-center gap-1.5 ml-auto"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign in</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </>
  );
}
