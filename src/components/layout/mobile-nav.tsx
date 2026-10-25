"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Receipt,
  Camera,
  Search,
  LogIn,
  LogOut,
  Shield,
  ShoppingBag,
  GitCompare,
  Store,
  FileText,
  TrendingUp,
  ChevronDown,
  Settings,
} from "lucide-react";
import { SearchModal } from "./search-modal";
import { InstallAppButton } from "@/components/pwa/install-app-button";

interface UserProfile {
  id: string;
  username: string;
  role: "ADMIN" | "USER";
}

export function MobileNav({
  user,
  publicCatalog = false,
}: {
  user?: UserProfile | null;
  publicCatalog?: boolean;
}) {
  const pathname = usePathname();
  const isReviewPage = pathname.includes("/receipts/") && pathname.includes("/review");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getPageTitle = (path: string) => {
    if (path === "/") return "Home";
    if (path.startsWith("/products")) return "Products";
    if (path.startsWith("/compare")) return "Compare";
    if (path.startsWith("/stores")) return "Stores";
    if (path.startsWith("/upload")) return "Upload Receipt";
    if (path.startsWith("/my-receipts")) return "My Receipts";
    if (path.startsWith("/my-stats")) return "My Spending";
    if (path.startsWith("/admin/products")) return "Product Catalogue";
    if (path.startsWith("/admin/users")) return "User Management";
    if (path.startsWith("/admin/settings")) return "System Settings";
    if (path.startsWith("/admin")) return "Admin Console";
    if (path.startsWith("/login")) return "Sign In";
    return "Ticketera";
  };

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  const uploadTarget = user ? "/upload" : "/login?callbackUrl=/upload";
  const showNav = !!user || publicCatalog;

  return (
    <>
      {/* Mobile Top Header */}
      <header className="lg:hidden sticky top-0 z-40 w-full backdrop-blur-md bg-zinc-950/90 border-b border-zinc-800/80 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Link
            href="/"
            className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0"
          >
            <Receipt className="w-4 h-4 stroke-[2.2]" />
          </Link>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5 whitespace-nowrap shrink-0">
              <span>{getPageTitle(pathname)}</span>
              {user?.role === "ADMIN" && pathname.startsWith("/admin") && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 whitespace-nowrap shrink-0">
                  ADMIN
                </span>
              )}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Search Button */}
          {showNav && !pathname.startsWith("/products") && (
            <button
              onClick={() => setIsSearchOpen(true)}
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 shrink-0"
              aria-label="Search product"
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          {/* User state / Dropdown or Login */}
          {user ? (
            <div className="relative shrink-0" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-1.5 p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-100 whitespace-nowrap shrink-0"
              >
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-semibold shrink-0">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${isUserMenuOpen ? "rotate-180" : ""}`} />
              </button>

              {/* Mobile Profile Dropdown */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-md shadow-2xl p-1 z-50 text-xs animate-in fade-in-50 zoom-in-95">
                  <div className="px-3 py-2 border-b border-zinc-800/80 mb-1">
                    <p className="font-semibold text-zinc-200 truncate whitespace-nowrap">{user.username}</p>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50 inline-block mt-0.5">
                      {user.role}
                    </span>
                  </div>

                  <Link
                    href="/my-stats"
                    onClick={() => setIsUserMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>My Inflation</span>
                  </Link>
                  <Link
                    href="/my-receipts"
                    onClick={() => setIsUserMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span>My Receipts</span>
                  </Link>

                  {user.role === "ADMIN" && (
                    <div className="border-t border-zinc-800/60 my-1 pt-1">
                      <Link
                        href="/admin/products"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>Manage Catalogue</span>
                      </Link>
                      <Link
                        href="/admin/users"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>Manage Users</span>
                      </Link>
                      <Link
                        href="/admin/settings"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Settings className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>System Settings</span>
                      </Link>
                    </div>
                  )}

                  <div className="border-t border-zinc-800/60 my-1 pt-1">
                    <InstallAppButton />
                    <button
                      onClick={() => signOut({ callbackUrl: "/login" })}
                      className="w-full flex items-center gap-2 px-3 py-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors text-left whitespace-nowrap shrink-0"
                    >
                      <LogOut className="w-3.5 h-3.5 shrink-0" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : pathname !== "/login" ? (
            <Link
              href="/login"
              className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 shrink-0 flex items-center gap-1.5 text-xs font-semibold px-2.5 whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </Link>
          ) : null}
        </div>
      </header>

      {/* Sticky Bottom Navigation Bar (Hidden on Review page, login page, or unauthenticated private instance) */}
      {!isReviewPage && showNav && pathname !== "/login" && (
        <nav
          aria-label="Mobile navigation"
          className="lg:hidden fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl bg-zinc-950/95 border-t border-zinc-800/80 px-2 py-1 pb-[max(0.6rem,env(safe-area-inset-bottom))]"
        >
          <div className="grid grid-cols-5 items-end justify-items-center max-w-md mx-auto">
            {/* Slot 1: Home */}
            <Link
              href="/"
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-colors ${
                isActive("/") && pathname === "/"
                  ? "text-emerald-400 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <TrendingUp className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] tracking-tight whitespace-nowrap shrink-0">Home</span>
            </Link>

            {/* Slot 2: Products */}
            <Link
              href="/products"
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-colors ${
                isActive("/products")
                  ? "text-emerald-400 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <ShoppingBag className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] tracking-tight whitespace-nowrap shrink-0">Products</span>
            </Link>

            {/* Slot 3: Center Elevated Upload / Scan Receipt Button */}
            <div className="flex flex-col items-center -mt-5">
              <Link
                href={uploadTarget}
                aria-label="Upload or scan receipt"
                className="w-12 h-12 rounded-full bg-gradient-to-tr from-emerald-500 to-emerald-400 text-zinc-950 flex items-center justify-center shadow-lg shadow-emerald-500/30 hover:scale-105 active:scale-95 transition-all border-2 border-zinc-950"
              >
                <Camera className="w-5 h-5 stroke-[2.4]" />
              </Link>
              <span className="text-[9px] text-emerald-400 font-semibold mt-1 tracking-tight whitespace-nowrap shrink-0">
                + Receipt
              </span>
            </div>

            {/* Slot 4: Compare */}
            <Link
              href="/compare"
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-colors ${
                isActive("/compare")
                  ? "text-emerald-400 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <GitCompare className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] tracking-tight whitespace-nowrap shrink-0">Compare</span>
            </Link>

            {/* Slot 5: My Data / Stores */}
            <Link
              href={user ? "/my-stats" : "/stores"}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-colors ${
                isActive(user ? "/my-stats" : "/stores")
                  ? "text-emerald-400 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {user ? (
                <>
                  <FileText className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] tracking-tight whitespace-nowrap shrink-0">My Data</span>
                </>
              ) : (
                <>
                  <Store className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] tracking-tight whitespace-nowrap shrink-0">Stores</span>
                </>
              )}
            </Link>
          </div>
        </nav>
      )}

      {/* Global Search Dialog */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </>
  );
}
