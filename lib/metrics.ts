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

import { Counter, Gauge, Histogram, register } from 'prom-client';

// Requests seen (all checks)
export const requestsTotal = new Counter({
  name: 'domain_checker_requests_total',
  help: 'Total number of requests handled by domain-checker',
});

// Rate limited events
export const rateLimitedTotal = new Counter({
  name: 'domain_checker_rate_limited_total',
  help: 'Total number of requests that were rate limited',
});

// Cache hit ratio (stub; callers should update with actual ratio)
export const cacheHitRatio = new Gauge({
  name: 'domain_checker_cache_hit_ratio',
  help: 'Cache hit ratio (0.0 - 1.0) for lookups; set by application',
  // No labels for now
});

// Histogram for reverse lookup latency in seconds
export const reverseLatency = new Histogram({
  name: 'domain_checker_reverse_latency_seconds',
  help: 'Histogram of reverse lookup latency in seconds',
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
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

/**
 * Observe reverse lookup latency in seconds.
 */
export function observeReverseLatency(seconds: number): void {
  if (!isFinite(seconds) || seconds < 0) return;
  reverseLatency.observe(seconds);
}

export { register };
const metrics = { register, incRequests, incRateLimited, setCacheHitRatio, observeReverseLatency };
export default metrics;
