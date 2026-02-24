import { fetchSource } from './fetchSource';
import { CONFIG } from '../config';

/**
 * crt.sh — Certificate Transparency log search.
 * Returns all subdomains found in SSL/TLS certificates (no limit).
 * Completely free, no auth required.
 */
export async function fetchCrtSh(domain: string): Promise<string[]> {
  const url = `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`;
  return fetchSource(url, (data) => {
    if (!Array.isArray(data)) return [];
    const names: string[] = [];
    for (const cert of data) {
      const nameValue = (cert as Record<string, unknown>).name_value || (cert as Record<string, unknown>).common_name || '';
      names.push(...String(nameValue).split(/[\n\r\s]+/));
    }
    return names;
  }, domain, 'crtsh', { retries: 2, backoffMs: 500, timeoutMs: CONFIG.HTTP_TIMEOUT_MS * 2 });
}

export default fetchCrtSh;
