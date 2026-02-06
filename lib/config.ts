// Centralized runtime configuration for timeouts, concurrency and cache TTLs.
// Values are read from env with sane defaults and can be overridden in tests.

export const CONFIG = {
  // Network timeouts (ms)
  HTTP_TIMEOUT_MS: Number(process.env.HTTP_TIMEOUT_MS || 5000),
  DNS_TIMEOUT_MS: Number(process.env.DNS_TIMEOUT_MS || 3000),

  // Cache TTLs (milliseconds)
  TTL: {
    PTR_MS: Number(process.env.PTR_TTL_MS || 1000 * 60 * 60), // 1h
    A_RECORD_MS: Number(process.env.A_RECORD_TTL_MS || 1000 * 60 * 10), // 10m
    AGGREGATED_MS: Number(process.env.AGGREGATED_TTL_MS || 1000 * 60 * 60 * 24), // 24h
  },

  // Concurrency defaults
  CONCURRENCY: {
    DEFAULT: Number(process.env.CONCURRENCY_DEFAULT || 10),
  },

  // Cache key prefix (for easy versioning)
  CACHE_KEY_PREFIX: process.env.CACHE_KEY_PREFIX || 'v1:',
};

export default CONFIG;
