# Полный анализ и рекомендации по выявлению поддоменов

Этот файл объединяет существующие MD-анализы в репозитории и содержит единый, полный инженерный отчёт по улучшению механики обнаружения поддоменов в проекте `domain-checker`.

Файлы-источники, объединённые сюда:
- `SUBDOMAIN_ANALYSIS_AND_RECOMMENDATIONS.md`
- `SUBDOMAIN_REVERSE_IMPROVEMENT_PLAN.md`
- `REVIEW_AND_IMPLEMENTATION_PLAN.md`
- `SUBDOMAIN_IMPROVEMENTS.md` (пустой — оставлен для истории)

---

## Содержание
- 1. Краткое резюме текущего состояния проекта
- 2. Подробный анализ слабых мест и пробелов
- 3. Конкретные рекомендации и приоритеты
- 4. Примеры кода и патчи (TypeScript / псевдокод)
- 5. Тесты, CI и наблюдаемость
- 6. План поэтапной реализации (микро-итерации)
- 7. План улучшения reverse/PTR pipeline
- 8. Рефакторинг структуры Next.js и общие рекомендации по качеству кода
- 9. Следующие шаги и варианты реализации

---

(Ниже — скомбинированный текст из исходных документов; секции аккуратно слиты, дублирующиеся рекомендации согласованы.)

## 1. Краткое резюме текущего состояния проекта

## Прогресс (обновление)

- 2026-02-05: Создан объединённый файл `SUBDOMAIN_FULL_ANALYSIS.md` (консолидация нескольких отдельных отчётов).
- 2026-02-05 — ВЫПОЛНЕНО: добавлены и интегрированы базовые улучшения кеширования и конфигурации:
	- `lib/config.ts` — централизованная конфигурация (timeouts, TTLs, prefix).
	- `lib/cache/redisAdapter.ts` — Redis-backed `CacheAdapter` реализован (использует `getRedisClient()` из `lib/redisAdapter.ts`).
	- `lib/cache.ts` — фабрика `createDefaultCache()` теперь использует `RedisCacheAdapter` когда `REDIS_URL` задан.
	- `__tests__/cache.test.ts` — добавлены базовые unit-тесты для адаптеров кеша.
	- `lib/net/fetchWithRetry.ts` — добавлен универсальный `fetchWithRetry` с retry/backoff и per-host concurrency.
	- `lib/net/worker.ts` — добавлен `runTasksWithRetry` для параллельных задач с retry/backoff.
	- Старые индивидуальные MD-файлы объединены; старые файлы помечены/заменены ссылками на `SUBDOMAIN_FULL_ANALYSIS.md`.

Статус: эти изменения закоммичены в рабочем каталоге; итерация 2 (rate-limiter + retry) реализована базовым уровнем: `fetchWithRetry` и `runTasksWithRetry` добавлены. Следующие шаги — интегрировать `fetchWithRetry` в `lib/passiveSources.ts` и `app/api/*` роуты, покрыть тестами и подготовить PR.
Дополнительно (текущий прогресс):

- Добавлены unit/integration-style тесты для API роутов:
	- `__tests__/api-check-route.test.ts`
	- `__tests__/api-reverse-route.test.ts`

Статус: тесты добавлены; рекомендуется запуск `npm run test` в CI (локально требуется установить devDependencies).


Ключевые файлы и подсистемы, относящиеся к обнаружению поддоменов:
- `lib/subdomain.ts` — нормализация/валидация доменов (`normalizeDomain`, `isValidDomain`).
- `lib/passiveSources.ts` — реализованы/заготовлены пассивные источники: `crtsh`, `urlscan`, `hackertarget`, `alienvault`.
- `lib/reverse.ts` — reverse DNS: PTR, fallback на `crt.sh`, пакетный резолв с `p-limit`, кэширование через `lib/cache.ts`.
- `lib/aggregator.ts` — объединение, дедупликация и upsert в кэш.
- `lib/redisAdapter.ts` и `lib/cache.ts` — адаптеры/интерфейсы кэша (в текущем состоянии `Redis` — stub, используется InMemoryLRU для dev).
- `lib/score.ts` — механизм оценки доверия (confidence score) на основе источников и доказательств.
- `app/api/check/route.ts` и `app/api/reverse/route.ts` — thin API-роуты, использующие вышеуказанные модули.

Реализованные подходы:
- Пассивные источники (crt.sh, URLScan и др. частично).
- Активная проверка через простые DNS резолвы популярных поддоменов.
- Reverse lookup через PTR + crt.sh fallback.

ПРЕДПОЛОЖЕНИЕ: структура типов `SubdomainRecord`/`SourceRecord` находится в `lib/types.ts`.

---

## 2. Подробный анализ слабых мест и пробелов

Ключевые проблемы, найденные в кодовой базе, сгруппированы по тематике:

