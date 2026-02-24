import { fetchWithRetry, FetchRetryOptions } from '../net/fetchWithRetry';
import logger from '../logger';
import { CONFIG } from '../config';

const DEFAULT_HEADERS = { 'User-Agent': 'domain-checker/1.0' };

export interface FetchSourceOptions {
  headers?: Record<string, string>;
  retries?: number;
  backoffMs?: number;
  timeoutMs?: number;
}

/**
 * Common wrapper for passive source fetches.
 * Handles fetch, error handling, and domain filtering in one place.
 */
export async function fetchSource(
  url: string,
  parser: (data: unknown) => string[],
  domain: string,
  sourceName: string,
  opts?: FetchSourceOptions,
): Promise<string[]> {
  const retryOpts: FetchRetryOptions = {
    retries: opts?.retries ?? 2,
    backoffMs: opts?.backoffMs ?? 200,
    timeoutMs: opts?.timeoutMs ?? CONFIG.HTTP_TIMEOUT_MS,
  };
  const headers = opts?.headers ?? DEFAULT_HEADERS;

  try {
    const res = await fetchWithRetry(url, { headers }, retryOpts);
    if (!res.ok) return [];
    const data = await res.json();
    const raw = parser(data);
    // Filter to only subdomains of the target domain
    const subs = new Set<string>();
    for (const name of raw) {
      const clean = name.toLowerCase().trim().replace(/^\*\./, '');
      if (!clean) continue;
      if (clean === domain || clean.endsWith(`.${domain}`)) {
        subs.add(clean);
      }
    }
    return Array.from(subs);
  } catch (err) {
    logger.debug({ err, domain }, `${sourceName} fetch error`);
    return [];
  }
}

export default fetchSource;
