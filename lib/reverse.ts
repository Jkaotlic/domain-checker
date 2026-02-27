import dns from "dns/promises";
import { withTimeout } from "./net/timeout";
import { fetchWithRetry } from "./net/fetchWithRetry";
import { createDefaultCache } from "./cache";
import { CONFIG } from "./config";
import logger from "./logger";
import { normalizeDomain, isValidHost } from "./subdomain";

const cache = createDefaultCache<string[]>();

/**
 * Perform a PTR reverse DNS lookup for an IP with timeout and fallback.
 * Uses `dns.promises.reverse` and on failure queries crt.sh public JSON endpoint.
 */
export async function reverseLookup(
  ip: string,
  opts?: { timeoutMs?: number }
): Promise<string[]> {
  const timeoutMs = typeof opts?.timeoutMs === "number" ? opts!.timeoutMs : CONFIG.DNS_TIMEOUT_MS;

  // First try native PTR with timeout
  try {
    const ptrs = await withTimeout(dns.reverse(ip), timeoutMs);
    const normalized = ptrs
      .map((h) => { try { return normalizeDomain(h); } catch { return null; } })
      .filter(Boolean) as string[];
    const valid = Array.from(new Set(normalized.filter((h) => isValidHost(h))));
    if (valid.length) {
      try { await cache.set(`reverse:${ip}`, valid, CONFIG.TTL.PTR_MS); } catch {}
      return valid;
    }
  } catch (err: unknown) {
    logger.debug({ err, ip }, "PTR lookup failed or timed out, will try fallback");
  }

  // Fallback: query crt.sh public JSON for certificates referencing the IP
  try {
    const url = `https://crt.sh/?q=${encodeURIComponent(ip)}&output=json`;
    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': 'domain-checker/1.0' },
    }, { retries: 2, timeoutMs: CONFIG.HTTP_TIMEOUT_MS });
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
    try { await cache.set(`reverse:${ip}`, list, CONFIG.TTL.AGGREGATED_MS); } catch {}
    return list;
  } catch (err: unknown) {
    logger.debug({ err, ip }, "crt.sh fallback failed");
    return [];
  }
}

/**
 * Resolve A, AAAA and CNAME for a host with timeout.
 */
export async function resolveHostDetails(
  host: string,
  opts?: { timeoutMs?: number }
): Promise<{ a: string[]; aaaa: string[]; cnames: string[] }> {
  const timeoutMs = opts?.timeoutMs ?? CONFIG.DNS_TIMEOUT_MS;
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
 */
export async function detectWildcard(domain: string): Promise<boolean> {
  try {
    const randoms = Array.from({ length: 3 }, () =>
      `xzq-${Math.random().toString(36).slice(2, 10)}`
    );
    const testHosts = randoms.map(r => `${r}.${domain}`);
    const results = await Promise.all(testHosts.map(h => resolveHostDetails(h)));

    const allTestIps: string[][] = results.map(r => [...r.a, ...r.aaaa]);
    if (allTestIps.every(ips => ips.length === 0)) return false;
    if (allTestIps[0].length === 0) return false;
    const firstSet = new Set(allTestIps[0]);
    for (let i = 1; i < allTestIps.length; i++) {
      if (allTestIps[i].length === 0) return false;
      if (allTestIps[i].length !== firstSet.size) return false;
      if (!allTestIps[i].every(ip => firstSet.has(ip))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract domain-like tokens from a blob of text and normalize them.
 */
export function extractDomainsFromText(text: string): string[] {
  if (!text || typeof text !== "string") return [];

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
