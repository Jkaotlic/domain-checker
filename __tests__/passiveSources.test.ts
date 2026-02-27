// Make tests faster and avoid long network waits in CI by lowering
// the HTTP timeout used by `fetchWithRetry` during these tests.
process.env.HTTP_TIMEOUT_MS = '1000';
import { fetchURLScan, fetchHackerTarget, fetchAlienVault } from '../lib/passiveSources';

describe('passiveSources', () => {
  test('passive sources return arrays (may be empty)', async () => {
    const u = await fetchURLScan('example.com');
    expect(Array.isArray(u)).toBe(true);
    const h = await fetchHackerTarget('example.com');
    expect(Array.isArray(h)).toBe(true);
    const a = await fetchAlienVault('example.com');
    expect(Array.isArray(a)).toBe(true);
  });
});
