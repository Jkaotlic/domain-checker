**Введение — краткое резюме и рекомендации**

- **Состояние проекта:** Минималистичный Next.js (app router) проект для проверки доменов с API-роутами в `app/api/check` и `app/api/reverse`. В репозитории нет явной структуры `lib/`, тестов, CI workflow и шаблона окружения. Конфиги присутствуют (`postcss.config.mjs`, `next.config.ts`, `tsconfig.json`), но их можно усилить.
- **Краткие рекомендации (приоритет общий):**
  - High: Вынести бизнес-логику из роутов в `lib/`, добавить валидацию запросов, типизацию и тесты; настроить CI на lint/typecheck/test/build; добавить .env.example и dependabot.
  - Medium: Ввести кеширование/ограничение параллелизма для сетевых операций, централизовать логирование, добавить rate-limiting.
  - Low: Улучшить PostCSS/ESLint конфиги, добавить Playwright e2e.

---

## Архитектура и структура (Next.js app dir)

- **Проблемы / рекомендации**
  - Роуты содержат (или будут содержать) бизнес-логику — затрудняет тестирование. Вынесите логику в `lib/`.
  - Нет явного слоя сервисов/clients — добавить `lib/services/` и `lib/utils/`.
  - Нет кеширования результатов проверок — добавить LRU-кеш или Redis/Upstash (для продакшна).
  - Потенциально опасные параллельные запросы к внешним сервисам — добавить ограничитель параллелизма (p-limit) и таймауты.
  - Результаты проверок могут дублироваться — применить дедупликацию (Map с ключом запрос+параметры).
  - Нет схем валидации запросов — использовать `zod`.

- **Конкретный набор изменений (с приоритетом)**
  - High:
    - Вынести логику в `lib/check.ts` и `lib/reverse.ts`. Файлы: `app/api/check/route.ts`, `app/api/reverse/route.ts` -> заменить на thin handlers, импортирующие функции из `lib/`.
    - Добавить валидацию входящих данных с `zod`.
    - Добавить `lib/cache.ts` (LRU) или интеграция с Redis.
  - Medium:
    - Добавить `lib/limits.ts` с `p-limit` для ограничения одновременных DNS/HTTP запросов.
    - Логирование через `lib/logger.ts` (pino).
  - Low:
    - Разделить роуты на под-модули если понадобится (например, `app/api/check/health` и `app/api/check/validate`).

- **Файлы/пути, которые потребуется изменить**
  - `app/api/check/route.ts` — thin handler, импорт `lib/check`.
  - `app/api/reverse/route.ts` — thin handler, импорт `lib/reverse`.
  - Новый: `lib/check.ts`, `lib/reverse.ts`, `lib/cache.ts`, `lib/limits.ts`, `lib/logger.ts`, `types/index.ts`.

---

## Конфигурации (package.json, postcss, next, tsconfig, ESLint)

- **package.json**
  - Добавить скрипты:
    - `lint`: `next lint`
    - `typecheck`: `tsc --noEmit`
    - `test`: `jest`
    - `test:watch`: `jest --watch`
    - `build`: `next build`
    - `start`: `next start`
    - `format`: `prettier --write .`
    - `ci`: `npm run lint && npm run typecheck && npm run test && npm run build`
  - devDependencies рекомендованные (пример): `typescript`, `@types/node`, `eslint`, `eslint-config-next`, `prettier`, `jest`, `ts-jest`, `@testing-library/react`, `@testing-library/jest-dom`, `msw`, `playwright`, `zod`, `pino`, `p-limit`, `lru-cache`.
  - Пример команд установки:
    ```bash
    npm install -D typescript @types/node eslint eslint-config-next prettier jest ts-jest @types/jest @testing-library/react @testing-library/jest-dom msw playwright zod pino p-limit lru-cache
    ```

- **postcss.config.mjs**
  - Привести в безопасный минимализм, включить `autoprefixer` и `tailwindcss` если используется.

