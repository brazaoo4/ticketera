import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { auth } from "@/lib/auth";
import { AuthProvider } from "@/components/providers/auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import { isDemoModeActive } from "@/lib/demo/demo-data";
import { isPublicCatalogEnabled } from "@/lib/settings";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Ticketera — Grocery Price Intelligence & Personal Inflation",
  description:
    "Spanish grocery receipt scanner, price history intelligence, and personal inflation platform.",
  manifest: "/manifest.webmanifest",
  applicationName: "Ticketera",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ticketera",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const user = session?.user
    ? {
        id: session.user.id,
        username: session.user.username ?? session.user.name ?? "",
        role: (session.user.role as "ADMIN" | "USER") || "USER",
      }
    : null;

  const isDemoActive = await isDemoModeActive();
  const isPublicCatalog = await isPublicCatalogEnabled();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full dark`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100 font-sans antialiased">
        <AuthProvider session={session}>
          <AppShell
            user={user}
            isDemoActive={isDemoActive}
            publicCatalog={isPublicCatalog}
          >
            {children}
          </AppShell>
          <ServiceWorkerRegistration />
        </AuthProvider>
      </body>
    </html>
  );
}
