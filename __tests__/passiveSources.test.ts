import { getFromSecurityTrails } from '../lib/passiveSources';

describe('passiveSources', () => {
  test('getFromSecurityTrails returns empty when no API key', async () => {
    const orig = process.env.SECURITYTRAILS_APIKEY;
    delete process.env.SECURITYTRAILS_APIKEY;
    const res = await getFromSecurityTrails('example.com');
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBe(0);
    if (orig !== undefined) process.env.SECURITYTRAILS_APIKEY = orig;
  });

  test('other passive sources return arrays (may be empty)', async () => {
    const u = await (await import('../lib/passiveSources')).getFromURLScan('example.com');
    expect(Array.isArray(u)).toBe(true);
    const h = await (await import('../lib/passiveSources')).getFromHackertarget('example.com');
    expect(Array.isArray(h)).toBe(true);
    const a = await (await import('../lib/passiveSources')).getFromAlienVault('example.com');
    expect(Array.isArray(a)).toBe(true);
  });
});