- **next.config.ts**
  - Добавить заголовки безопасности (CSP, X-Frame-Options и т.д.), конфигурацию images/domains, `reactStrictMode: true`.

- **tsconfig.json**
  - Убедиться, что `strict: true` включен, `noImplicitAny`, `forceConsistentCasingInFileNames`.
  - Добавить `typeRoots` при необходимости.

- **ESLint**
  - Настроить `extends: ["next/core-web-vitals", "eslint:recommended", "plugin:@typescript-eslint/recommended"]`.
  - Включить правила для безопасности/async-await, запрет `any`.

- **Приоритеты**
  - High: scripts, next.config.ts, tsconfig strict.
  - Medium: postcss, ESLint расширения.
  - Low: тонкая полировка Prettier.

---

## Качество кода: типизация, валидация, обработка ошибок, логирование, дедупликация

- **Типизация**
  - Включите `strict` TypeScript и используйте интерфейсы/типы в `types/index.ts`.
  - Экспортировать типы ответов API (`CheckResponse`, `ReverseResponse`).

- **Валидация входа**
  - Использовать `zod` для валидации query/body:
    ```ts
    import { z } from "zod";

    export const checkQuerySchema = z.object({
      q: z.string().min(1),
      timeout: z.number().int().positive().optional(),
    });
    type CheckQuery = z.infer<typeof checkQuerySchema>;
    ```
  - В роуте:
    ```ts
    const parsed = checkQuerySchema.safeParse(reqQuery);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors }, { status: 400 });
    ```

- **Обработка ошибок**
  - Централизовать обработку ошибок в `lib/errors.ts` и возвращать корректные HTTP статусы.
  - Для неожиданных ошибок возвращать 500 и логировать stack.

- **Логирование**
  - `lib/logger.ts` (pino) с env-aware конфигурацией.

- **Дедупликация результатов**
  - При параллельных одинаковых запросах, использовать `Map<string, Promise<Result>>` в `lib/cache.ts` чтобы вернуть один промис для дубликов.
  - LRU-кеширование для повторных запросов.

- **Пример фрагмента кода (lib/check.ts)**
  ```ts
  import LRU from "lru-cache";
  import pLimit from "p-limit";
  import { z } from "zod";
  import { logger } from "./logger";

  const cache = new LRU<string, any>({ max: 1000, ttl: 1000 * 60 * 5 });
  const limit = pLimit(5);

  export async function checkDomain(domain: string) {
    const key = `check:${domain}`;
    if (cache.has(key)) return cache.get(key);

    const promise = limit(async () => {
      try {
        // network ops with timeout...
        const result = { domain, ok: true };
        cache.set(key, result);
        return result;
      } catch (err) {
        logger.error({ err, domain }, "checkDomain error");
        throw err;
      }
    });

    cache.set(key, promise);
    return promise;
  }
  ```

---

## CI/CD — GitHub Actions workflow (High priority)

**Цель workflow:** lint, typecheck, test, build. Опционально — deploy на Vercel.

**Пример workflow `.github/workflows/ci.yml`** (файл приведён ниже в разделе патчей).

---

## Безопасность

- **Секьюрные заголовки** (High): добавить заголовки в `next.config.ts`.
- **.env.example** (High): перечислить необходимые переменные (`VERCEL_TOKEN`, `REDIS_URL`/`UPSTASH_REST_URL`, `LOG_LEVEL`, `NODE_ENV`).
- **Dependabot** (Medium): включить `.github/dependabot.yml`.
- **Rate limiting** (High for public API): реализовать rate-limiter per-IP (Redis/Upstash preferred).
- **Secrets:** не хранить в репозитории.

**Пример CSP заголовка (строгий, пример)**
```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://example-cdn.com;
img-src 'self' data: https:;
connect-src 'self' https://api.example.com;
frame-ancestors 'none';
```

---

