import { fetchWithRetry } from '../net/fetchWithRetry';
import logger from '../logger';
import { CONFIG } from '../config';

/**
 * RapidDNS — free subdomain enumeration via HTML page parsing.
 * Parses table rows from the HTML response.
 * Free, no auth required.
 */
export async function fetchRapidDNS(domain: string): Promise<string[]> {
  const url = `https://rapiddns.io/subdomain/${encodeURIComponent(domain)}?full=1`;
  try {
    const res = await fetchWithRetry(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; domain-checker/1.0)',
        'Accept': 'text/html',
      },
    }, { retries: 2, backoffMs: 300, timeoutMs: CONFIG.HTTP_TIMEOUT_MS * 2 });
    if (!res.ok) return [];
    const html = await res.text();
    const subs = new Set<string>();
    // Extract subdomains from table cells — pattern: <td>subdomain.domain.com</td>
    const tdPattern = /<td>([a-z0-9._-]+\.[a-z]{2,})<\/td>/gi;
    let match;
    while ((match = tdPattern.exec(html))) {
      const host = match[1].toLowerCase().trim();
      if (host.endsWith(`.${domain}`) || host === domain) {
        subs.add(host);
      }
    }
    return Array.from(subs);
  } catch (err) {
    logger.debug({ err, domain }, 'rapiddns fetch error');
    return [];
  }
}

export default fetchRapidDNS;
