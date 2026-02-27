import { LRUCache } from "lru-cache";
import RedisCacheAdapter from './cache/redisAdapter';
import { setCacheHitRatio } from './metrics';

export type CacheKey = string;

let _cacheHits = 0;
let _cacheMisses = 0;

function trackCacheAccess(hit: boolean) {
  if (hit) _cacheHits++; else _cacheMisses++;
  const total = _cacheHits + _cacheMisses;
  if (total > 0) setCacheHitRatio(_cacheHits / total);
}

export interface CacheAdapter<K = CacheKey, V = unknown> {
  get(key: K): Promise<V | undefined>;
  set(key: K, value: V, ttlMillis?: number): Promise<void>;
  del(key: K): Promise<void>;
}

/**
 * Simple in-memory LRU adapter using `lru-cache` v10+.
 */
export class InMemoryLRUAdapter<V = unknown> implements CacheAdapter<string, V> {
  private lru;

  constructor(opts?: { max?: number; ttl?: number }) {
    this.lru = new LRUCache({
      max: opts?.max ?? 5000,
      ttl: opts?.ttl ?? 1000 * 60 * 60, // 1 hour default
    });
  }

  async get(key: string): Promise<V | undefined> {
    const val = this.lru.get(key) as V | undefined;
    trackCacheAccess(val !== undefined);
    return val;
  }

  async set(key: string, value: V, ttlMillis?: number): Promise<void> {
    if (typeof ttlMillis === 'number') {
      this.lru.set(key, value, { ttl: ttlMillis });
    } else {
      this.lru.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    this.lru.delete(key);
  }
}

/**
 * Create default cache: Redis if REDIS_URL set, otherwise in-memory LRU.
 */
export function createDefaultCache<V = unknown>(): CacheAdapter<string, V> {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      return new RedisCacheAdapter<V>();
    } catch {
      return new InMemoryLRUAdapter<V>();
    }
  }
  return new InMemoryLRUAdapter<V>();
}
