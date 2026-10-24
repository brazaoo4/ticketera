import { redis } from "@/lib/redis";
import type { NextRequest } from "next/server";

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

interface MemoryBucket {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, MemoryBucket>();

// Periodic cleanup of stale in-memory entries (every 5 minutes)
if (typeof setInterval !== "undefined") {
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of memoryStore.entries()) {
      if (bucket.resetAt <= now) {
        memoryStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  // Ensure timer does not prevent process exit in CLI or tests
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    (cleanupTimer as { unref: () => void }).unref();
  }
}

function checkMemoryRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): RateLimitResult {
  const now = Date.now();
  const bucket = memoryStore.get(key);

  if (!bucket || bucket.resetAt <= now) {
    memoryStore.set(key, {
      count: 1,
      resetAt: now + windowSeconds * 1000,
    });
    return {
      success: true,
      limit,
      remaining: Math.max(0, limit - 1),
      resetSeconds: windowSeconds,
    };
  }

  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);
  const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  return {
    success: bucket.count <= limit,
    limit,
    remaining,
    resetSeconds,
  };
}

/**
 * Sliding/Fixed window rate limiter backed by Redis with automatic fallback to in-memory store.
 */
export async function checkRateLimit(
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = options;
  const redisKey = `rl:${key}`;

  try {
    // Only attempt Redis operations if the connection is available
    if (
      redis.status === "ready" ||
      redis.status === "connect" ||
      redis.status === "connecting"
    ) {
      const count = await redis.incr(redisKey);
      if (count === 1) {
        await redis.expire(redisKey, windowSeconds);
      }
      const ttl = await redis.ttl(redisKey);
      const remaining = Math.max(0, limit - count);
      return {
        success: count <= limit,
        limit,
        remaining,
        resetSeconds: ttl > 0 ? ttl : windowSeconds,
      };
    }
  } catch {
    // Graceful in-memory fallback on Redis failure
  }

  return checkMemoryRateLimit(key, limit, windowSeconds);
}

/**
 * Rate limiting specifically for failed login attempts (brute-force defense).
 * Max 10 failed attempts per 15 minutes per username / IP.
 */
const LOGIN_MAX_FAILED = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60; // 15 minutes

export async function isLoginRateLimited(identifier: string): Promise<boolean> {
  const key = `failed_login:${identifier.toLowerCase().trim()}`;
  try {
    if (redis.status === "ready" || redis.status === "connect") {
      const val = await redis.get(`rl:${key}`);
      if (val && parseInt(val, 10) >= LOGIN_MAX_FAILED) {
        return true;
      }
    }
  } catch {
    // fallback to memory
  }

  const bucket = memoryStore.get(key);
  if (bucket && bucket.resetAt > Date.now() && bucket.count >= LOGIN_MAX_FAILED) {
    return true;
  }
  return false;
}

export async function recordFailedLogin(identifier: string): Promise<void> {
  const key = `failed_login:${identifier.toLowerCase().trim()}`;
  await checkRateLimit({
    key,
    limit: LOGIN_MAX_FAILED,
    windowSeconds: LOGIN_WINDOW_SECONDS,
  });
}

export async function clearLoginRateLimit(identifier: string): Promise<void> {
  const key = `failed_login:${identifier.toLowerCase().trim()}`;
  try {
    if (redis.status === "ready" || redis.status === "connect") {
      await redis.del(`rl:${key}`);
    }
  } catch {
    // ignore
  }
  memoryStore.delete(key);
}

/**
 * Extracts client IP safely from reverse proxy headers.
 */
export function getClientIp(req: Request | NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}
