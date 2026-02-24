import { fetchSource } from './fetchSource';
import { CONFIG } from '../config';

export async function fetchURLScan(domain: string): Promise<string[]> {
  const url = `https://urlscan.io/api/v1/search/?q=domain:${encodeURIComponent(domain)}`;
  return fetchSource(url, (data) => {
    const json = data as Record<string, unknown>;
    const results = (json.results || []) as Array<Record<string, any>>;
    const subs: string[] = [];
    for (const r of results) {
      const host = r.page?.domain || r.page?.host || r.task?.domain;
      if (host) subs.push(host);
    }
    return subs;
  }, domain, 'urlscan', { retries: 2, backoffMs: 200, timeoutMs: CONFIG.HTTP_TIMEOUT_MS });
}

export default fetchURLScan;
