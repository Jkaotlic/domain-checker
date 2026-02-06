import { fetchWithRetry } from '../net/fetchWithRetry';
import logger from '../logger';
import { CONFIG } from '../config';

export async function fetchURLScan(domain: string): Promise<string[]> {
  const url = `https://urlscan.io/api/v1/search/?q=domain:${encodeURIComponent(domain)}`;
  try {
    const res = await fetchWithRetry(url, { headers: { 'User-Agent': 'domain-checker/1.0' } }, { retries: 2, backoffMs: 200, timeoutMs: CONFIG.HTTP_TIMEOUT_MS });
    if (!res.ok) return [];
    const json = await res.json();
    const subs = new Set<string>();
    const results = json.results || [];
    for (const r of results) {
      const host = r.page?.domain || r.page?.host || r.task?.domain;
      if (host) subs.add(host);
    }
    return Array.from(subs);
  } catch (err) {
    logger.debug({ err, domain }, 'urlscan fetch error');
    return [];
  }
}

export default fetchURLScan;
