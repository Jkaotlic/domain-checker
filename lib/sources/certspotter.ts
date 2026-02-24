import { fetchSource } from './fetchSource';
import { CONFIG } from '../config';

/**
 * SSLMate CertSpotter — certificate transparency log monitor.
 * Free tier: 100 queries/hour, no API key required.
 */
export async function fetchCertSpotter(domain: string): Promise<string[]> {
  const url = `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names`;
  return fetchSource(url, (data) => {
    if (!Array.isArray(data)) return [];
    const names: string[] = [];
    for (const issuance of data as Array<Record<string, unknown>>) {
      const dnsNames = issuance.dns_names;
      if (!Array.isArray(dnsNames)) continue;
      for (const name of dnsNames) {
        if (typeof name === 'string') names.push(name);
      }
    }
    return names;
  }, domain, 'certspotter', { retries: 2, backoffMs: 300, timeoutMs: CONFIG.HTTP_TIMEOUT_MS });
}

export default fetchCertSpotter;
