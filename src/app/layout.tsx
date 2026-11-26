import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import "./globals.css";
import { auth } from "@/lib/auth";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AppShell } from "@/components/layout/app-shell";
import { isDemoModeActive } from "@/lib/demo/demo-data";
import { isPublicCatalogEnabled } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-bricolage",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-dm-sans",
});

const THEME_INIT_SCRIPT = `(function(){try{var k="ticketera-theme";var t=localStorage.getItem(k);var r=t==="light"||t==="dark"?t:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",r);var m=document.querySelector('meta[name="color-scheme"]');if(m){m.setAttribute("content",t==="light"||t==="dark"?t:"light dark");}}catch(e){}})();`;

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF9F6" },
    { media: "(prefers-color-scheme: dark)", color: "#141513" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Ticketera — Your grocery prices & receipts",
  description:
    "Everyday Spanish grocery receipt tracker, unit-price comparison, and personal spending overview.",
  manifest: "/manifest.webmanifest",
  applicationName: "Ticketera",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
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

  let diaReauthRequired = false;
  if (user?.role === "ADMIN") {
    try {
      const expiredConn = await prisma.storeConnection.findFirst({
        where: { storeSlug: "dia", status: "REQUIRES_REAUTH" },
        select: { id: true },
      });
      diaReauthRequired = Boolean(expiredConn);
    } catch {
      // Safe during build / offline DB
    }
  }

  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${dmSans.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <meta name="color-scheme" content="light dark" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-[var(--bg-page)] text-[var(--text-primary)] font-sans antialiased">
        <AuthProvider session={session}>
          <ThemeProvider>
            <AppShell
              user={user}
              isDemoActive={isDemoActive}
              publicCatalog={isPublicCatalog}
              diaReauthRequired={diaReauthRequired}
            >
              {children}
            </AppShell>
            <ServiceWorkerRegistration />
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
