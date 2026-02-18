import { fetchWithRetry } from '../net/fetchWithRetry';
import logger from '../logger';
import { CONFIG } from '../config';

/**
 * BufferOver (tls.bufferover.run) — free passive DNS data from TLS certificates.
 * Completely free, no auth required.
 */
export async function fetchBufferOver(domain: string): Promise<string[]> {
  const url = `https://tls.bufferover.run/dns?q=.${encodeURIComponent(domain)}`;
  try {
    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': 'domain-checker/1.0' },
    }, { retries: 2, backoffMs: 300, timeoutMs: CONFIG.HTTP_TIMEOUT_MS });
    if (!res.ok) return [];
    const json = await res.json();
    const subs = new Set<string>();
    // BufferOver returns { Results: ["ip,hostname", ...] }
    const results = json.Results || json.FDNS_A || [];
    if (!Array.isArray(results)) return [];
    for (const line of results) {
      if (typeof line !== 'string') continue;
      // Format: "ip,hostname" or "hostname,ip"
      const parts = line.split(',');
      for (const part of parts) {
        const clean = part.trim().toLowerCase();
        if (clean.endsWith(`.${domain}`) || clean === domain) {
          subs.add(clean);
        }
      }
    }
    return Array.from(subs);
  } catch (err) {
    logger.debug({ err, domain }, 'bufferover fetch error');
    return [];
  }
}

export default fetchBufferOver;
