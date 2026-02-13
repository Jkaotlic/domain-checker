import { fetchWithRetry } from '../net/fetchWithRetry';
import logger from '../logger';
import { CONFIG } from '../config';

export async function fetchAlienVault(domain: string): Promise<string[]> {
  const url = `https://otx.alienvault.com/api/v1/indicators/domain/${encodeURIComponent(domain)}/passive_dns`;
  try {
    const res = await fetchWithRetry(url, { headers: { 'User-Agent': 'domain-checker/1.0' } }, { retries: 2, backoffMs: 200, timeoutMs: CONFIG.HTTP_TIMEOUT_MS });
    if (!res.ok) return [];
    const json = await res.json();
    const subs = new Set<string>();
    const rows = json?.passive_dns || json?.data || [];
    for (const r of rows) {
      if (r.hostname) subs.add(r.hostname.toLowerCase());
      if (r.address) subs.add(r.address); // sometimes subdomain is in address
    }
    return Array.from(subs);
  } catch (err) {
    logger.debug({ err, domain }, 'alienvault fetch error');
    return [];
  }
}

export default fetchAlienVault;
