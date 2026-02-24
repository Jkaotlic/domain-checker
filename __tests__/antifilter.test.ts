import { ipv4ToInt, parseCIDR, isIPInRanges } from '../lib/antifilter';

describe('antifilter CIDR utilities', () => {
  describe('ipv4ToInt', () => {
    test('converts standard IPs correctly', () => {
      expect(ipv4ToInt('0.0.0.0')).toBe(0);
      expect(ipv4ToInt('0.0.0.1')).toBe(1);
      expect(ipv4ToInt('1.0.0.0')).toBe(16777216);
      expect(ipv4ToInt('255.255.255.255')).toBe(4294967295);
      expect(ipv4ToInt('192.168.1.1')).toBe(3232235777);
      expect(ipv4ToInt('10.0.0.1')).toBe(167772161);
    });

    test('returns 0 for invalid input', () => {
      expect(ipv4ToInt('invalid')).toBe(0);
      expect(ipv4ToInt('1.2.3')).toBe(0);
    });
  });

  describe('parseCIDR', () => {
    test('parses CIDR notation', () => {
      const r = parseCIDR('192.168.1.0/24');
      expect(r).not.toBeNull();
      expect(r!.network).toBe(ipv4ToInt('192.168.1.0'));
      // /24 mask = 255.255.255.0
      expect(r!.mask).toBe(0xffffff00);
    });

    test('parses /32 (single host)', () => {
      const r = parseCIDR('10.0.0.1/32');
      expect(r).not.toBeNull();
      expect(r!.network).toBe(ipv4ToInt('10.0.0.1'));
      expect(r!.mask).toBe(0xffffffff);
    });

    test('parses bare IP as /32', () => {
      const r = parseCIDR('8.8.8.8');
      expect(r).not.toBeNull();
      expect(r!.network).toBe(ipv4ToInt('8.8.8.8'));
      expect(r!.mask).toBe(0xffffffff);
    });

    test('parses /0 (all IPs)', () => {
      const r = parseCIDR('0.0.0.0/0');
      expect(r).not.toBeNull();
      expect(r!.mask).toBe(0);
    });

    test('returns null for invalid CIDR bits', () => {
      expect(parseCIDR('1.2.3.4/33')).toBeNull();
      expect(parseCIDR('1.2.3.4/-1')).toBeNull();
    });
  });

  describe('isIPInRanges', () => {
    const ranges = [
      parseCIDR('192.168.1.0/24')!,
      parseCIDR('10.0.0.0/8')!,
      parseCIDR('8.8.8.8/32')!,
    ];

    test('matches IP within /24 range', () => {
      expect(isIPInRanges('192.168.1.100', ranges)).toBe(true);
      expect(isIPInRanges('192.168.1.0', ranges)).toBe(true);
      expect(isIPInRanges('192.168.1.255', ranges)).toBe(true);
    });

    test('does not match IP outside /24 range', () => {
      expect(isIPInRanges('192.168.2.1', ranges)).toBe(false);
      expect(isIPInRanges('192.167.1.1', ranges)).toBe(false);
    });

    test('matches IP within /8 range', () => {
      expect(isIPInRanges('10.1.2.3', ranges)).toBe(true);
      expect(isIPInRanges('10.255.255.255', ranges)).toBe(true);
    });

    test('matches exact /32', () => {
      expect(isIPInRanges('8.8.8.8', ranges)).toBe(true);
      expect(isIPInRanges('8.8.8.9', ranges)).toBe(false);
    });

    test('returns false for empty ranges', () => {
      expect(isIPInRanges('1.2.3.4', [])).toBe(false);
    });

    test('returns false for invalid IP', () => {
      expect(isIPInRanges('invalid', ranges)).toBe(false);
    });
  });
});

// Integration-style test with mocked fetch
jest.mock('../lib/net/fetchWithRetry', () => ({
  fetchWithRetry: jest.fn(),
}));

import { checkAntifilter, resetAntifilterCache } from '../lib/antifilter';
import { fetchWithRetry } from '../lib/net/fetchWithRetry';

const mockFetch = fetchWithRetry as jest.MockedFunction<typeof fetchWithRetry>;

describe('checkAntifilter', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetAntifilterCache();
  });

  function mockLists(domains: string[], ips: string[]) {
    let callCount = 0;
    mockFetch.mockImplementation(async (url: string) => {
      callCount++;
      // First two calls are for loading domains + IPs (may be in any order)
      if (url.includes('domains')) {
        return { ok: true, text: async () => domains.join('\n') } as any;
      }
      return { ok: true, text: async () => ips.join('\n') } as any;
    });
  }

  test('detects domain match (exact)', async () => {
    mockLists(['discord.com', 'chatgpt.com'], []);
    const result = await checkAntifilter('discord.com', []);
    expect(result).toBe(true);
  });

  test('detects domain match (parent domain)', async () => {
    mockLists(['discord.com'], []);
    const result = await checkAntifilter('cdn.discord.com', []);
    expect(result).toBe(true);
  });

  test('detects IP match via CIDR', async () => {
    mockLists([], ['104.16.0.0/12']);
    const result = await checkAntifilter('unknown.example.com', ['104.20.1.1']);
    expect(result).toBe(true);
  });

  test('returns false for non-matching domain and IP', async () => {
    mockLists(['discord.com'], ['10.0.0.0/8']);
    const result = await checkAntifilter('example.com', ['1.2.3.4']);
    expect(result).toBe(false);
  });
});
