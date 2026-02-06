import { fetchWithRetry } from '../net/fetchWithRetry';
import logger from '../logger';
import { CONFIG } from '../config';

const SECURITYTRAILS_BASE = 'https://api.securitytrails.com/v1';

export async function fetchSecurityTrails(domainOrIp: string): Promise<string[]> {
  const apiKey = process.env.SECURITYTRAILS_APIKEY;
  if (!apiKey) return [];
  const url = `${SECURITYTRAILS_BASE}/domain/${encodeURIComponent(domainOrIp)}/subdomains`;
  try {
    const res = await fetchWithRetry(url, {
      headers: { APIKEY: apiKey, 'User-Agent': 'domain-checker/1.0' },
    }, { retries: 3, backoffMs: 300, timeoutMs: CONFIG.HTTP_TIMEOUT_MS });
    if (!res.ok) return [];
    const json = await res.json();
    const subs: string[] = (json.subdomains || []).map((s: string) => `${s}.${domainOrIp}`);
    return Array.from(new Set(subs));
  } catch (err) {
    logger.warn({ err, domainOrIp }, 'securitytrails fetch error');
    return [];
  }
}

export default fetchSecurityTrails;
