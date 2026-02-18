import { fetchWithRetry } from '../net/fetchWithRetry';
import logger from '../logger';
import { CONFIG } from '../config';

/**
 * crt.sh — Certificate Transparency log search.
 * Returns all subdomains found in SSL/TLS certificates (no limit).
 * Completely free, no auth required.
 */
export async function fetchCrtSh(domain: string): Promise<string[]> {
  const url = `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`;
  try {
    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': 'domain-checker/1.0' },
    }, { retries: 2, backoffMs: 500, timeoutMs: CONFIG.HTTP_TIMEOUT_MS * 2 });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    const subs = new Set<string>();
    for (const cert of data) {
      const nameValue = cert.name_value || cert.common_name || '';
      const names = String(nameValue).split(/[\n\r\s]+/);
      for (const name of names) {
        const clean = name.trim().toLowerCase().replace(/^\*\./, '');
        if (!clean) continue;
        if (clean.endsWith(`.${domain}`) || clean === domain) {
          subs.add(clean);
        }
      }
    }
    return Array.from(subs);
  } catch (err) {
    logger.debug({ err, domain }, 'crtsh fetch error');
    return [];
  }
}

export default fetchCrtSh;
