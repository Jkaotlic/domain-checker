import { fetchWithRetry } from '../net/fetchWithRetry';
import logger from '../logger';
import { CONFIG } from '../config';

/**
 * Wayback Machine CDX API — extracts unique subdomains from archived URLs.
 * Completely free, no auth, massive historical coverage.
 */
export async function fetchWebArchive(domain: string): Promise<string[]> {
  const url = `https://web.archive.org/cdx/search/cdx?url=*.${encodeURIComponent(domain)}/*&output=json&fl=original&collapse=urlkey&limit=10000`;
  try {
    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': 'domain-checker/1.0' },
    }, { retries: 2, backoffMs: 300, timeoutMs: CONFIG.HTTP_TIMEOUT_MS * 2 });
    if (!res.ok) return [];
    const json = await res.json();
    if (!Array.isArray(json)) return [];
    const subs = new Set<string>();
    // First row is header ["original"], skip it
    for (let i = 1; i < json.length; i++) {
      const row = json[i];
      const urlStr = Array.isArray(row) ? row[0] : row;
      if (typeof urlStr !== 'string') continue;
      try {
        const parsed = new URL(urlStr);
        const host = parsed.hostname.toLowerCase();
        if (host.endsWith(`.${domain}`) || host === domain) {
          subs.add(host);
        }
      } catch {
        // ignore invalid URLs
      }
    }
    return Array.from(subs);
  } catch (err) {
    logger.debug({ err, domain }, 'webarchive fetch error');
    return [];
  }
}

export default fetchWebArchive;
