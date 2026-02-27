// Centralized runtime configuration for timeouts, concurrency and cache TTLs.
// Values are read from env with sane defaults and can be overridden in tests.

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const CONFIG = {
  HTTP_TIMEOUT_MS: envInt('HTTP_TIMEOUT_MS', 5000),
  DNS_TIMEOUT_MS: envInt('DNS_TIMEOUT_MS', 3000),

  TTL: {
    PTR_MS: envInt('PTR_TTL_MS', 1000 * 60 * 60),          // 1h
    A_RECORD_MS: envInt('A_RECORD_TTL_MS', 1000 * 60 * 10), // 10m
    AGGREGATED_MS: envInt('AGGREGATED_TTL_MS', 1000 * 60 * 60 * 24), // 24h
  },

  CONCURRENCY: {
    DEFAULT: envInt('CONCURRENCY_DEFAULT', 10),
  },

  CACHE_KEY_PREFIX: process.env.CACHE_KEY_PREFIX || 'v1:',

  ANTIFILTER: {
    ENABLED: process.env.ANTIFILTER_ENABLED !== 'false',
    DOMAINS_URL: process.env.ANTIFILTER_DOMAINS_URL || 'https://community.antifilter.download/list/domains.lst',
    IPS_URL: process.env.ANTIFILTER_IPS_URL || 'https://community.antifilter.download/list/community.lst',
    CACHE_TTL_MS: envInt('ANTIFILTER_CACHE_TTL_MS', 3600000),
  },
};

export default CONFIG;
