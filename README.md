# Domain Checker

Next.js-сервис для обнаружения поддоменов и обратного DNS-анализа. Агрегирует данные из **10 бесплатных OSINT-источников** (crt.sh, AlienVault OTX, HackerTarget, URLScan, Web Archive, CertSpotter, ThreatMiner, Anubis, RapidDNS, BufferOver), DNS brute-force (~500 популярных имён), зонных трансферов и reverse DNS lookups.

## Возможности

- Поиск поддоменов через 10 пассивных OSINT-источников (без API-ключей)
- DNS brute-force ~500 популярных поддоменов с fallback на публичные DNS (Google, Cloudflare, Quad9)
- Детекция wildcard DNS и фильтрация ложных результатов
- Reverse DNS (IP → домен) с поддержкой файлов и команд `route add`
- Валидация через [Antifilter community lists](https://community.antifilter.download/) (опционально)
- Экспорт: субдомены TXT, IP-адреса TXT, статические маршруты Keenetic (.bat)
- Rate limiting (Redis fixed-window / in-memory token bucket)
- Кеширование: Redis (ioredis) или in-memory LRU
- Prometheus метрики (`prom-client`)
- Docker + docker-compose (app + Redis)

## Быстрый старт

### Требования

- Node.js 20+ (LTS)
- npm
- Опционально: Redis

### Установка и запуск

```bash
npm ci
npm run dev       # dev-сервер на http://localhost:3000
```

### Production

```bash
npm run build
npm start
```

### Docker

```bash
docker compose up --build
# Приложение: http://localhost:3000
# Redis поднимается автоматически
```

Без Redis:

```bash
docker build -t domain-checker .
docker run -p 3000:3000 -e NODE_ENV=production domain-checker
```

### Тесты

```bash
npm test                            # все тесты
npx jest __tests__/score.test.ts    # один файл
npm run ci                          # lint + typecheck + test
```

## API

### POST /api/check

Полный анализ домена: wildcard-детекция, brute-force, 10 пассивных источников, резолв IP, antifilter.

```bash
curl -X POST http://localhost:3000/api/check \
  -H 'Content-Type: application/json' \
  -d '{"domain":"example.com"}'
```

Ответ:

```json
{
  "domain": "example.com",
  "subdomains": [
    { "subdomain": "www.example.com", "ips": ["93.184.216.34"], "source": "dns-bruteforce" }
  ],
  "total": 1,
  "wildcardDetected": false,
  "sources": ["crt.sh", "dns-bruteforce"]
}
```

### POST /api/reverse

Reverse DNS по списку IP (из текста, файлов, команд `route add`).

```bash
curl -X POST http://localhost:3000/api/reverse \
  -H 'Content-Type: application/json' \
  -d '{"text":"8.8.8.8\n1.1.1.1","maxIPs":10}'
```

## Конфигурация

Все env-переменные опциональны (есть дефолты в `lib/config.ts`):

| Переменная | Default | Описание |
|---|---|---|
| `REDIS_URL` | — | Redis connection URL |
| `REDIS_PASSWORD` | — | Redis password |
| `HTTP_TIMEOUT_MS` | `5000` | Таймаут HTTP-запросов |
| `DNS_TIMEOUT_MS` | `3000` | Таймаут DNS-запросов |
| `CONCURRENCY_DEFAULT` | `10` | Параллельность задач |
| `ANTIFILTER_ENABLED` | `true` | Antifilter community list проверка |

## Архитектура

```
app/
  api/check/route.ts     — POST /api/check
  api/reverse/route.ts   — POST /api/reverse
  page.tsx               — UI (React)
lib/
  sources/               — 10 пассивных OSINT-источников
  net/                   — fetchWithRetry, pLimit, worker, timeout
  dns.ts                 — DNS resolve с fallback
  reverse.ts             — PTR lookup + crt.sh fallback
  antifilter.ts          — Antifilter CIDR/domain проверка
  cache.ts               — CacheAdapter (LRU / Redis)
  config.ts              — Централизованная конфигурация
  limits.ts              — Rate limiting
  metrics.ts             — Prometheus метрики
```

## Лицензия

MIT
