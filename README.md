# Domain Checker

Domain Checker is a focused Next.js API service to validate domains, normalize and score subdomains, and perform reverse subdomain lookups. It emphasizes correctness, test coverage, and a small, composable core with optional Redis-backed caching for shared state.

## Highlights
- Fast domain and subdomain validation and scoring
- Reverse subdomain tokenization and normalization
- In-memory LRU cache with optional Redis adapter
- TypeScript + Jest tests, small and audit-friendly codebase

## Quickstart

### Prerequisites
- Node.js 18+ (LTS)
- npm
- Optional: Redis (for shared caching)

### Install

```bash
npm ci
```

### Run (development)

```bash
npm run dev
```

### Build and run (production)

```bash
npm run build
npm start
```

### Test

```bash
npm test
```

## Configuration (environment variables)

- `REDIS_URL` — optional. When set, the app uses Redis for caching and rate limits.
- `REDIS_PASSWORD` — optional Redis password.
- `LOG_LEVEL` — optional logging level (defaults to `info`).
- `NODE_ENV` — `development` or `production`.
- `PORT` — optional port for production server.

If `REDIS_URL` is not provided the app falls back to an in-process LRU cache implementation.

## API Endpoints

All endpoints are exposed under `/api` when the app runs.

`POST /api/check`
- Body (JSON): `{ "domain": "string" }`
- Returns scoring and analysis for the supplied domain.

Example:

```bash
curl -sS -X POST http://localhost:3000/api/check \
  -H 'Content-Type: application/json' \
  -d '{"domain":"www.example.com"}'
```

`POST /api/reverse`
- Body (JSON): `{ "subdomain": "string" }`
- Returns tokenized and reversed subdomain form.

Example:

```bash
curl -sS -X POST http://localhost:3000/api/reverse \
  -H 'Content-Type: application/json' \
  -d '{"subdomain":"a.b.c.example.com"}'
```

Example response:

```json
{
  "original": "a.b.c.example.com",
  "reversed": "com.example.c.b.a",
  "tokens": ["a","b","c","example","com"]
}
```

## Development notes

- Core logic lives in `lib/` — see `score.ts`, `subdomain.ts`, `reverse.ts`, and `aggregator.ts`.
- Tests are in `__tests__/` and run with Jest (`npm test`).
- The project includes an ESLint config; CI runs linting if a `lint` script exists.

## Contributing

1. Fork the repository and create a topic branch.
2. Add tests for your change and keep changes minimal.
3. Open a pull request with a clear description and link to related issues.

## License

This project is released under the MIT License — see `LICENSE`.

## Русский — кратко

Domain Checker — лёгкий сервис на Next.js для проверки доменов и обратного анализа поддоменов. Быстрая настройка: `npm ci`, `npm run dev`. Настройки: `REDIS_URL`, `REDIS_PASSWORD`, `LOG_LEVEL`.

Suggested GitHub topics: `domain-validation`, `nextjs`, `typescript`, `dns`, `redis`, `api`

Short description for package.json: "Small Next.js service for domain validation and subdomain reverse lookups."
