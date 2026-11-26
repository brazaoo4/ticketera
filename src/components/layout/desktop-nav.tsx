"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Plus,
  Search,
  LogOut,
  User as UserIcon,
  ChevronDown,
  Settings,
} from "lucide-react";
import { SearchModal } from "./search-modal";
import { InstallAppButton } from "@/components/pwa/install-app-button";
import { BrandMark } from "@/components/common/brand-mark";
import { ThemeSwitch } from "@/components/providers/theme-provider";
import type { UserProfile } from "./app-shell";

interface NavItem {
  href: string;
  label: string;
  matchPrefix?: string;
}

export function DesktopNav({
  user,
  publicCatalog = false,
}: {
  user?: UserProfile | null;
  publicCatalog?: boolean;
}) {
  const pathname = usePathname() || "/";
  const isLoginPage = pathname.startsWith("/login");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isActive = (item: NavItem) => {
    if (item.href === "/") return pathname === "/";
    return pathname.startsWith(item.matchPrefix || item.href);
  };

  const navLinks: NavItem[] = user
    ? [
        { href: "/", label: "Home" },
        { href: "/products", label: "Groceries" },
        { href: "/compare", label: "Compare" },
        { href: "/my-stats", label: "Spending" },
        { href: "/stores", label: "Supermarkets" },
        { href: "/my-receipts", label: "Receipts", matchPrefix: "/my-receipts" },
        ...(user.role === "ADMIN"
          ? [{ href: "/admin/settings", label: "Settings", matchPrefix: "/admin" }]
          : []),
      ]
    : publicCatalog
      ? [
          { href: "/", label: "Home" },
          { href: "/products", label: "Groceries" },
          { href: "/compare", label: "Compare" },
          { href: "/stores", label: "Supermarkets" },
        ]
      : [];

  useEffect(() => {
    const onScroll = () => {
      setIsScrolled(window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isLoginPage) return;
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (pathname.startsWith("/products")) {
          const input = document.getElementById(
            "catalogue-search-input"
          ) as HTMLInputElement | null;
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
  }, [pathname, isLoginPage]);

  if (isLoginPage) {
    return (
      <header className="hidden md:block sticky top-0 z-40 w-full">
        <div className="max-w-[1120px] mx-auto px-6 h-[68px] flex items-center justify-between gap-4">
          <Link href="/" aria-label="Ticketera home">
            <BrandMark />
          </Link>
          <ThemeSwitch />
        </div>
      </header>
    );
  }

  const showNav = !!user || publicCatalog;

  return (
    <>
      <header
        className={`hidden md:block sticky top-0 z-40 w-full transition-colors duration-150 border-b ${
          isScrolled
            ? "bg-[var(--bg-header-scrolled)] backdrop-blur-md border-[var(--border)]"
            : "bg-transparent border-transparent"
        }`}
      >
        <div className="max-w-[1200px] mx-auto px-4 lg:px-6 h-[68px] flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center shrink-0"
            aria-label="Ticketera home"
          >
            <BrandMark />
          </Link>

          {showNav && (
            <nav
              aria-label="Main navigation"
              className="flex items-center gap-3 lg:gap-5 overflow-x-auto lg:overflow-visible no-scrollbar"
            >
              {navLinks.map((link) => {
                const active = isActive(link);
                const isReceiptsActive =
                  link.href === "/my-receipts" &&
                  (pathname.startsWith("/my-receipts") ||
                    pathname.startsWith("/receipts/"));
                const highlight = active || isReceiptsActive;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={highlight ? "page" : undefined}
                    className={`relative h-[68px] inline-flex items-center text-[14px] whitespace-nowrap shrink-0 transition-colors ${
                      highlight
                        ? "text-[var(--text-primary)] font-semibold after:absolute after:inset-x-0 after:bottom-0 after:h-[2.5px] after:rounded-t-sm after:bg-[var(--primary)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          )}

          <div className="flex items-center gap-2 shrink-0">
            {showNav && !pathname.startsWith("/products") && (
              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                aria-label="Search groceries"
                title="Search groceries"
                className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                <Search className="w-4 h-4" />
              </button>
            )}

            <ThemeSwitch />

            {user ? (
              <>
                <Link
                  href="/upload"
                  className="h-[36px] px-3.5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <Plus className="w-4 h-4 stroke-[2.4]" />
                  <span>Add receipt</span>
                </Link>

                <div className="relative shrink-0" ref={userMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsUserMenuOpen((prev) => !prev)}
                    aria-expanded={isUserMenuOpen}
                    className="h-[36px] px-2.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-strong)] text-[13px] font-medium text-[var(--text-primary)] inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <UserIcon className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                    <span className="max-w-[84px] truncate">{user.username}</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${
                        isUserMenuOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isUserMenuOpen && (
                    <div className="absolute right-0 mt-2 w-52 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-soft)] p-1.5 z-50 text-[13px]">
                      <div className="px-3 py-2 border-b border-[var(--border)] mb-1">
                        <p className="font-semibold text-[var(--text-primary)] truncate">
                          {user.username}
                        </p>
                        <p className="text-[13px] text-[var(--text-muted)]">
                          {user.role === "ADMIN" ? "Administrator" : "Member"}
                        </p>
                      </div>

                      {user.role === "ADMIN" && (
                        <Link
                          href="/admin/settings"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors whitespace-nowrap"
                        >
                          <Settings className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                          <span>Settings and admin</span>
                        </Link>
                      )}

                      <InstallAppButton className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[var(--primary)] hover:bg-[var(--bg-subtle)] transition-colors whitespace-nowrap text-[13px] font-medium text-left" />

                      <div className="my-1 border-t border-[var(--border)]" />

                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          signOut({ callbackUrl: "/login" });
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[var(--negative)] hover:bg-[var(--negative-tint)] transition-colors whitespace-nowrap text-left cursor-pointer font-medium"
                      >
                        <LogOut className="w-4 h-4 shrink-0" />
                        <span>Sign out</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <InstallAppButton />
                <Link
                  href="/login"
                  className="h-[38px] px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] hover:border-[var(--border-strong)] text-[13px] font-semibold text-[var(--text-primary)] inline-flex items-center whitespace-nowrap shrink-0 transition-colors"
                >
                  Sign in
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </>
  );
}
