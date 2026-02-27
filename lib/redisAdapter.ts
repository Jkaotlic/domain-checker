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
import logger from './logger';

let client: Redis | null = null;
let clientPromise: Promise<Redis | null> | null = null;

/**
 * Get a Redis client if `REDIS_URL` is configured.
 * Uses a singleton Redis instance and performs a ping check on first initialization.
 * Thread-safe: concurrent calls share the same initialization promise.
 *
 * Returns `null` when Redis is not configured or unreachable.
 */
export async function getRedisClient(): Promise<Redis | null> {
  if (client) return client;
  if (clientPromise) return clientPromise;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  clientPromise = (async () => {
    const c = new Redis(url, {
      password: process.env.REDIS_PASSWORD || undefined,
    });
    try {
      await c.ping();
      client = c;
      return client;
    } catch (err) {
      try { c.disconnect(); } catch { /* ignore */ }
      logger.warn({ err }, 'Redis not available, falling back to in-process cache');
      return null;
    } finally {
      clientPromise = null;
    }
  })();

  return clientPromise;
}

