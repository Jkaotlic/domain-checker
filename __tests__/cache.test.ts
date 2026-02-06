import { InMemoryLRUAdapter, createDefaultCache } from '../lib/cache';

describe('cache adapters', () => {
  test('in-memory adapter set/get/del', async () => {
    const cache = new InMemoryLRUAdapter<any>({ max: 10, ttl: 1000 });
    await cache.set('k1', { a: 1 }, 500);
    const v = await cache.get('k1');
    expect(v).toEqual({ a: 1 });
    await cache.del('k1');
    const after = await cache.get('k1');
    expect(after).toBeUndefined();
  });

  test('createDefaultCache returns in-memory when REDIS_URL not set', async () => {
    // ensure env unset for test
    const orig = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    const cache = createDefaultCache();
    expect(cache).toBeDefined();
    await cache.set('x', 1, 1000);
    const got = await cache.get('x');
    expect(got).toBe(1);
    process.env.REDIS_URL = orig;
  });
});
