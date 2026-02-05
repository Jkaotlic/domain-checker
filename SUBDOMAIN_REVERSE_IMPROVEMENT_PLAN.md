# План улучшения логики извлечения поддоменов и обратной конвертации (reverse DNS / PTR)

Документ содержит подробный, приоритетный план улучшений для подсистемы агрегации поддоменов и обратной конвертации IP/хостов в домены в проекте domain-checker.

---

## 1. Цели

- Уменьшение дубликатов и шумов (High): объединять одинаковые записи, удалять тривиальные вариации (.example vs example).
- Снижение ложноположительных (High): scoring, PTR/WHOIS/CRT cross-checks.
- Устранение неполных данных (Medium): агрегировать источники, дополнять IP/TTL/metadata.
- Производительность и масштабируемость (High): LRU + Redis, batching, rate limits.
- Надёжность и откат (Medium): мониторинг, схемы TTL/eviction, rollback-план.

---

## 2. Архитектура и компоненты (High/Medium/Low)

- Основные компоненты:
  - `ingest` — парсер/нормализатор входящих поддоменов/hosts.
  - `aggregator` — merge & dedupe логика с scoring.
  - `reverse` — pipeline для конвертации IP/hosts -> домены (PTR+fallbacks).
  - `cache` — in-memory LRU (dev), Redis/Upstash (prod).
  - `store` — optional persistent DB (Postgres/SQLite).
  - `limits` — rate limiting и per-source quotas.
  - `metrics` — экспорт метрик для мониторинга.

- Data model (типичная запись `SubdomainEntry`):

```ts
interface SubdomainEntry {
  subdomain: string;        // 'api.eu.example.com'
  domain: string;           // 'example.com' (public suffix stripped)
  ips: string[];            // уникальный список IPs
  sources: Array<{
    name: string;           // 'crtsh', 'zoomeye', 'active-scan'
    score?: number;         // source-level confidence
    seenAt: string;         // ISO timestamp
    raw?: unknown;          // optional raw payload
  }>;
  firstSeen: string;        // ISO timestamp
  lastSeen: string;         // ISO timestamp
  score: number;            // агрегированный скор доверия
  tags?: string[];          // e.g., ['wildcard', 'cdn', 'suspicious']
  meta?: Record<string, unknown>;
}
```

- Дедуп (promise dedupe): per-key promise map + Redis-based lock (SETNX + TTL) для распределённых инстансов. (Priority: High)

---

## 3. Нормализация и правила агрегации (High/Medium)

**Нормализация входа:**
- Trim, toLowerCase(), remove leading/trailing dots.
- Convert to ASCII punycode/IDN via `punycode.toASCII()` — хранить и оригинал и ASCII.
- Strip wildcard prefixes: `*.example.com` → mark `tags.push('wildcard')` and remove `*.`.
- Collapse repeated dots, remove accidental trailing dots.
- Handle underscores: сохранять оригинал в `meta`, пометить тегом `underscore` (suspicious).

**Дедупликация:**
- canonical = punycode.toASCII(normalized).
- key = `${domain}:${canonical}` — используем для хранения/merge.

**Merge rules:**
- `ips = union(existing.ips, incoming.ips)`.
- `sources` — объединение с предпочением большего `source.score` и последней `seenAt`.
- `firstSeen = min(existing.firstSeen, incoming.firstSeen)`; `lastSeen = max(...)`.
- `tags = union(...)`.
- При конфликтах: предпочитать авторитетный источник (configurable source weights).

**Authoritative source weighting (пример):**
- zone transfer / authoritative DNS fetch: 100
- direct authoritative queries: 70
- active scan/probe: 60
- crt.sh / certificate sources: 50
- passive scrapes: 30
- forum/manual/low quality: 10

---

## 4. Scoring & Ranking (High)

Факторы для скоринга:
- SourceWeight (max/aggregate)
- Frequency (количество уникальных источников)
- DNSConsistency (A/AAAA согласованы)
- PTRMatch (PTR hostname совпадает с доменом)
- Age/Staleness (последнее обнаружение)
- Suspicious tags (wildcard, underscore) снижают скор

Пример формулы (линейная комбинация):

```
score = (w_s*S + w_f*log(1+F) + w_d*D + w_p*P - w_t*T) / (w_s+w_f+w_d+w_p+w_t)
```

Где веса (пример): w_s=40, w_f=15, w_d=25, w_p=15, w_t=5.

Пороги:
- score >= 0.7 — high-confidence (показывать по умолчанию)
- 0.4 <= score < 0.7 — medium
- score < 0.4 — noisy/скрыть или пометить (Priority: High)

