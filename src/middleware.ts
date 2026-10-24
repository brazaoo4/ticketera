import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;
  const role = req.auth?.user?.role;
  const isPublicCatalog = process.env.PUBLIC_CATALOG === "true";

  // 1. Healthcheck is always public
  if (pathname === "/api/health") {
    return NextResponse.next();
  }

  // 2. If already logged in and visiting /login, redirect to callbackUrl or /
  if (pathname === "/login") {
    if (isLoggedIn) {
      const callback = nextUrl.searchParams.get("callbackUrl");
      if (callback && callback.startsWith("/")) {
        return NextResponse.redirect(new URL(callback, nextUrl.origin));
      }
      return NextResponse.redirect(new URL("/", nextUrl.origin));
    }
    return NextResponse.next();
  }

  // 3. Protected Admin Routes (/admin/**)
  if (pathname.startsWith("/admin")) {
    if (!isLoggedIn) {
      const loginUrl = new URL("/login", nextUrl.origin);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", nextUrl.origin));
    }
    return NextResponse.next();
  }

  // 4. Always Protected User/Personal/Write Routes
  const isAlwaysProtected =
    pathname.startsWith("/upload") ||
    pathname.startsWith("/receipts") ||
    pathname.startsWith("/my-receipts") ||
    pathname.startsWith("/my-stats") ||
    pathname.startsWith("/api/receipts") ||
    pathname.startsWith("/api/export") ||
    pathname.startsWith("/api/catalog");

  if (isAlwaysProtected && !isLoggedIn) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 5. Public vs Private Catalogue Policy
  // If PUBLIC_CATALOG is true, read-only catalog routes (/products, /stores, /compare, /api/products/search, /) are public.
  // Otherwise, all remaining pages and APIs require authentication.
  if (!isLoggedIn && !isPublicCatalog) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
