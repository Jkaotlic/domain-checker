import { fetchSource } from './fetchSource';
import { CONFIG } from '../config';

/**
 * ThreatMiner — free threat intelligence API.
 * rt=5 returns subdomains/related domains.
 * Completely free, no auth required.
 */
export async function fetchThreatMiner(domain: string): Promise<string[]> {
  const url = `https://api.threatminer.org/v2/domain.php?q=${encodeURIComponent(domain)}&rt=5`;
  return fetchSource(url, (data) => {
    const json = data as Record<string, unknown>;
    if (json.status_code !== '200' && json.status_code !== 200) return [];
    const results = json.results;
    if (!Array.isArray(results)) return [];
    const names: string[] = [];
    for (const entry of results) {
      const name = typeof entry === 'string' ? entry : (entry as Record<string, unknown>)?.domain || (entry as Record<string, unknown>)?.hostname;
      if (typeof name === 'string') names.push(name);
    }
    return names;
  }, domain, 'threatminer', { retries: 2, backoffMs: 500, timeoutMs: CONFIG.HTTP_TIMEOUT_MS });
}

export default fetchThreatMiner;
