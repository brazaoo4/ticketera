"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Receipt,
  Camera,
  Search,
  Shield,
  LogOut,
  LogIn,
  ShoppingBag,
  GitCompare,
  Store,
  FileText,
  TrendingUp,
  User as UserIcon,
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

export function DesktopNav({ user, publicCatalog = false }: { user?: UserProfile | null; publicCatalog?: boolean }) {
  const pathname = usePathname();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  const navLinks = [
    { href: "/", label: "Home", icon: TrendingUp },
    { href: "/products", label: "Products", icon: ShoppingBag },
    { href: "/compare", label: "Compare", icon: GitCompare },
    { href: "/stores", label: "Stores", icon: Store },
  ];

  // Close dropdown menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Global ⌘K shortcut listener
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (pathname.startsWith("/products")) {
          const input = document.getElementById("catalogue-search-input") as HTMLInputElement | null;
          if (input) {
            input.focus();
            input.select();
            return;
          }
        }
        setIsSearchOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [pathname]);

  return (
    <>
      <header className="hidden lg:block sticky top-0 z-40 w-full backdrop-blur-md bg-zinc-950/80 border-b border-zinc-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Left: Brand Logo & Main Nav */}
          <div className="flex items-center gap-6 lg:gap-8 shrink-0">
            <Link
              href="/"
              className="flex items-center gap-2.5 group transition-transform active:scale-95 whitespace-nowrap shrink-0"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-500/30 transition-shadow shrink-0">
                <Receipt className="w-5 h-5 text-zinc-950 stroke-[2.2]" />
              </div>
              <div className="flex items-center">
                <span className="font-bold text-base text-zinc-100 tracking-tight">
                  Ticket
                </span>
                <span className="font-bold text-base text-emerald-400 tracking-tight">
                  era
                </span>
              </div>
            </Link>

            {/* Navigation Links - 1-word clean labels */}
            {(user || publicCatalog) && (
            <nav className="flex items-center gap-1 shrink-0">
              {navLinks.map((link) => {
                const active = isActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`h-9 px-3 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 inline-flex items-center transition-all ${
                      active
                        ? "bg-zinc-800 text-emerald-400 shadow-sm border border-zinc-700/60"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            )}
          </div>

          {/* Center: Command-K Search Trigger */}
          {(user || publicCatalog) && !pathname.startsWith("/products") && (
            <div className="flex-1 max-w-xs shrink-0">
              <button
                onClick={() => setIsSearchOpen(true)}
                className="w-full h-9 px-3 rounded-xl border border-zinc-800 bg-zinc-900/60 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900 transition-all flex items-center justify-between gap-2 whitespace-nowrap shrink-0 group"
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <Search className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400 transition-colors shrink-0" />
                  <span className="whitespace-nowrap">Search...</span>
                </div>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-[11px] text-zinc-400 border border-zinc-700/60 font-mono whitespace-nowrap shrink-0">
                  ⌘K
                </kbd>
              </button>
            </div>
          )}

          {/* Right: Auth & Upload CTA */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Primary Action Button: Scan / Upload */}
            <Link
              href={user ? "/upload" : "/login?callbackUrl=/upload"}
              className="h-9 px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm shadow-md shadow-emerald-500/20 active:scale-95 transition-all inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Camera className="w-4 h-4 stroke-[2.4] shrink-0" />
              <span className="whitespace-nowrap">📸 Scan</span>
            </Link>

            {/* User Profile Dropdown or Sign In Button */}
            {user ? (
              <div className="relative shrink-0" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="h-9 px-3 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-sm font-medium text-zinc-200 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                >
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <UserIcon className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-medium whitespace-nowrap max-w-[100px] truncate">
                    {user.username}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${isUserMenuOpen ? "rotate-180" : ""}`} />
                </button>

                {/* Dropdown Menu */}
                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-md shadow-2xl p-1 z-50 text-xs animate-in fade-in-50 zoom-in-95">
                    <div className="px-3 py-2 border-b border-zinc-800/80 mb-1">
                      <p className="font-semibold text-zinc-200 truncate whitespace-nowrap">{user.username}</p>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50 inline-block mt-0.5">
                        {user.role}
                      </span>
                    </div>

                    <Link
                      href="/my-receipts"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-300 hover:text-emerald-400 hover:bg-zinc-900 transition-colors whitespace-nowrap"
                    >
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      <span className="whitespace-nowrap">My Receipts</span>
                    </Link>

                    <Link
                      href="/my-stats"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-300 hover:text-emerald-400 hover:bg-zinc-900 transition-colors whitespace-nowrap"
                    >
                      <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                      <span className="whitespace-nowrap">My Stats</span>
                    </Link>

                    {user.role === "ADMIN" && (
                      <>
                        <Link
                          href="/admin/products"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-300 hover:text-emerald-400 hover:bg-zinc-900 transition-colors whitespace-nowrap"
                        >
                          <ShoppingBag className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="whitespace-nowrap">Product Catalogue</span>
                        </Link>
                        <Link
                          href="/admin/users"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-300 hover:text-emerald-400 hover:bg-zinc-900 transition-colors whitespace-nowrap"
                        >
                          <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="whitespace-nowrap">User Management</span>
                        </Link>
                        <Link
                          href="/admin/settings"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-300 hover:text-emerald-400 hover:bg-zinc-900 transition-colors whitespace-nowrap"
                        >
                          <Settings className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="whitespace-nowrap">System Settings</span>
                        </Link>
                      </>
                    )}

                    <InstallAppButton />

                    <div className="my-1 border-t border-zinc-800/80" />

                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        signOut({ callbackUrl: "/" });
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors whitespace-nowrap text-left"
                    >
                      <LogOut className="w-3.5 h-3.5 shrink-0" />
                      <span className="whitespace-nowrap">Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <InstallAppButton />
                <Link
                  href="/login"
                  className="h-9 px-3.5 rounded-xl border border-zinc-800 bg-zinc-900 text-sm font-medium text-zinc-300 hover:text-white hover:border-zinc-700 transition-all inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <LogIn className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="whitespace-nowrap">Sign In</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Search Modal Triggered by ⌘K or Search Input */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </>
  );
}
