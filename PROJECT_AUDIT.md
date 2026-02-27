# Project Audit — domain-checker

Дата аудита: 2026-02-27

## Критические (Critical)

| # | Файл | Описание | Статус |
|---|------|----------|--------|
| 1 | `lib/antifilter.ts:17-21` | `ipv4ToInt` не валидирует октеты (>255 молча принимается), `0.0.0.0` возвращает `0` = "невалидный" | FIXED |
| 2 | `lib/redisAdapter.ts:24-52` | Race condition: параллельные `getRedisClient()` создают два соединения, одно утекает | FIXED |

## Высокие (High)

| # | Файл | Описание | Статус |
|---|------|----------|--------|
| 3 | `lib/net/fetchWithRetry.ts:55-70` | Response body не дренируется при retry на 429/5xx — утечка сокетов | FIXED |
| 4 | `lib/sources/hackertarget.ts:14` | `includes('error')` — false positives на поддоменах с "error" в имени | FIXED |
| 5 | `lib/subdomain.ts:1` | Deprecated Node.js built-in `punycode` (DEP0040) | FIXED |
| 6 | `lib/aggregator.ts:96-121` | `upsertSubdomain` при конкурентном вызове теряет данные | FIXED |
| 7 | `lib/cache.ts:25-26` | Generic `V` не передаётся в `CacheAdapter`, `private cache: any` | FIXED |

## Средние (Medium)

| # | Файл | Описание | Статус |
|---|------|----------|--------|
| 8 | API routes | `rateLimit()` существует но не вызывается ни в одном route | FIXED |
| 9 | `app/api/check/route.ts:379` | `createDefaultCache()` внутри handler — свежий кеш каждый запрос | FIXED |
| 10 | `lib/config.ts` | `Number(env)` без NaN-валидации — некорректный env → NaN → instant timeout | FIXED |
| 11 | `lib/reverse.ts:22-27` | Локальные константы конфликтуют с `CONFIG` (concurrency 20 vs 10) | FIXED |
| 12 | `lib/reverse.ts:71` | `fetch()` напрямую вместо `fetchWithRetry` | FIXED |
| 13 | `lib/sources/alienvault.ts:12` | IP-адрес (`r.address`) пушится как поддомен | FIXED |
| 14 | `lib/sources/bufferover.ts:19-22` | Обе части CSV (ip + hostname) пушатся | FIXED |
| 15 | `lib/sources/hackertarget.ts:15-17` | Нет фильтра по целевому домену | FIXED |
| 16 | `lib/dns.ts` + `lib/reverse.ts` | `withTimeout` дублирован | FIXED |
| 17 | `lib/net/worker.ts:31` | `.catch((e) => e)` не гарантирует `Error` instance | FIXED |
| 18 | `app/api/check/route.ts` | Невалидный JSON → 500 вместо 400 | FIXED |
| 19 | `lib/redisAdapter.ts`, route.ts | `console.warn` вместо `logger` | FIXED |

## Dead code (удалён)

| # | Файл | Что удалено |
|---|------|-------------|
| 20 | `lib/dns.ts` | `resolveAllIPs`, unused default import `dns` |
| 21 | `lib/reverse.ts` | `mapIPsToDomains`, default export object |
| 22 | `lib/redisAdapter.ts` | `redisSetJson`, `redisGetJson`, default export |
| 23 | `lib/passiveSources.ts` | 10 `getFromXxx` wrapper-функций, default export |
| 24 | `lib/cache.ts` | `RedisAdapterStub` |
| 25 | `lib/aggregator.ts` | Unused `Key` type alias |
| 26 | `lib/metrics.ts` | `observeReverseLatency`, `reverseLatency` histogram |

## Инфраструктура

| # | Файл | Описание | Статус |
|---|------|----------|--------|
| 27 | `package.json` | Repository URL = placeholder | FIXED |
| 28 | `docker-compose.yml` | Port без host mapping | FIXED |
| 29 | `README.md` | Полностью обновлён | FIXED |
| 30 | `CLAUDE.md` | Добавлены MCP серверы | FIXED |

## Низкие (Low) — оставлены как есть

- `lib/reverse.ts:164` — regex в `extractDomainsFromText` слишком permissive
- `lib/net/fetchWithRetry.ts` — host limiter eviction не учитывает active tasks
- `lib/score.ts` — score может уйти в 0, теряя дифференциацию
