import { fetchSource } from './fetchSource';
import { CONFIG } from '../config';

/**
 * BufferOver (tls.bufferover.run) — free passive DNS data from TLS certificates.
 * Completely free, no auth required.
 */
export async function fetchBufferOver(domain: string): Promise<string[]> {
  const url = `https://tls.bufferover.run/dns?q=.${encodeURIComponent(domain)}`;
  return fetchSource(url, (data) => {
    const json = data as Record<string, unknown>;
    // BufferOver returns { Results: ["ip,hostname", ...] }
    const results = (json.Results || json.FDNS_A || []) as unknown[];
    if (!Array.isArray(results)) return [];
    const names: string[] = [];
    for (const line of results) {
      if (typeof line !== 'string') continue;
      // Format: "ip,hostname" or "hostname,ip"
      const parts = line.split(',');
      for (const part of parts) {
        names.push(part.trim());
      }
    }
    return names;
  }, domain, 'bufferover', { retries: 2, backoffMs: 300, timeoutMs: CONFIG.HTTP_TIMEOUT_MS });
}

export default fetchBufferOver;
