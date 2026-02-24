jest.mock('../lib/redisAdapter', () => ({
  getRedisClient: jest.fn().mockResolvedValue(null),
}));

jest.mock('../lib/metrics', () => ({
  incRequests: jest.fn(),
  incRateLimited: jest.fn(),
}));

import { rateLimit } from '../lib/limits';

describe('rateLimit (in-process token bucket)', () => {
  test('allows requests within limit', async () => {
    const allowed = await rateLimit('127.0.0.1', 'test-bucket', 5, 60_000);
    expect(allowed).toBe(true);
  });

  test('blocks requests exceeding limit', async () => {
    const key = 'exhaust-bucket';
    const ip = '10.0.0.1';
    const limit = 3;

    // Consume all tokens
    for (let i = 0; i < limit; i++) {
      const ok = await rateLimit(ip, key, limit, 60_000);
      expect(ok).toBe(true);
    }

    // Next request should be blocked
    const blocked = await rateLimit(ip, key, limit, 60_000);
    expect(blocked).toBe(false);
  });

  test('tokens refill over time', async () => {
    const key = 'refill-bucket';
    const ip = '10.0.0.2';
    const limit = 2;
    const windowMs = 100; // very short window for testing

    // Consume all tokens
    await rateLimit(ip, key, limit, windowMs);
    await rateLimit(ip, key, limit, windowMs);
    expect(await rateLimit(ip, key, limit, windowMs)).toBe(false);

    // Wait for tokens to refill
    await new Promise(r => setTimeout(r, windowMs + 10));

    const allowed = await rateLimit(ip, key, limit, windowMs);
    expect(allowed).toBe(true);
  });

  test('different keys are independent', async () => {
    const ip = '10.0.0.3';
    // Exhaust one key
    for (let i = 0; i < 3; i++) {
      await rateLimit(ip, 'key-a', 3, 60_000);
    }
    expect(await rateLimit(ip, 'key-a', 3, 60_000)).toBe(false);

    // Different key should still work
    expect(await rateLimit(ip, 'key-b', 3, 60_000)).toBe(true);
  });
});