## Тесты и локальный запуск

- **Рекомендованный стек**
  - Unit + API: `Jest` + `ts-jest`
  - HTTP mocking: `MSW` (node)
  - Integration/e2e: `Playwright` (опционально)

- **Команды**
  ```bash
  npm install -D jest ts-jest @types/jest msw @testing-library/react @testing-library/jest-dom
  npm run test
  npm run test:watch
  ```

- **Пример теста для `app/api/check/route.ts`**
  - Рекомендация: вынести логику проверки в `lib/check.ts` и тестировать функции напрямую. Пример теста в разделе патчей.

---

## Документация

- **README.md — обязательные секции:**
  - Getting Started: установка, env, запуск.
  - API: список endpoint'ов с примерами запросов/ответов.
  - Env vars: переменные и объяснения.
  - Examples: curl / JS snippets.
  - Development: lint, test, build commands.

- **CONTRIBUTING.md**
  - Branch strategy, code style, PR checklist, testing requirements.

- **.env.example**
  - Минимальный набор переменных (см. раздел патчей).

---

## Патчи / примеры файлов (включая полные файлы / фрагменты)

**Примечание:** ниже — фрагменты/полные содержимые файлов для копирования. Не применять автоматически — ручная проверка перед коммитом.

1) `postcss.config.mjs`
```diff
*** Begin Patch
*** Update File: postcss.config.mjs
@@
-export default {
-  plugins: {
-    tailwindcss: {},
-    autoprefixer: {},
-  },
-};
+export default {
+  plugins: {
+    // Оставьте tailwindcss если используете Tailwind; иначе удалите.
+    tailwindcss: {},
+    autoprefixer: {},
+  },
+};
*** End Patch
```

2) `package.json` — скрипты
```diff
*** Begin Patch
*** Update File: package.json
@@
   "scripts": {
-    "dev": "next dev",
-    "build": "next build",
-    "start": "next start"
+    "dev": "next dev",
+    "build": "next build",
+    "start": "next start",
+    "lint": "next lint",
+    "typecheck": "tsc --noEmit",
+    "test": "jest --runInBand",
+    "test:watch": "jest --watch",
+    "format": "prettier --write .",
+    "ci": "npm run lint && npm run typecheck && npm run test && npm run build"
   },
*** End Patch
```

3) `.github/workflows/ci.yml` (полный)
```yaml
*** Begin Patch
*** Add File: .github/workflows/ci.yml
+name: CI
+
+on:
+  push:
+    branches: [ main, master ]
+  pull_request:
+    branches: [ main, master ]
+
+jobs:
+  test:
+    runs-on: ubuntu-latest
+    steps:
+      - uses: actions/checkout@v4
+      - name: Use Node.js
+        uses: actions/setup-node@v4
+        with:
+          node-version: 18
+          cache: "npm"
+      - name: Install dependencies
+        run: npm ci
+      - name: Lint
+        run: npm run lint
+      - name: Typecheck
+        run: npm run typecheck
+      - name: Run tests
+        env:
+          NODE_ENV: test
+        run: npm run test
+      - name: Build
+        if: success()
+        run: npm run build
+
+  # Optional deploy step: uncomment and configure VERCEL_TOKEN & VERCEL_ORG_ID & VERCEL_PROJECT_ID secrets
+  deploy:
+    runs-on: ubuntu-latest
+    needs: test
+    if: github.ref == 'refs/heads/main'
+    steps:
+      - uses: actions/checkout@v4
+      - name: Install Vercel CLI
+        run: npm i -g vercel
+      - name: Vercel deploy
+        env:
+          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
+        run: vercel --prod --token $VERCEL_TOKEN
+
*** End Patch
```

