import pLimit from 'p-limit';
import { CONFIG } from '../config';
import logger from '../logger';

const hostLimitMap = new Map<string, ReturnType<typeof pLimit>>();

function getHostFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host;
  } catch (e) {
    return 'default';
  }
}

function getLimitForHost(host: string) {
  if (!hostLimitMap.has(host)) {
    hostLimitMap.set(host, pLimit(CONFIG.CONCURRENCY.DEFAULT));
  }
  return hostLimitMap.get(host)!;
}

export interface FetchRetryOptions {
  retries?: number; // total attempts
  backoffMs?: number; // base backoff
  timeoutMs?: number; // per-request timeout
}

export async function fetchWithRetry(url: string, init?: RequestInit, opts?: FetchRetryOptions): Promise<Response> {
  const retries = opts?.retries ?? 3;
  const base = opts?.backoffMs ?? 200;
  const timeoutMs = opts?.timeoutMs ?? CONFIG.HTTP_TIMEOUT_MS;
  const host = getHostFromUrl(url);
  const limit = getLimitForHost(host);

  return limit(() => execWithRetry(url, init, { retries, base, timeoutMs }));
}

async function execWithRetry(url: string, init: RequestInit | undefined, cfg: { retries: number; base: number; timeoutMs: number; }) {
  let attempt = 0;
  while (true) {
    attempt++;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      // Use runtime-provided global `fetch` when available (Node 18+ / Next.js).
      // Avoid importing ESM-only `node-fetch` which causes Jest/transform issues.
      const runtimeFetch = (globalThis as any).fetch;
      if (typeof runtimeFetch !== 'function') {
        throw new Error('fetch is not available in this runtime. Ensure Node 18+ or Next.js provides global fetch');
      }
      const res = await runtimeFetch(url, { ...(init || {}), signal: controller.signal });
      clearTimeout(id);
      if (res.status === 429) {
        // rate limited - respect Retry-After if present
        const ra = res.headers.get('retry-after');
        const delay = ra ? parseRetryAfter(ra) : cfg.base * Math.pow(2, attempt - 1);
        if (attempt >= cfg.retries) return res; // last attempt, return 429
        logger.debug({ url, attempt, status: res.status, delay }, 'fetchWithRetry received 429, backing off');
        await delayMs(delay);
        continue;
      }
      if (res.status >= 500) {
        if (attempt >= cfg.retries) return res;
        const delay = cfg.base * Math.pow(2, attempt - 1);
        logger.debug({ url, attempt, status: res.status, delay }, 'fetchWithRetry received 5xx, retrying');
        await delayMs(delay);
        continue;
      }
      return res;
    } catch (err: any) {
      clearTimeout(id);
      // AbortError or network errors
      if (err.name === 'AbortError') {
        logger.debug({ url, attempt }, 'fetchWithRetry request aborted');
      } else {
        logger.debug({ url, attempt, err }, 'fetchWithRetry network error');
      }
      if (attempt >= cfg.retries) throw err;
      const delay = cfg.base * Math.pow(2, attempt - 1);
      await delayMs(delay);
      continue;
    }
  }
}

function delayMs(ms: number) {
  return new Promise((res) => setTimeout(res, Math.max(0, Math.floor(ms))));
}

function parseRetryAfter(val: string): number {
  // If numeric -> seconds
  const n = Number(val);
  if (!Number.isNaN(n)) return n * 1000;
  // Attempt to parse HTTP-date
  const t = Date.parse(val);
  if (!Number.isNaN(t)) return Math.max(0, t - Date.now());
  return 1000;
}
