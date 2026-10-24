import React from "react";
import { DesktopNav } from "./desktop-nav";
import { MobileNav } from "./mobile-nav";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { DemoBanner } from "@/components/demo/demo-banner";

interface UserProfile {
  id: string;
  username: string;
  role: "ADMIN" | "USER";
}

export function AppShell({
  children,
  user,
  isDemoActive = false,
  publicCatalog = false,
}: {
  children: React.ReactNode;
  user?: UserProfile | null;
  isDemoActive?: boolean;
  publicCatalog?: boolean;
}) {
  const showNavLinks = !!user || publicCatalog;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 selection:bg-emerald-500 selection:text-black">
      {/* Demo Mode Active Banner */}
      {isDemoActive && !!user && <DemoBanner />}

      {/* Desktop Navigation */}
      <DesktopNav user={user} publicCatalog={publicCatalog} />

      {/* Mobile Top Header */}
      <MobileNav user={user} publicCatalog={publicCatalog} />

      {/* Main Content Area */}
      <main className="flex-1 pb-24 lg:pb-12">{children}</main>

      {/* Understated Consumer Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950/80 py-6 text-xs text-zinc-500 hidden lg:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-zinc-400 font-medium">
            <div className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Receipt className="w-3 h-3 stroke-[2.4]" />
            </div>
            <span>Ticketera</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500 font-normal">Grocery Price Comparison</span>
          </div>

          {showNavLinks && (
            <div className="flex items-center gap-6 text-zinc-500 whitespace-nowrap shrink-0">
              <Link href="/products" className="hover:text-zinc-300 transition-colors whitespace-nowrap shrink-0">
                Products
              </Link>
              <Link href="/compare" className="hover:text-zinc-300 transition-colors whitespace-nowrap shrink-0">
                Compare
              </Link>
              <Link href="/stores" className="hover:text-zinc-300 transition-colors whitespace-nowrap shrink-0">
                Stores
              </Link>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