4) `next.config.ts` (безопасность и оптимизации)
```diff
*** Begin Patch
*** Update File: next.config.ts
@@
-import { NextConfig } from "next";
-
-const nextConfig: NextConfig = {
-  reactStrictMode: true,
-};
-
-export default nextConfig;
+import { NextConfig } from "next";
+
+const nextConfig: NextConfig = {
+  reactStrictMode: true,
+  poweredByHeader: false,
+  experimental: {
+    appDir: true,
+  },
+  images: {
+    // Указать домены, откуда подгружаются изображения
+    domains: ["assets.example.com"],
+  },
+  async headers() {
+    return [
+      {
+        source: "/(.*)",
+        headers: [
+          { key: "X-Frame-Options", value: "DENY" },
+          { key: "X-Content-Type-Options", value: "nosniff" },
+          { key: "Referrer-Policy", value: "no-referrer-when-downgrade" },
+          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
+          {
+            key: "Content-Security-Policy",
+            value: "default-src 'self'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none';",
+          },
+        ],
+      },
+    ];
+  },
+};
+
+export default nextConfig;
*** End Patch
```

5) Пример теста: `__tests__/api-check.test.ts`
```diff
*** Begin Patch
*** Add File: __tests__/api-check.test.ts
+import { checkDomain } from "../lib/check";
+
+describe("checkDomain", () => {
+  it("returns result object for valid domain", async () => {
+    const res = await checkDomain("example.com");
+    expect(res).toHaveProperty("domain", "example.com");
+    expect(typeof res.ok).toBe("boolean");
+  });
+
+  it("caches subsequent calls", async () => {
+    const a = await checkDomain("example.com");
+    const b = await checkDomain("example.com");
+    expect(a).toBe(b); // если реализован LRU кеш с возвратом того же объекта/промиса
+  });
+});
+
*** End Patch
```

---

## Пример `.env.example`
```
# .env.example
NODE_ENV=development
PORT=3000

# Логи
LOG_LEVEL=info

# Redis / Upstash (для кеша и rate-limiting) - optional
REDIS_URL=
REDIS_PASSWORD=

# Vercel (если вы деплоите через Vercel API)
VERCEL_TOKEN=
VERCEL_ORG_ID=
VERCEL_PROJECT_ID=
```

---

## Тестовые и вспомогательные команды (копировать/вставить)

- Установка зависимостей (пример):
```bash
npm install
npm install -D typescript @types/node eslint eslint-config-next prettier jest ts-jest @types/jest @testing-library/react @testing-library/jest-dom msw playwright zod pino p-limit lru-cache
```

- Запуск в разработке:
```bash
npm run dev
```

