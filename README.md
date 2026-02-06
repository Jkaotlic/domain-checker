# Domain Checker

Domain Checker — лёгкий сервис на Next.js для валидации доменов, нормализации и оценки поддоменов, а также для обратного анализа (reverse lookup) по IP и хостам. Проект ориентирован на корректность, покрытие тестами и компактное, компонуемое ядро с опциональным кэшем на Redis для общего состояния.

## Основные возможности
- Быстрая валидация и оценка доменов и поддоменов
- Reverse DNS lookup по спискам IP, извлечённым из произвольного текста
- LRU-кеш в памяти с опциональным адаптером для Redis
- TypeScript + Jest: тесты маленькие и удобные для аудита

## Быстрый старт

### Требования
- Node.js 18+ (LTS)
- npm
- Необязательно: Redis (при использовании общего кэша)

### Установка

```bash
npm ci
```

### Запуск в режиме разработки

```bash
npm run dev
```

### Сборка и запуск в продакшн

```bash
npm run build
npm start
```

### Тесты

```bash
npm test
```

## Конфигурация (переменные окружения)

- `REDIS_URL` — опционально. При заданной переменной приложение попытается подключиться к Redis (используется `ioredis`). При недоступности Redis выполняется fallback на встроенный LRU-кеш в памяти.
- `REDIS_PASSWORD` — пароль Redis (опционально).
- `SECURITYTRAILS_APIKEY` — API-ключ для SecurityTrails (используется в `lib/sources/securitytrails.ts`).
- `LOG_LEVEL` — уровень логирования (по умолчанию `info`).
- `NODE_ENV` — `development` или `production`.
- `PORT` — порт для сервера в продакшн.

Дополнительные настройки (таймауты / TTL / concurrency) настраиваются в `lib/config.ts` и могут быть переопределены через env:

- `HTTP_TIMEOUT_MS` (по умолчанию ~5000)
- `DNS_TIMEOUT_MS` (по умолчанию ~3000)
- `PTR_TTL_MS` (по умолчанию ~3600000)
- `A_RECORD_TTL_MS` (по умолчанию ~600000)
- `AGGREGATED_TTL_MS` (по умолчанию ~86400000)
- `CONCURRENCY_DEFAULT` (по умолчанию ~10)
- `CACHE_KEY_PREFIX` (по умолчанию `v1:`)

## API endpoints

Все эндпоинты доступны под `/api` при запуске приложения.

`POST /api/check`
- Тело (JSON): `{ "domain": "string" }`
- Возвращает оценку и анализ по домену.

Пример:

```bash
curl -sS -X POST http://localhost:3000/api/check \
  -H 'Content-Type: application/json' \
  -d '{"domain":"www.example.com"}'
```

`POST /api/reverse`
- Тело (JSON): `{ "text": "string", "maxIPs?: number" }`
  - `text` — произвольный текст, содержащий IP-адреса (новые строки и произвольные команды допускаются).
  - `maxIPs` — опционально: предел числа IP для обработки (по умолчанию ~100).
- Возвращает: результаты обратного DNS (reverse DNS) для каждого обнаруженного IP в `text`.

Пример запроса:

```bash
curl -sS -X POST http://localhost:3000/api/reverse \
  -H 'Content-Type: application/json' \
  -d '{"text":"93.184.216.34\n8.8.8.8","maxIPs":10}'
```

Пример ответа:

```json
[
  {"ip":"93.184.216.34","hostnames":["www.example.com"],"error":null},
  {"ip":"8.8.8.8","hostnames":["dns.google"],"error":null}
]
```

## Заметки для разработчиков

- Основная логика находится в `lib/` — смотрите `score.ts`, `subdomain.ts`, `reverse.ts`, `aggregator.ts`.
- Тесты расположены в `__tests__/` и запускаются через Jest (`npm test`).
- В проекте есть конфигурация ESLint; CI запускает линтер, если присутствует скрипт `lint`.

## Вклад в проект

1. Форкните репозиторий и создайте ветку темы.
2. Добавьте тесты для ваших изменений и держите изменения минимальными.
3. Откройте pull request с понятным описанием и ссылкой на связанные issue.

## Лицензия

Проект распространяется под лицензией MIT — см. `LICENSE`.

## Рекомендуемые теги GitHub

`domain-validation`, `nextjs`, `typescript`, `dns`, `redis`, `api`

## Краткое описание для `package.json`

"Небольшой сервис на Next.js для валидации доменов и обратного анализа поддоменов."

## Техническая документация

Подробная техническая документация для разработчиков доступна в файле: [docs/TECHNICAL_DOCUMENTATION.md](docs/TECHNICAL_DOCUMENTATION.md)
