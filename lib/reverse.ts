import dns from "dns/promises";
import pLimit from "./net/pLimit";
// lightweight timeout helper (avoids ESM-only dependency)
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }, (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

import { createDefaultCache } from "./cache";
import logger from "./logger";
import { normalizeDomain, isValidHost } from "./subdomain";

// Configurable defaults
const DEFAULT_DNS_TIMEOUT_MS = 3000; // 3s for PTR
const DEFAULT_HTTP_TIMEOUT_MS = 5000; // 5s for HTTP fallback
const DEFAULT_CONCURRENCY = 20;
const CACHE_TTL_MS = 1000 * 60 * 60; // default 1 hour cache for reverse results
const PTR_TTL_MS = 1000 * 60 * 5; // 5 minutes for live PTR
const CRTSH_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours for crt.sh results

const cache = createDefaultCache<string[]>();

/**
 * Perform a PTR reverse DNS lookup for an IP with timeout and fallback.
 * Uses `dns.promises.reverse` and on failure queries crt.sh public JSON endpoint.
 * @param ip IPv4/IPv6 string
 * @param opts optional { timeoutMs }
 */
export async function reverseLookup(
  ip: string,
  opts?: { timeoutMs?: number }
): Promise<string[]> {
  const timeoutMs = typeof opts?.timeoutMs === "number" ? opts!.timeoutMs : DEFAULT_DNS_TIMEOUT_MS;

  // First try native PTR with timeout
  try {
    const ptrs = await withTimeout(dns.reverse(ip), timeoutMs);
    // normalize + validate
    const normalized = ptrs
      .map((h) => {
        try {
          return normalizeDomain(h);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as string[];
    const valid = normalized.filter((h) => isValidHost(h));
    if (valid.length) {
      try {
        await cache.set(`reverse:${ip}`, Array.from(new Set(valid)), PTR_TTL_MS);
      } catch {}
      return Array.from(new Set(valid));
    }
  } catch (err: any) {
    // dns reverse failed or timed out — log and continue to fallback
    logger.debug({ err, ip }, "PTR lookup failed or timed out, will try fallback");
  }

  // Fallback: query crt.sh public JSON for certificates referencing the IP
  try {
    const url = `https://crt.sh/?q=${encodeURIComponent(ip)}&output=json`;
    const resPromise = fetch(url);
    const res = await withTimeout(resPromise, DEFAULT_HTTP_TIMEOUT_MS);
    if (!res.ok) throw new Error(`crt.sh HTTP ${res.status}`);
    const json = (await res.json()) as Array<Record<string, unknown>>;
    const candidates = new Set<string>();
    for (const item of json || []) {
      const maybeCN = item["common_name"] as string | undefined;
      const maybeNV = item["name_value"] as string | undefined;
      if (maybeCN) {
        for (const d of extractDomainsFromText(maybeCN)) candidates.add(d);
      }
      if (maybeNV) {
        for (const d of extractDomainsFromText(maybeNV)) candidates.add(d);
      }
    }
    const list = Array.from(candidates).filter((h) => isValidHost(h));
    try {
      await cache.set(`reverse:${ip}`, list, CRTSH_TTL_MS);
    } catch {}
    return list;
  } catch (err: any) {
    logger.debug({ err, ip }, "crt.sh fallback failed");
    return [];
  }
}

/**
 * Resolve A, AAAA and CNAME for a host with timeout and return combined results.
 */
export async function resolveHostDetails(
  host: string,
  opts?: { timeoutMs?: number }
): Promise<{ a: string[]; aaaa: string[]; cnames: string[] }> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_DNS_TIMEOUT_MS;
  const res: { a: string[]; aaaa: string[]; cnames: string[] } = { a: [], aaaa: [], cnames: [] };
  try {
    const a = await withTimeout(dns.resolve4(host), timeoutMs).catch(() => [] as string[]);
    res.a = Array.isArray(a) ? a : [];
  } catch {}
  try {
    const aaaa = await withTimeout(dns.resolve6(host), timeoutMs).catch(() => [] as string[]);
    res.aaaa = Array.isArray(aaaa) ? aaaa : [];
  } catch {}
  try {
    const cn = await withTimeout(dns.resolveCname(host), timeoutMs).catch(() => [] as string[]);
    res.cnames = Array.isArray(cn) ? cn : [];
  } catch {}
  return res;
}

/**
 * Detect whether a domain uses wildcard DNS by resolving multiple random labels.
 * Tests 3 random subdomains to reduce false positives.
 * Returns the set of wildcard IPs if detected, empty set otherwise.
 */
export async function detectWildcard(domain: string): Promise<boolean> {
  try {
    // Generate 3 random subdomains that shouldn't exist
    const randoms = Array.from({ length: 3 }, () =>
      `xzq-${Math.random().toString(36).slice(2, 10)}`
    );
    const testHosts = randoms.map(r => `${r}.${domain}`);
    const results = await Promise.all(testHosts.map(h => resolveHostDetails(h)));

    // Collect all IPs from random subdomains
    const allTestIps: string[][] = results.map(r => [...r.a, ...r.aaaa]);

    // If none of the random subdomains resolve, no wildcard
    if (allTestIps.every(ips => ips.length === 0)) return false;

    // If at least 2 out of 3 random subdomains resolve to the same IPs, it's wildcard
    let matchCount = 0;
    const firstSet = new Set(allTestIps[0]);
    for (let i = 1; i < allTestIps.length; i++) {
      if (allTestIps[i].length > 0 && allTestIps[i].every(ip => firstSet.has(ip))) {
        matchCount++;
      }
    }
    return matchCount >= 1 && allTestIps[0].length > 0;
  } catch (err) {
    return false;
  }
}

/**
 * Extract domain-like tokens from a blob of text and normalize them.
 * Uses `normalizeDomain` and `isValidHost` to ensure returned hosts are valid.
 * @param text arbitrary text
 */
export function extractDomainsFromText(text: string): string[] {
  if (!text || typeof text !== "string") return [];

  // crude regex to extract domain-like tokens (covers most real-world cases)
  const domainPattern = /([a-z0-9\-_.]*[a-z0-9]\.[a-z]{2,})/gi;
  const matches = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = domainPattern.exec(text))) {
    try {
      const norm = normalizeDomain(m[1]);
      if (isValidHost(norm)) matches.add(norm);
    } catch {
      // ignore invalid token
    }
  }
  return Array.from(matches);
}

/**
 * Map a set of IPs to discovered domains using `reverseLookup` with batching, concurrency and caching.
 * @param ips array of IP strings
 * @param opts optional { timeoutMs, concurrency }
 */
export async function mapIPsToDomains(
  ips: string[],
  opts?: { timeoutMs?: number; concurrency?: number }
): Promise<Record<string, string[]>> {
  const concurrency = opts?.concurrency ?? DEFAULT_CONCURRENCY;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_DNS_TIMEOUT_MS;
  const limit = pLimit(concurrency);

  const tasks = ips.map((ip) =>
    limit(async () => {
      const key = `reverse:${ip}`;
      try {
        const cached = await cache.get(key);
        if (Array.isArray(cached)) return [ip, cached] as const;
      } catch (err) {
        // ignore cache errors and continue
        logger.debug({ err, ip }, "cache.get error");
      }

      const domains = await reverseLookup(ip, { timeoutMs });
      try {
        await cache.set(key, domains, CACHE_TTL_MS);
      } catch (err) {
        logger.debug({ err, ip }, "cache.set error");
      }
      return [ip, domains] as const;
    })
  );

  const results = await Promise.all(tasks);
  const map: Record<string, string[]> = {};
  for (const [ip, domains] of results) {
    map[ip] = Array.isArray(domains) ? Array.from(new Set(domains)) : [];
  }
  return map;
}

const reverseUtils = {
  reverseLookup,
  extractDomainsFromText,
  mapIPsToDomains,
};
export default reverseUtils;
