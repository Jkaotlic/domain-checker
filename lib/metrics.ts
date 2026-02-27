/**
 * Minimal Prometheus metrics using `prom-client`.
 *
 * Exports:
 * - `register` (the Prometheus registry)
 * - helper functions to increment/observe metrics
 *
 * Metrics:
 * - `domain_checker_requests_total` (Counter)
 * - `domain_checker_rate_limited_total` (Counter)
 * - `domain_checker_cache_hit_ratio` (Gauge) — currently a stub that callers may set
 * - `domain_checker_reverse_latency_seconds` (Histogram)
 *
 * Usage:
 * import { incRequests, incRateLimited, observeReverseLatency, register } from './lib/metrics'
 * 
 * // expose `register.metrics()` via an HTTP endpoint for Prometheus scraping
 */

import { Counter, Gauge, register } from 'prom-client';

export const requestsTotal = new Counter({
  name: 'domain_checker_requests_total',
  help: 'Total number of requests handled by domain-checker',
});

export const rateLimitedTotal = new Counter({
  name: 'domain_checker_rate_limited_total',
  help: 'Total number of requests that were rate limited',
});

export const cacheHitRatio = new Gauge({
  name: 'domain_checker_cache_hit_ratio',
  help: 'Cache hit ratio (0.0 - 1.0) for lookups; set by application',
});

/**
 * Increment requests counter.
 */
export function incRequests(count = 1): void {
  requestsTotal.inc(count);
}

/**
 * Increment rate-limited counter.
 */
export function incRateLimited(count = 1): void {
  rateLimitedTotal.inc(count);
}

/**
 * Set cache hit ratio (0..1). Use `null` to indicate unknown/no-op.
 */
export function setCacheHitRatio(ratio: number | null): void {
  if (ratio == null || Number.isNaN(ratio)) return;
  cacheHitRatio.set(Math.max(0, Math.min(1, ratio)));
}

export { register };
const metrics = { register, incRequests, incRateLimited, setCacheHitRatio };
export default metrics;
