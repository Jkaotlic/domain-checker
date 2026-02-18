import { fetchWithRetry } from '../net/fetchWithRetry';
import logger from '../logger';
import { CONFIG } from '../config';

/**
 * ThreatMiner — free threat intelligence API.
 * rt=5 returns subdomains/related domains.
 * Completely free, no auth required.
 */
export async function fetchThreatMiner(domain: string): Promise<string[]> {
  const url = `https://api.threatminer.org/v2/domain.php?q=${encodeURIComponent(domain)}&rt=5`;
  try {
    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': 'domain-checker/1.0' },
    }, { retries: 2, backoffMs: 500, timeoutMs: CONFIG.HTTP_TIMEOUT_MS });
    if (!res.ok) return [];
    const json = await res.json();
    if (json.status_code !== '200' && json.status_code !== 200) return [];
    const results = json.results;
    if (!Array.isArray(results)) return [];
    const subs = new Set<string>();
    for (const entry of results) {
      const name = typeof entry === 'string' ? entry : entry?.domain || entry?.hostname;
      if (typeof name !== 'string') continue;
      const clean = name.toLowerCase().trim();
      if (clean.endsWith(`.${domain}`) || clean === domain) {
        subs.add(clean);
      }
    }
    return Array.from(subs);
  } catch (err) {
    logger.debug({ err, domain }, 'threatminer fetch error');
    return [];
  }
}

export default fetchThreatMiner;
