/**
 * Simple Redis adapter using `ioredis`.
 *
 * Exports:
 * - `getRedisClient()` - async initializer/getter that returns a connected Redis client or `null` if unavailable.
 * - `redisSetJson(key, value, ttlSeconds?)` - helper to store JSON.
 * - `redisGetJson(key)` - helper to read JSON.
 *
 * The adapter is intentionally small: it returns `null` when `REDIS_URL` is not set
 * or when a connection attempt fails. Callers should gracefully fall back to
 * in-process alternatives when `null` is returned.
 */

import Redis from 'ioredis';

let client: Redis | null = null;

/**
 * Get a Redis client if `REDIS_URL` is configured.
 * Uses a singleton Redis instance and performs a ping check on first initialization.
 *
 * Returns `null` when Redis is not configured or unreachable.
 */
export async function getRedisClient(): Promise<Redis | null> {
  if (client) return client;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  // Create client with optional password support.
  client = new Redis(url, {
    password: process.env.REDIS_PASSWORD || undefined,
    // Keep defaults otherwise; callers should treat Redis as optional.
  });

  try {
    await client.ping();
    // connection ok
    return client;
  } catch (err) {
    // If ping fails, disconnect and return null so callers fallback.
    try {
      client.disconnect();
    } catch (e) {
      /* ignore */
    }
    client = null;
    // Avoid noisy crashes — surface via warn.
    // Note: production code could add retries/backoff here.
    console.warn('Redis not available, falling back to in-process fallback', err);
    return null;
  }
}

/**
 * Set a JSON serializable value to Redis.
 * If Redis is not available this is a no-op.
 *
 * @param key Redis key
 * @param value JSON-serializable value
 * @param ttlSeconds optional TTL in seconds
 */
export async function redisSetJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const r = await getRedisClient();
  if (!r) return;
  const payload = JSON.stringify(value);
  if (typeof ttlSeconds === 'number' && ttlSeconds > 0) {
    await r.set(key, payload, 'EX', ttlSeconds);
  } else {
    await r.set(key, payload);
  }
}

/**
 * Get JSON value from Redis.
 * Returns parsed object or `null` when key absent or Redis unavailable.
 */
export async function redisGetJson<T = unknown>(key: string): Promise<T | null> {
  const r = await getRedisClient();
  if (!r) return null;
  const raw = await r.get(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    // malformed JSON — ignore and return null
    return null;
  }
}

const redisUtils = {
  getRedisClient,
  redisSetJson,
  redisGetJson,
};
export default redisUtils;
