# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Domain Checker is a Next.js 16 service for subdomain discovery and reverse DNS lookups. It aggregates results from 10 free passive OSINT sources (crt.sh, AlienVault OTX, HackerTarget, etc.), DNS brute-forcing, and zone transfers, then scores each finding by confidence.

## Common Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build (standalone output for Docker)
npm run lint         # ESLint (zero warnings enforced)
npm run typecheck    # TypeScript type checking (tsc --noEmit)
npm test             # Run Jest tests
npm run test:watch   # Jest in watch mode
npm run ci           # lint + typecheck + test (full CI pipeline)
```

Run a single test file: `npx jest __tests__/score.test.ts`

Docker: `docker-compose up --build` (starts app + Redis)

## Architecture

### API Endpoints (Next.js App Router)

- **POST /api/check** (`app/api/check/route.ts`) — Full domain analysis: validates domain, detects wildcard DNS, brute-forces ~500 common subdomains, queries 10 passive sources in parallel, merges/deduplicates results, applies confidence scoring, caches for 24h.
- **POST /api/reverse** (`app/api/reverse/route.ts`) — Reverse DNS: extracts IPs from input text, runs parallel PTR lookups (max 10 concurrency, capped at 100 IPs).

### Core Library (`lib/`)

- **`score.ts`** — Confidence scoring: weighted linear combination of source authority (40), DNS consistency (25), frequency (15), PTR evidence (15), and penalty for suspicious patterns (5). Classifies as high/medium/low.
- **`subdomain.ts`** — Domain normalization and validation using `psl` (Public Suffix List).
- **`aggregator.ts`** — Merges subdomain entries (IPs, tags, sources, timestamps) across all discovery methods.
- **`dns.ts`** — DNS resolution with fallback chain: system resolver → Google (8.8.8.8) → Cloudflare (1.1.1.1) → Quad9 (9.9.9.9). Also handles zone transfer attempts.
- **`reverse.ts`** — PTR lookups and IP-to-domain extraction.
- **`config.ts`** — All tunables from environment variables (timeouts, TTLs, concurrency, cache prefix).
- **`limits.ts`** — Rate limiting: Redis fixed-window counter or in-process token bucket fallback.
- **`metrics.ts`** — Prometheus metrics via prom-client.

### Passive Sources (`lib/sources/`)

10 modules (crt.sh, HackerTarget, URLScan, AlienVault, Web Archive, CertSpotter, ThreatMiner, Anubis, RapidDNS, BufferOver). Each returns `Promise<string[]>`, uses `fetchWithRetry`, validates with `isValidHost`, and gracefully returns `[]` on failure.

### Network Layer (`lib/net/`)

- **`fetchWithRetry.ts`** — HTTP fetch with exponential backoff (200ms base, 3 retries), per-host concurrency limiting, respects `Retry-After`.
- **`pLimit.ts`** — Minimal concurrency limiter (custom p-limit replacement).
- **`worker.ts`** — Task runner with configurable concurrency and retries.

### Caching (`lib/cache.ts`, `lib/redisAdapter.ts`)

Adapter pattern with two backends:
- `RedisCacheAdapter` — Uses ioredis with JSON serialization and TTL.
- `InMemoryLRUAdapter` — LRU cache (5000 entries, 1h default TTL) as fallback when Redis is unavailable.

`createDefaultCache()` factory selects backend based on `REDIS_URL` env var.

### Antifilter Validation (`lib/antifilter.ts`)

Optional cross-reference of discovered subdomains/IPs against community.antifilter.download lists (community-curated blocked/geo-restricted resources). Checks domain membership (exact + parent-domain match) and IPv4 CIDR range matching. Enabled by default, cached for 1 hour.

## Key Design Patterns

- **Graceful degradation**: Redis → LRU, system DNS → public resolvers, zone transfer failure → passive sources continue.
- **Per-host concurrency**: HTTP requests to the same host are serialized to avoid rate limiting.
- **All passive sources run in parallel** and failures are isolated (one source failing doesn't affect others).

## Environment Variables

Defined in `lib/config.ts`, all optional:
- `REDIS_URL` / `REDIS_PASSWORD` — Redis connection
- `HTTP_TIMEOUT_MS` (default 5000), `DNS_TIMEOUT_MS` (default 3000)
- `PTR_TTL_MS`, `A_RECORD_TTL_MS`, `AGGREGATED_TTL_MS` — Cache TTLs
- `CONCURRENCY_DEFAULT` — Parallel task limit
- `LOG_LEVEL` (default `info`)
- `ANTIFILTER_ENABLED` (default `true`) — Enable antifilter community list validation
- `ANTIFILTER_DOMAINS_URL`, `ANTIFILTER_IPS_URL` — Custom list URLs
- `ANTIFILTER_CACHE_TTL_MS` (default 3600000) — List cache TTL

## Testing

Jest with ts-jest, test environment: node. Tests are in `__tests__/`. The setup file is `jest.setup.ts`. Tests cover scoring logic, domain normalization, cache behavior, passive sources, and both API routes.
