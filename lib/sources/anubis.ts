import { fetchWithRetry } from '../net/fetchWithRetry';
import logger from '../logger';
import { CONFIG } from '../config';

/**
 * Anubis (jldc.me) — subdomain discovery service.
 * Returns a JSON array of subdomains directly.
 * Completely free, no auth required.
 */
export async function fetchAnubis(domain: string): Promise<string[]> {
  const url = `https://jldc.me/anubis/subdomains/${encodeURIComponent(domain)}`;
  try {
    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': 'domain-checker/1.0' },
    }, { retries: 2, backoffMs: 300, timeoutMs: CONFIG.HTTP_TIMEOUT_MS });
    if (!res.ok) return [];
    const json = await res.json();
    if (!Array.isArray(json)) return [];
    const subs = new Set<string>();
    for (const entry of json) {
      if (typeof entry !== 'string') continue;
      const clean = entry.toLowerCase().trim();
      if (clean.endsWith(`.${domain}`) || clean === domain) {
        subs.add(clean);
      }
    }
    return Array.from(subs);
  } catch (err) {
    logger.debug({ err, domain }, 'anubis fetch error');
    return [];
  }
}

export default fetchAnubis;
