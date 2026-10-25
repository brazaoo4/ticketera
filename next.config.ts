import type { NextConfig } from "next";

const buildVersion = process.env.BUILD_VERSION ?? Date.now().toString(36);

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "sharp",
    "pdf-parse",
    "bullmq",
    "ioredis",
    "bcrypt",
    "bcryptjs",
    "pg",
    "@prisma/adapter-pg",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=*, microphone=(), geolocation=()",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Content-Type", value: "application/manifest+json; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
