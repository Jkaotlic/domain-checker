import { fetchWithRetry } from '../net/fetchWithRetry';
import logger from '../logger';
import { CONFIG } from '../config';

/**
 * HackerTarget — returns CSV text, not JSON. Needs custom parsing.
 */
export async function fetchHackerTarget(domain: string): Promise<string[]> {
  const url = `https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(domain)}`;
  try {
    const res = await fetchWithRetry(url, { headers: { 'User-Agent': 'domain-checker/1.0' } }, { retries: 2, backoffMs: 200, timeoutMs: CONFIG.HTTP_TIMEOUT_MS });
    if (!res.ok) return [];
    const txt = await res.text();
    if (txt.includes('error') || txt.includes('API count exceeded')) return [];
    const lines = txt.split(/\r?\n/).filter(Boolean);
    const subs = lines.map((ln) => ln.split(',')[0].trim()).filter(Boolean);
    return Array.from(new Set(subs));
  } catch (err) {
    logger.debug({ err, domain }, 'hackertarget fetch error');
    return [];
  }
}

export default fetchHackerTarget;