- Локальные проверки:
```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

---

## Риски и примечания

- Риск: внедрение кеша и rate-limiter требует выбора устойчивой store (Redis/Upstash) для продакшна — in-memory limiter не масштабируется.
- Риск: CSP может поломать third-party скрипты; тестируйте и корректируйте `Content-Security-Policy`.
- Риск: автоматический deploy через Vercel CLI с VERCEL_TOKEN требует аккуратно настроенных secret'ов.
- Риск: изменение `next.config.ts` — проверить соответствие вашей инфраструктуре (image domains и т.д.).

---

## Пошаговый план внедрения (Task list) — с оценкой времени, критериями приёма и местом для Approve/Reject

1) Подготовка: настройка окружения разработчика
   - Время: 0.5–1 ч
   - Действия: обновить `package.json` скрипты, установить devDependencies (typescript, jest, zod).
   - Критерии приёма: `npm ci` проходит; `npm run lint`/`npm run typecheck` работают (или дают ожидаемые ошибки).
   - Изменения: обновление `package.json` (скрипты), установка зависимостей.
   - Approve / Reject: _______

2) Рефакторинг роутов -> вынести логику в `lib/`
   - Время: 2–4 ч
   - Действия: создать `lib/check.ts`, `lib/reverse.ts`, переписать обработчики в `app/api/check/route.ts` и `app/api/reverse/route.ts` как thin handlers.
   - Критерии приёма: unit-тесты для `lib/check.ts` проходят; API hander возвращает ожидаемые статусы.
   - Изменения: новые файлы `lib/*`, обновление роутов.
   - Approve / Reject: _______

3) Добавить валидацию запросов (zod)
   - Время: 1–2 ч
   - Действия: добавить схемы `schemas/check.ts`, использовать `safeParse`.
   - Критерии приёма: на некорректный запрос возвращается 400 с читаемой ошибкой.
   - Изменения: новые схемы, обработка ошибок в роуте.
   - Approve / Reject: _______

4) Кеширование и дедупликация
   - Время: 2–3 ч
   - Действия: добавить LRU (или Redis) кеш, Map для держания текущих промисов.
   - Критерии приёма: многократные запросы к одному домену отдаются из кеша; нагрузочные тесты показывают снижение сетевых вызовов.
   - Изменения: `lib/cache.ts`, изменение `lib/check.ts`.
   - Approve / Reject: _______

5) Ограничение параллелизма и таймауты
   - Время: 1–2 ч
   - Действия: использовать `p-limit` и добавить таймауты для сетевых вызовов.
   - Критерии приёма: при массовых запросах приложение не инициирует >N одновременных внешних запросов.
   - Изменения: `lib/limits.ts`, использование в `lib/check.ts`.
   - Approve / Reject: _______

6) Логирование
   - Время: 1 ч
   - Действия: добавить `lib/logger.ts` (pino), интегрировать в ключевые места.
   - Критерии приёма: логи работают локально, уровень configurable через LOG_LEVEL.
   - Изменения: `lib/logger.ts`, импорт в модули.
   - Approve / Reject: _______

7) Настройка CI (GitHub Actions)
   - Время: 1–2 ч
   - Действия: добавить `.github/workflows/ci.yml` (см. пример), настроить secrets при необходимости.
   - Критерии приёма: workflow запускается на PR, все шаги выполняются.
   - Изменения: новая workflow yml.
   - Approve / Reject: _______

8) Тесты + MSW + Playwright
   - Время: 2–4 ч
   - Действия: добавить тесты unit/integration, настроить MSW для моков, добавить базовый Playwright тест.
   - Критерии приёма: `npm run test` проходит; Playwright smoke test выполняется (опционально).
   - Изменения: `__tests__/*`, `tests/e2e/*`.
   - Approve / Reject: _______

9) Документация и CONTRIBUTING
   - Время: 1–2 ч
   - Действия: заполнить README (Getting started, API), добавить .env.example и CONTRIBUTING.md.
   - Критерии приёма: новый README содержит инструкции запуска и переменные окружения; CI не завален из-за отсутствия env.
   - Изменения: README.md, CONTRIBUTING.md, .env.example.
   - Approve / Reject: _______

10) Безопасность / Dependabot / Rate-limiting
    - Время: 2–4 ч
    - Действия: добавить dependabot config, реализовать rate-limiter на Redis, проверить CSP.
    - Критерии приёма: Dependabot открыт; rate-limiter ограничивает запросы; CSP валиден и не ломает сайт.
    - Изменения: .github/dependabot.yml, rate-limiter implementation.
    - Approve / Reject: _______

---

## Заключение — что сделать сейчас (рекомендуемая последовательность)

1. Добавить/обновить `package.json` скрипты и установить devDependencies (шаг 1).
2. Вынести логику из роутов в `lib/` и добавить валидацию (шаги 2–3).
3. Написать базовые unit-тесты и настроить GitHub Actions (шаги 7–8).
4. Добавить кеш и ограничение параллелизма (шаги 4–5).
5. Документация и безопасность (шаги 9–10).

Если хотите, могу: 1) сгенерировать конкретные файлы `lib/check.ts`, `lib/cache.ts`, `lib/logger.ts` и обновлённые роутеры; 2) подготовить полный `.github/dependabot.yml`; 3) сгенерировать README и CONTRIBUTING.md — скажите, какие из шагов начать первыми.