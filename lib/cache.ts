import LRU from "lru-cache";
import RedisCacheAdapter from './cache/redisAdapter';

export type CacheKey = string;

export interface CacheAdapter<K = CacheKey, V = unknown> {
  get(key: K): Promise<V | undefined>;
  set(key: K, value: V, ttlMillis?: number): Promise<void>;
  del(key: K): Promise<void>;
}

/**
 * Simple in-memory LRU adapter using `lru-cache`.
 */
export class InMemoryLRUAdapter<V = unknown> implements CacheAdapter {
  private cache: LRU<string, V>;

  constructor(opts?: LRU.Options<string, V>) {
    this.cache = new LRU<string, V>({
      max: 5000,
      ttl: 1000 * 60 * 60, // 1 hour default
      ...(opts || {}),
    });
  }

  async get(key: string): Promise<V | undefined> {
    return this.cache.get(key);
  }

  async set(key: string, value: V, ttlMillis?: number): Promise<void> {
    if (typeof ttlMillis === "number") {
      // lru-cache versions differ in API; pass ttl as third argument if supported,
      // otherwise fall back to set(key, value) and rely on default ttl.
      try {
        // Some versions accept set(key, value, ttl)
        (this.cache as any).set(key, value, ttlMillis);
      } catch (e) {
        // Fallback: try options object form
        try {
          (this.cache as any).set(key, value, { ttl: ttlMillis });
        } catch (e2) {
          // As a last resort, set without TTL
          (this.cache as any).set(key, value);
        }
      }
    } else {
      this.cache.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    // Support multiple lru-cache API variants: delete, del, or remove
    if (typeof (this.cache as any).delete === 'function') {
      (this.cache as any).delete(key);
    } else if (typeof (this.cache as any).del === 'function') {
      (this.cache as any).del(key);
    } else if (typeof (this.cache as any).remove === 'function') {
      (this.cache as any).remove(key);
    }
  }
}

/**
 * Redis adapter stub interface + factory.
 * If `process.env.REDIS_URL` is provided we may implement a real adapter later.
 * For now export the interface and a disabled stub.
 */
export class RedisAdapterStub<V = unknown> implements CacheAdapter {
  // NOTE: stub - not connected. Implement later using ioredis or redis client.
  private enabled = false;
  constructor(private url?: string) {
    if (url) {
      // Intentionally left disabled as a stub. When implementing, connect here.
      this.enabled = false;
    }
  }

  async get(key: string): Promise<V | undefined> {
    // stubbed - always undefined
    return undefined;
  }
  async set(key: string, value: V, ttlMillis?: number): Promise<void> {
    // stubbed - no-op
    return;
  }
  async del(key: string): Promise<void> {
    // stubbed - no-op
    return;
  }
}

/**
 * Helper to create default cache: if REDIS_URL present, returns stub for now.
 */
export function createDefaultCache<V = unknown>(): CacheAdapter<string, V> {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    // If REDIS_URL is configured, attempt to use the real RedisCacheAdapter.
    try {
      return new RedisCacheAdapter<V>();
    } catch (err) {
      // Fallback to stub if something goes wrong during instantiation.
      // eslint-disable-next-line no-console
      console.warn('Failed to initialize RedisCacheAdapter, falling back to in-memory cache', err);
      return new RedisAdapterStub<V>(redisUrl);
    }
  }
  return new InMemoryLRUAdapter<V>();
}
