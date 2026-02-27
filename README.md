<div align="center">

# Domain Checker

**Subdomain discovery & reverse DNS toolkit**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](#docker)

Self-hosted web service that discovers subdomains by aggregating **10 free OSINT sources**, DNS brute-force, and zone transfers — no API keys required. Also does reverse DNS (IP → domain) with file upload support.

</div>

---

## Features

**Subdomain Discovery**
- 10 passive OSINT sources queried in parallel (crt.sh, AlienVault OTX, HackerTarget, URLScan, Web Archive, CertSpotter, ThreatMiner, Anubis, RapidDNS, BufferOver)
- DNS brute-force with ~500 common subdomain names
- Wildcard DNS detection — automatically filters false positives
- Fallback DNS resolvers (Google, Cloudflare, Quad9) when system DNS fails
- Zone transfer (AXFR) attempt for misconfigured nameservers
- Confidence scoring per result (source authority, DNS consistency, PTR evidence)

**Reverse DNS**
- Bulk IP → domain lookup via PTR records + crt.sh certificate fallback
- Paste IPs, upload `.txt` / `.bat` files, or parse `route add` commands
- Process up to 100 IPs per request with controlled concurrency

**Export**
- Subdomains list (`.txt`)
- IP addresses list (`.txt`)
- Keenetic static routes (`.bat`) — auto-generated `route ADD` script with gateway

**Infrastructure**
- Caching: Redis (ioredis) or automatic in-memory LRU fallback
- Rate limiting: Redis fixed-window or in-process token bucket
- Prometheus metrics via `prom-client`
- [Antifilter](https://community.antifilter.download/) community list cross-reference (optional)
- Docker multi-stage build with healthcheck

---

## Quick Start

### Prerequisites

- **Node.js** 20+ (LTS)
- **npm**
- Redis _(optional — falls back to in-memory cache)_

### Local Development

```bash
git clone https://github.com/Jkaotlic/domain-checker.git
cd domain-checker
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Production Build

```bash
npm run build
npm start
```

### Docker

With Redis (recommended):

```bash
docker compose up --build
```

Standalone (no Redis):

```bash
docker build -t domain-checker .
docker run -p 3000:3000 domain-checker
```

> For **Portainer**: deploy as a Stack using the included `docker-compose.yml`. Healthcheck, log rotation, and resource limits are pre-configured.

---

## API

### `POST /api/check` — Subdomain Discovery

```bash
curl -s -X POST http://localhost:3000/api/check \
  -H 'Content-Type: application/json' \
  -d '{"domain":"example.com"}' | jq
```

<details>
<summary>Response example</summary>

```json
{
  "domain": "example.com",
  "subdomains": [
    {
      "subdomain": "www.example.com",
      "ips": ["93.184.216.34"],
      "source": "dns-bruteforce"
    },
    {
      "subdomain": "mail.example.com",
      "ips": ["93.184.216.34"],
      "source": "crt.sh",
      "antifilter": false
    }
  ],
  "total": 2,
  "wildcardDetected": false,
  "sources": ["crt.sh", "dns-bruteforce", "hackertarget"]
}
```

</details>

### `POST /api/reverse` — Reverse DNS

```bash
curl -s -X POST http://localhost:3000/api/reverse \
  -H 'Content-Type: application/json' \
  -d '{"text":"8.8.8.8\n1.1.1.1","maxIPs":10}' | jq
```

<details>
<summary>Response example</summary>

```json
{
  "results": [
    { "ip": "8.8.8.8", "hostnames": ["dns.google"] },
    { "ip": "1.1.1.1", "hostnames": ["one.one.one.one"] }
  ],
  "total": 2,
  "successful": 2
}
```

</details>

---

## OSINT Sources

| # | Source | Method | Rate limit |
|---|--------|--------|------------|
| 1 | **crt.sh** | Certificate Transparency logs | None |
| 2 | **AlienVault OTX** | Passive DNS | None |
| 3 | **HackerTarget** | Free API | 100/day |
| 4 | **URLScan.io** | Search API | None |
| 5 | **Web Archive** | CDX API | None |
| 6 | **CertSpotter** | Certificate search | None |
| 7 | **ThreatMiner** | Passive DNS | None |
| 8 | **Anubis** | Subdomain DB | None |
| 9 | **RapidDNS** | HTML scrape | None |
| 10 | **BufferOver** | DNS database | None |

All sources run in parallel. Failures are isolated — one source timing out doesn't affect the others.

---

## Configuration

All environment variables are optional (defaults in [`lib/config.ts`](lib/config.ts)):

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | — | Redis connection string |
| `REDIS_PASSWORD` | — | Redis password |
| `HTTP_TIMEOUT_MS` | `5000` | HTTP request timeout |
| `DNS_TIMEOUT_MS` | `3000` | DNS lookup timeout |
| `CONCURRENCY_DEFAULT` | `10` | Parallel task limit |
| `ANTIFILTER_ENABLED` | `true` | Cross-check with Antifilter lists |
| `LOG_LEVEL` | `info` | Pino log level |

See [`.env.example`](.env.example) for a copy-paste template.

---

## Project Structure

```
app/
├── api/
│   ├── check/route.ts          POST /api/check
│   └── reverse/route.ts        POST /api/reverse
└── page.tsx                     Web UI (React)

lib/
├── sources/                     10 OSINT source modules
│   ├── crtsh.ts
│   ├── alienvault.ts
│   ├── hackertarget.ts
│   └── ...
├── net/
│   ├── fetchWithRetry.ts        HTTP with retries, per-host concurrency
│   ├── pLimit.ts                Concurrency limiter
│   ├── worker.ts                Task runner
│   └── timeout.ts               Shared timeout utility
├── dns.ts                       DNS resolution + fallback resolvers
├── reverse.ts                   PTR lookup + crt.sh fallback
├── antifilter.ts                CIDR/domain matching
├── aggregator.ts                Result merging & deduplication
├── score.ts                     Confidence scoring
├── cache.ts                     Cache adapter (LRU / Redis)
├── config.ts                    Centralized configuration
├── limits.ts                    Rate limiting
└── metrics.ts                   Prometheus metrics

__tests__/                       Jest test suite
```

---

## Development

```bash
npm run dev            # Dev server with hot reload
npm run lint           # ESLint (zero warnings)
npm run typecheck      # TypeScript strict check
npm test               # Jest tests
npm run ci             # All of the above
```

Run the full integration test (makes real network calls):

```bash
INTEGRATION=1 npx jest __tests__/api-check-route.test.ts
```

---

## Tech Stack

| | |
|---|---|
| **Runtime** | Next.js 16, React 19, TypeScript 5.9 |
| **Styling** | Tailwind CSS 4 |
| **Cache** | Redis (ioredis) / LRU in-memory |
| **DNS** | Node.js `dns/promises` + public resolver fallback |
| **Metrics** | Prometheus (`prom-client`) |
| **Logging** | Pino (structured JSON) |
| **Testing** | Jest + ts-jest |
| **Container** | Docker multi-stage (node:20-alpine) |

---

## License

[MIT](LICENSE)
