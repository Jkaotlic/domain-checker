// Make tests faster and avoid long network waits in CI by lowering
// the HTTP timeout used by `fetchWithRetry` during these tests.
process.env.HTTP_TIMEOUT_MS = '1000';
import { getFromURLScan, getFromHackertarget, getFromAlienVault } from '../lib/passiveSources';

describe('passiveSources', () => {
  test('passive sources return arrays (may be empty)', async () => {
    const u = await getFromURLScan('example.com');
    expect(Array.isArray(u)).toBe(true);
    const h = await getFromHackertarget('example.com');
    expect(Array.isArray(h)).toBe(true);
    const a = await getFromAlienVault('example.com');
    expect(Array.isArray(a)).toBe(true);
  });
});
