import { fetchWithRetry } from '../net/fetchWithRetry';
import logger from '../logger';
import { CONFIG } from '../config';

/**
 * SSLMate CertSpotter — certificate transparency log monitor.
 * Free tier: 100 queries/hour, no API key required.
 */
export async function fetchCertSpotter(domain: string): Promise<string[]> {
  const url = `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names`;
  try {
    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': 'domain-checker/1.0' },
    }, { retries: 2, backoffMs: 300, timeoutMs: CONFIG.HTTP_TIMEOUT_MS });
    if (!res.ok) return [];
    const json = await res.json();
    if (!Array.isArray(json)) return [];
    const subs = new Set<string>();
    for (const issuance of json) {
      const dnsNames = issuance.dns_names;
      if (!Array.isArray(dnsNames)) continue;
      for (const name of dnsNames) {
        if (typeof name !== 'string') continue;
        const clean = name.toLowerCase().replace(/^\*\./, '');
        if (clean.endsWith(`.${domain}`) || clean === domain) {
          subs.add(clean);
        }
      }
    }
    return Array.from(subs);
  } catch (err) {
    logger.debug({ err, domain }, 'certspotter fetch error');
    return [];
  }
}

export default fetchCertSpotter;
