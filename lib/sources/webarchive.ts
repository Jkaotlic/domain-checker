import { fetchSource } from './fetchSource';
import { CONFIG } from '../config';

/**
 * Wayback Machine CDX API — extracts unique subdomains from archived URLs.
 * Completely free, no auth, massive historical coverage.
 */
export async function fetchWebArchive(domain: string): Promise<string[]> {
  const url = `https://web.archive.org/cdx/search/cdx?url=*.${encodeURIComponent(domain)}/*&output=json&fl=original&collapse=urlkey&limit=10000`;
  return fetchSource(url, (data) => {
    if (!Array.isArray(data)) return [];
    const hosts: string[] = [];
    // First row is header ["original"], skip it
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const urlStr = Array.isArray(row) ? row[0] : row;
      if (typeof urlStr !== 'string') continue;
      try {
        const parsed = new URL(urlStr);
        hosts.push(parsed.hostname);
      } catch {
        // ignore invalid URLs
      }
    }
    return hosts;
  }, domain, 'webarchive', { retries: 2, backoffMs: 300, timeoutMs: CONFIG.HTTP_TIMEOUT_MS * 2 });
}

export default fetchWebArchive;
