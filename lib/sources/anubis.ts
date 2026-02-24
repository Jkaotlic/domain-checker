import { fetchSource } from './fetchSource';
import { CONFIG } from '../config';

/**
 * Anubis (jldc.me) — subdomain discovery service.
 * Returns a JSON array of subdomains directly.
 * Completely free, no auth required.
 */
export async function fetchAnubis(domain: string): Promise<string[]> {
  const url = `https://jldc.me/anubis/subdomains/${encodeURIComponent(domain)}`;
  return fetchSource(url, (data) => {
    if (!Array.isArray(data)) return [];
    return data.filter((e): e is string => typeof e === 'string');
  }, domain, 'anubis', { retries: 2, backoffMs: 300, timeoutMs: CONFIG.HTTP_TIMEOUT_MS });
}

export default fetchAnubis;
