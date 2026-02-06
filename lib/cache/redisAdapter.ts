import { CacheAdapter } from '../cache';
import { getRedisClient } from '../redisAdapter';
import logger from '../logger';
import { CONFIG } from '../config';

export class RedisCacheAdapter<V = unknown> implements CacheAdapter<string, V> {
  private prefix: string;
  constructor(prefix?: string) {
    this.prefix = prefix || CONFIG.CACHE_KEY_PREFIX || 'v1:';
  }

  private key(k: string) {
    return `${this.prefix}${k}`;
  }

  async get(key: string): Promise<V | undefined> {
    const r = await getRedisClient();
    if (!r) return undefined;
    try {
      const raw = await r.get(this.key(key));
      if (!raw) return undefined;
      return JSON.parse(raw) as V;
    } catch (err) {
      logger.debug({ err, key }, 'RedisCacheAdapter.get parse error');
      return undefined;
    }
  }

  async set(key: string, value: V, ttlMillis?: number): Promise<void> {
    const r = await getRedisClient();
    if (!r) return;
    try {
      const raw = JSON.stringify(value);
      if (typeof ttlMillis === 'number' && ttlMillis > 0) {
        // ioredis expects milliseconds when using PX
        await r.set(this.key(key), raw, 'PX', Math.max(1000, Math.floor(ttlMillis)));
      } else {
        await r.set(this.key(key), raw);
      }
    } catch (err) {
      logger.warn({ err, key }, 'RedisCacheAdapter.set failed');
    }
  }

  async del(key: string): Promise<void> {
    const r = await getRedisClient();
    if (!r) return;
    try {
      await r.del(this.key(key));
    } catch (err) {
      logger.warn({ err, key }, 'RedisCacheAdapter.del failed');
    }
  }
}

export default RedisCacheAdapter;
