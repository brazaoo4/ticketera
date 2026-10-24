import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

const getRedisUrl = () => process.env.REDIS_URL || "redis://localhost:6379";

export const getRedisClient = (): Redis => {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 5000,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
    });

    globalForRedis.redis.on("error", () => {
      // Gracefully handle without crashing process when Redis is offline during local UI development
    });
  }
  return globalForRedis.redis;
};

export const redis = getRedisClient();
