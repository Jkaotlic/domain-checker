import { LRUCache } from "lru-cache";
import RedisCacheAdapter from './cache/redisAdapter';

export type CacheKey = string;

export interface CacheAdapter<K = CacheKey, V = unknown> {
  get(key: K): Promise<V | undefined>;
  set(key: K, value: V, ttlMillis?: number): Promise<void>;
  del(key: K): Promise<void>;
}

/**
 * Simple in-memory LRU adapter using `lru-cache` v10+.
 */
export class InMemoryLRUAdapter<V = unknown> implements CacheAdapter {
  private cache: any;

  constructor(opts?: { max?: number; ttl?: number }) {
    this.cache = new LRUCache({
      max: opts?.max ?? 5000,
      ttl: opts?.ttl ?? 1000 * 60 * 60, // 1 hour default
    });
  }

  async get(key: string): Promise<V | undefined> {
    return this.cache.get(key);
  }

  async set(key: string, value: V, ttlMillis?: number): Promise<void> {
    if (typeof ttlMillis === 'number') {
      this.cache.set(key, value, { ttl: ttlMillis });
    } else {
      this.cache.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
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
      console.warn('Failed to initialize RedisCacheAdapter, falling back to in-memory cache', err);
      return new RedisAdapterStub<V>(redisUrl);
    }
  }
  return new InMemoryLRUAdapter<V>();
}