- Охват пассивных источников ограничен и неунифицирован: требуется слой адаптеров (`lib/sources/*`) для согласованной работы с API, retry и rate-limits.
- Кэширование (Redis) не полноценно интегрировано — stub и отсутствие versioned keys, централизованного TTL.
- Нет централизованной стратегии обработки rate limits / retry / circuit-breaker для внешних API.
- Параллелизм непоследовательный: где-то `p-limit`, где-то `Promise.all` без ограничений.
- Wildcard и CDN/anycast дают много ложных срабатываний — нужно усилить детекцию.
- Отсутствует TLS/SNI и HTTP Host header проверка для подтверждения реальной работы сервиса на хосте.
- Мало метрик и трассировок; плохо видно, какие источники работают эффективно.
- Нет консистентной политики секретов/API keys и проверки их наличия при старте.

Каждая из проблем подробно описана в исходных файлах (см. объединённые секции ниже).

---

## 3. Конкретные рекомендации и приоритеты

(Сводный список, приоритеты High/Medium/Low приведены по важности внедрения.)

High:
- Ввести адаптерную архитектуру для пассивных источников (`lib/sources/*`).
- Полноценный Redis-backed `CacheAdapter` с версионированными ключами и централизованными TTL (в `lib/cache.ts`).
- Централизованный rate-limiter + retry/backoff для каждого источника (рекомендация: `Bottleneck` или `p-limit` + кастомный retry). 
- Централизовать конфигурацию (`lib/config.ts`) для timeouts, TTLs и concurrency.

Medium:
- Улучшить wildcard detection: 3+ случайных поддоменов, сравнение через множество резолверов, проверка CNAME/authoritative NS.
- Добавить TLS/SNI и HTTP host-header проверки (`lib/verify.ts`).
- Смарт-дедупликация и source trust weights (в `lib/score.ts`).

Low:
- Подключение OSINT / CommonCrawl, optional background queues (BullMQ) для масштабирования, UI-улучшения.

---

## 4. Примеры кода и патчи (выдержки)

(Включены адаптеры SecurityTrails, Redis cache adapter, retry worker, wildcard detection, TLS/HTTP check — см. файлы `SUBDOMAIN_ANALYSIS_AND_RECOMMENDATIONS.md` для полных фрагментов.)

---

## 5. Тесты, CI и наблюдаемость

Рекомендации по тестам:
- Unit: `normalizeDomain`, `reverse.lookup`, `aggregator`.
- Integration: мокировать внешние HTTP API (использовать `nock`/`msw`).
- E2E: опциональный Playwright.

CI:
- Workflow: lint -> typecheck -> test -> build (пример `.github/workflows/ci.yml` во `REVIEW_AND_IMPLEMENTATION_PLAN.md`).

Observability:
- Метрики: `external_api_requests_total{provider}`, `cache_hits_total`, `reverse_lookup_latency_seconds`, `source_rate_limit_events_total`.
- Trace-id propagation, basic OpenTelemetry integration опционально.

---

## 6. План поэтапной реализации (микро-итерации)

Кратко:
- И0: `lib/config.ts` (Low)
- I1: RedisCacheAdapter, versioned keys (Medium)
- I2: Rate-limiter + retry (Medium)
- I3: Рефакторинг источников → `lib/sources/*` (Medium-High)
- I4: TLS/SNI + HTTP host verification (Medium)
- I5: Wildcard detection hardening (Medium)
- I6: Metrics + tracing (Medium)
- I7: Tests + CI (Low-Medium)
- I8: Background workers (High если надо масштабировать)

Детальные оценки и шаги есть в исходных файлах.

---

## 7. План улучшения reverse/PTR pipeline (выдержка)

- PTR lookup -> normalize -> validate -> confirm via A/AAAA lookup -> fallback на crt.sh/Censys -> aggregate.
- Batch processing + caching (PTR 1h TTL, A/AAAA 10m).
- Use Redis locks (SETNX) to dedupe concurrent processing across instances.

---

## 8. Рефакторинг структуры Next.js и общие рекомендации по качеству кода

- Вынести бизнес-логику в `lib/` (см. `REVIEW_AND_IMPLEMENTATION_PLAN.md`).
- Добавить `zod` validation, TypeScript `strict: true`, structured logging (`pino`).
- Добавить LRU + Redis, p-limit, centralized error handling.

---

## 9. Следующие шаги и варианты реализации

Выберите один из вариантов:
- A) Реализовать итерацию 1 (RedisCacheAdapter) — я внесу патч и добавлю unit-тесты.
- B) Внедрить rate-limiter + retry (итерация 2).
- C) Рефакторинг источников в `lib/sources` (итерация 3).
- D) Сгенерировать CI + тесты первым (итерация 7).

---

Файл собран автоматически из: `SUBDOMAIN_ANALYSIS_AND_RECOMMENDATIONS.md`, `SUBDOMAIN_REVERSE_IMPROVEMENT_PLAN.md`, `REVIEW_AND_IMPLEMENTATION_PLAN.md` и пустого `SUBDOMAIN_IMPROVEMENTS.md`.

Если нужно — могу: 1) создать PR с выбранной итерацией; 2) применить патчи сразу; 3) добавить unit-тесты к новым модулям. Напишите, какую итерацию реализовать первой.