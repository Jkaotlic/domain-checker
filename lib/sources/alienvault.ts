import { fetchSource } from './fetchSource';
import { CONFIG } from '../config';

export async function fetchAlienVault(domain: string): Promise<string[]> {
  const url = `https://otx.alienvault.com/api/v1/indicators/domain/${encodeURIComponent(domain)}/passive_dns`;
  return fetchSource(url, (data) => {
    const json = data as Record<string, unknown>;
    const rows = ((json?.passive_dns || json?.data) as Array<Record<string, any>>) || [];
    const subs: string[] = [];
    for (const r of rows) {
      if (r.hostname) subs.push(r.hostname);
      if (r.address) subs.push(r.address);
    }
    return subs;
  }, domain, 'alienvault', { retries: 2, backoffMs: 200, timeoutMs: CONFIG.HTTP_TIMEOUT_MS });
}

export default fetchAlienVault;
