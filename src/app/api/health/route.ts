import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const timestamp = new Date().toISOString();
  let dbStatus: "connected" | "disconnected" | "error" = "disconnected";
  let redisStatus: "connected" | "disconnected" | "error" = "disconnected";

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch (err: unknown) {
    dbStatus = "error";
    console.error("[HealthCheck] Database connection error:", err);
  }

  try {
    const pong = await redis.ping();
    if (pong === "PONG") {
      redisStatus = "connected";
    } else {
      redisStatus = "error";
    }
  } catch (err: unknown) {
    redisStatus = "error";
    console.error("[HealthCheck] Redis connection error:", err);
  }

  const isHealthy = dbStatus === "connected" && redisStatus === "connected";

  const responseBody = {
    status: isHealthy ? "ok" : "degraded",
    db: dbStatus,
    redis: redisStatus,
    timestamp,
  };

  return NextResponse.json(responseBody, {
    status: isHealthy ? 200 : 503,
  });
}