---

## 5. Reverse conversion (IP/hosts -> domains) (High)

**Входы:**
- IP (single), CSV колонка, текстовый лог, сертификат SAN.

**Шаги:**
1. PTR lookup: `dns.promises.reverse(ip)` с таймаутом (3s).
2. Нормализация PTR hostnames (punycode + psl base domain).
3. Валидация: isFQDN, длины, символы.
4. Подтверждение: опционально A/AAAA lookup на hostname и сравнение с IP.
5. Fallbacks: `crt.sh`, passive DNS (Censys/Shodan) при отсутствии PTR или неуверенности.
6. Heuristics: extract domain from host patterns like `ip-1-2-3-4.example.com`.

**Группировка:**
- После получения hostnames — группировать по базовому домену (psl.get) и агрегировать как SubdomainEntry.

---

## 6. Производительность и надежность (High)

- Пределы параллелизма: `p-limit` (e.g., 50 concurrent DNS/HTTP), configurable.
- Timeouts: DNS 2–3s, HTTP 5s.
- Retries: exponential backoff, max 2 retries.
- Circuit breaker: отключать источник на время при частых 5xx.
- Кеш: LRU short-term (60s), Redis medium-term (PTR 1h, A/AAAA 10m, aggregated 24h).
- Batch processing: группировать reverse lookups/requests для оптимизации.

---

## 7. Rate-limiting & abuse (High)

- Per-IP and per-user quotas (e.g., 500 req/min).
- Implementation: Redis sliding window or token bucket for multi-instance; in-process for single instance (low-latency).
- Circuit-breaker per external service to avoid being заблокированными (Priority: High).

---

## 8. Retention & Storage (Medium)

- Raw events: 30 days.
- Aggregated entries TTL default 24h (refresh on new evidence).
- Store schema (Redis hash or Postgres table). Example Redis key: `subdomain:{domain}:{canonical}` storing JSON.

---

## 9. Tests & Validation (High)

- Unit tests: `normalizeDomain`, `mergeSubdomainEntries`, `computeScore`.
- Integration tests: mock DNS responses, PTR timeouts, crt.sh fallbacks.
- E2E: ingest sample dataset -> validate counts/score distribution.

---

## 10. Примеры кода (TypeScript)

См. файл `lib/subdomain.ts` (normalizeDomain), `lib/aggregator.ts` (mergeSubdomainEntries), `lib/score.ts` (computeScore), `lib/reverse.ts` (reverseLookup) — краткие фрагменты включены.

(Фрагменты опущены здесь для краткости; при необходимости могу вставить полные файлы.)

---

## 11. Предлагаемые файлы и примерные патчи (создать вручную)

- `lib/types.ts` — интерфейсы. (High)
- `lib/subdomain.ts` — normalizeDomain. (High)
- `lib/aggregator.ts` — merge & dedupe. (High)
- `lib/score.ts` — scoring. (High)
- `lib/reverse.ts` — PTR + fallbacks. (High)
- `lib/cache.ts` — LRU wrapper + Redis adapter. (High)
- `lib/limits.ts` — rate-limit helpers. (Medium)
- `__tests__/subdomain.test.ts` — Jest tests. (High)

---

## 12. Acceptance criteria & rollout (инкрементально)

**Phase 1 (2–4 ч)** — Add normalize & unit tests. Smoke run.
**Phase 2 (6–10 ч)** — Aggregator + LRU + dedupe. Concurrent ingest test.
**Phase 3 (3–5 ч)** — Scoring & thresholds. Validate ordering.
**Phase 4 (6–10 ч)** — Reverse pipeline + fallbacks. Integration tests.
**Phase 5 (4–6 ч)** — Rate-limits, backoff, circuit-breaker.
**Phase 6 (6–10 ч)** — Persistence, metrics, CI.

Примерные суммарные оценки: ~37–53 часов.

---

## Заключение

Рекомендую начать с Phase 1 и 2: реализовать нормализацию и агрегатор с LRU, покрыть unit-тестами и только затем подключать Redis и reverse fallbacks. Это даст быстрый выигрыш в качестве выдачи поддоменов и минимальные изменения в продакшне.

Если хотите, могу сейчас сгенерировать файлы `lib/*.ts` и `__tests__/*.ts` в репозитории как apply_patch. Что делаем дальше: 1) сгенерировать начальную имплементацию (lib + tests), или 2) сначала настроить Redis/инфраструктуру и rate-limits?