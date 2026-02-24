/**
 * Rate limiting utilities.
 *
 * Exports:
 * - `rateLimit(ip: string, key: string, limit = 500, windowMs = 60_000): Promise<boolean>`
 *
 * Behavior:
 * - If Redis is configured and reachable (via `lib/redisAdapter.getRedisClient()`),
 *   this uses a simple fixed-window counter implemented with `INCR` + `EXPIRE`.
 * - If Redis is unavailable, an in-process token-bucket fallback is used.
 *
 * Notes / tradeoffs:
 * - Fixed-window via INCR is simple and fast, but can produce bursts at window boundaries.
 *   A sliding window via Lua would be more accurate but is more complex.
 * - In-process token-bucket is local to the Node process and won't provide global
 *   coordination across multiple instances; use Redis in distributed setups.
 * - Defaults: `limit = 500` and `windowMs = 60_000` (500 requests per minute).
 *
 * Example:
 * import { rateLimit } from './lib/limits'
 * const allowed = await rateLimit(clientIp, 'reverse-api', 500, 60_000)
 * if (!allowed) { // respond 429 }
 */

import { getRedisClient } from './redisAdapter';
import { incRateLimited, incRequests } from './metrics';

type Bucket = {
  tokens: number;
  lastRefill: number; // epoch ms
};

const DEFAULT_LIMIT = 500;
const DEFAULT_WINDOW_MS = 60_000;

// In-process buckets keyed by `${key}:${ip}`
const buckets = new Map<string, Bucket>();

const BUCKET_CLEANUP_INTERVAL_MS = 60_000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      // Remove buckets idle for more than 2 windows (default 2 min)
      if (now - b.lastRefill > DEFAULT_WINDOW_MS * 2) {
        buckets.delete(k);
      }
    }
  }, BUCKET_CLEANUP_INTERVAL_MS);
  // Allow process to exit without waiting for this timer
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

/**
 * Token bucket refill and consume.
 */
function consumeFromBucket(bucketKey: string, limit: number, windowMs: number): boolean {
  ensureCleanupTimer();
  const now = Date.now();
  const ratePerMs = limit / windowMs; // tokens per ms

  let b = buckets.get(bucketKey);
  if (!b) {
    b = { tokens: limit, lastRefill: now };
  }

  // refill
  const delta = Math.max(0, now - b.lastRefill);
  const refill = delta * ratePerMs;
  b.tokens = Math.min(limit, b.tokens + refill);
  b.lastRefill = now;

  let allowed = false;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    allowed = true;
  } else {
    allowed = false;
  }

  buckets.set(bucketKey, b);

  return allowed;
}

/**
 * Rate limit check.
 * Returns `true` when the action is allowed, `false` when rate-limited.
 *
 * @param ip client IP (used in keying)
 * @param key logical key for the limit (e.g. 'reverse-api')
 * @param limit max tokens in window (default 500)
 * @param windowMs window duration in ms (default 60000)
 */
export async function rateLimit(
  ip: string,
  key: string,
  limit = DEFAULT_LIMIT,
  windowMs = DEFAULT_WINDOW_MS
): Promise<boolean> {
  // Record that we saw a request.
  try {
    incRequests();
  } catch {
    // metrics are best-effort
  }

  const redisClient = await getRedisClient();

  // Try Redis-backed fixed-window counter if available.
  if (redisClient) {
    const windowIndex = Math.floor(Date.now() / windowMs);
    const redisKey = `rl:${key}:${ip}:${windowIndex}`;
    try {
      const cnt = await redisClient.incr(redisKey);
      if (cnt === 1) {
        // set expire slightly longer than window to avoid race
        const ttlSec = Math.ceil(windowMs / 1000) + 1;
        await redisClient.expire(redisKey, ttlSec);
      }
      const allowed = cnt <= limit;
      if (!allowed) {
        try {
          incRateLimited();
        } catch {
          /* ignore */
        }
      }
      return allowed;
    } catch (err) {
      // If Redis fails mid-flight, fall through to in-process fallback.
      console.warn('Redis rate limit check failed, falling back to local limiter', err);
    }
  }

  // In-process token-bucket fallback (best-effort, not distributed).
  const bucketKey = `${key}:${ip}`;
  const allowed = consumeFromBucket(bucketKey, limit, windowMs);
  if (!allowed) {
    try {
      incRateLimited();
    } catch {
      /* ignore */
    }
  }
  return allowed;
}

const limits = { rateLimit };
export default limits;
