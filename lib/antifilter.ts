import { fetchWithRetry } from './net/fetchWithRetry';
import { createDefaultCache } from './cache';
import { CONFIG } from './config';
import logger from './logger';

// ── CIDR types ──

interface CIDRRange {
  /** Network address as 32-bit integer */
  network: number;
  /** Subnet mask as 32-bit integer */
  mask: number;
}

// ── IPv4 helpers ──

export function ipv4ToInt(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) return 0;
  return parts.reduce((acc, octet) => (acc << 8) + (parseInt(octet, 10) & 0xff), 0) >>> 0;
}

export function parseCIDR(cidr: string): CIDRRange | null {
  const slash = cidr.indexOf('/');
  if (slash === -1) {
    // bare IP → /32
    const ip = ipv4ToInt(cidr.trim());
    return ip ? { network: ip, mask: 0xffffffff } : null;
  }
  const ipPart = cidr.slice(0, slash).trim();
  const bits = parseInt(cidr.slice(slash + 1).trim(), 10);
  if (isNaN(bits) || bits < 0 || bits > 32) return null;
  const ip = ipv4ToInt(ipPart);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return { network: (ip & mask) >>> 0, mask };
}

export function isIPInRanges(ip: string, ranges: CIDRRange[]): boolean {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === 0) return false;
  for (const r of ranges) {
    if (((ipInt & r.mask) >>> 0) === r.network) return true;
  }
  return false;
}

// ── Cached list loaders ──

let domainCache = createDefaultCache<string[]>();
let ipCache = createDefaultCache<CIDRRange[]>();

const DOMAIN_CACHE_KEY = 'antifilter:domains';
const IP_CACHE_KEY = 'antifilter:ips';

/** Reset cached lists (for testing). */
export function resetAntifilterCache() {
  domainCache = createDefaultCache<string[]>();
  ipCache = createDefaultCache<CIDRRange[]>();
}

export async function getAntifilterDomains(): Promise<Set<string>> {
  try {
    const cached = await domainCache.get(DOMAIN_CACHE_KEY);
    if (cached) return new Set(cached);
  } catch { /* ignore */ }

  try {
    const res = await fetchWithRetry(
      CONFIG.ANTIFILTER.DOMAINS_URL,
      { headers: { 'User-Agent': 'domain-checker/1.0' } },
      { retries: 2, backoffMs: 500, timeoutMs: CONFIG.HTTP_TIMEOUT_MS },
    );
    if (!res.ok) return new Set();
    const text = await res.text();
    const domains = text
      .split('\n')
      .map(line => line.trim().toLowerCase())
      .filter(line => line && !line.startsWith('#'));

    try {
      await domainCache.set(DOMAIN_CACHE_KEY, domains, CONFIG.ANTIFILTER.CACHE_TTL_MS);
    } catch { /* ignore */ }

    return new Set(domains);
  } catch (err) {
    logger.debug({ err }, 'antifilter domains fetch error');
    return new Set();
  }
}

export async function getAntifilterIPRanges(): Promise<CIDRRange[]> {
  try {
    const cached = await ipCache.get(IP_CACHE_KEY);
    if (cached) return cached;
  } catch { /* ignore */ }

  try {
    const res = await fetchWithRetry(
      CONFIG.ANTIFILTER.IPS_URL,
      { headers: { 'User-Agent': 'domain-checker/1.0' } },
      { retries: 2, backoffMs: 500, timeoutMs: CONFIG.HTTP_TIMEOUT_MS },
    );
    if (!res.ok) return [];
    const text = await res.text();
    const ranges: CIDRRange[] = [];
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const r = parseCIDR(trimmed);
      if (r) ranges.push(r);
    }

    try {
      await ipCache.set(IP_CACHE_KEY, ranges, CONFIG.ANTIFILTER.CACHE_TTL_MS);
    } catch { /* ignore */ }

    return ranges;
  } catch (err) {
    logger.debug({ err }, 'antifilter IPs fetch error');
    return [];
  }
}

/**
 * Check whether a subdomain (or any of its IPs) appears in antifilter community lists.
 *
 * Domain matching: exact match OR parent-domain match
 *   e.g. if "discord.com" is in the list, then "cdn.discord.com" also matches.
 *
 * IP matching: IPv4 checked against CIDR ranges from the IP list.
 */
export async function checkAntifilter(
  subdomain: string,
  ips: string[],
): Promise<boolean> {
  const [domains, ranges] = await Promise.all([
    getAntifilterDomains(),
    getAntifilterIPRanges(),
  ]);

  // Domain check — exact or parent match
  const lower = subdomain.toLowerCase();
  if (domains.has(lower)) return true;
  // walk parent domains: "a.b.example.com" → check "b.example.com", "example.com"
  const parts = lower.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (domains.has(parent)) return true;
  }

  // IP check — CIDR ranges
  if (ranges.length > 0) {
    for (const ip of ips) {
      if (isIPInRanges(ip, ranges)) return true;
    }
  }

  return false;
}
