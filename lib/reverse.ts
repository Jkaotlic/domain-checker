import dns from "dns/promises";
import pLimit from "p-limit";
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
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour cache for reverse results

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
    if (valid.length) return Array.from(new Set(valid));
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
    return Array.from(candidates).filter((h) => isValidHost(h));
  } catch (err: any) {
    logger.debug({ err, ip }, "crt.sh fallback failed");
    return [];
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

export default {
  reverseLookup,
  extractDomainsFromText,
  mapIPsToDomains,
};
