# Kanban

Учебный pet-проект, демонстрирующий разработку backend‑системы из нескольких сервисов: микросервисная архитектура, межсервисное взаимодействие через события, единое API‑шлюзование, контейнеризация, инфраструктура на удалённом сервере и полноценный CI/CD.

Функционально это упрощённый аналог Trello / Jira: пользователи, рабочие пространства (workspaces), проекты, задачи (tasks) и realtime‑уведомления об их изменениях.

> Проект сделан как площадка для прокачки и демонстрации навыков работы с типичным «продакшн‑набором» backend‑технологий, а не как готовый SaaS.

---

## Содержание

- [Что демонстрирует проект](#что-демонстрирует-проект)
- [Архитектура](#архитектура)
- [Диаграмма архитектуры](#диаграмма-архитектуры)
- [Стек технологий](#стек-технологий)
- [Структура монорепозитория](#структура-монорепозитория)
- [Окружение и переменные](#окружение-и-переменные)
- [Локальный запуск](#локальный-запуск)
- [База данных и миграции](#база-данных-и-миграции)
- [CI/CD](#cicd)
- [Деплой на сервер](#деплой-на-сервер)
- [Дорожная карта](#дорожная-карта)

---

## Что демонстрирует проект

Pet‑проект сознательно построен так, чтобы покрыть максимум базовых backend‑тем:

- **Микросервисы** — разделение по доменным границам: аутентификация, домен задач, нотификации.
- **API Gateway** — единая точка входа, JWT‑валидация, маршрутизация, rate limiting.
- **Аутентификация** — JWT access + refresh, bcrypt, отзыв сессий.
- **Реляционная БД** — PostgreSQL + Prisma, по отдельной БД на сервис (database‑per‑service).
- **Событийное взаимодействие** — Redis Pub/Sub для асинхронной коммуникации между сервисами.
- **Realtime** — отдельный сервис уведомлений (Rust) поверх WebSocket.
- **Полиглот‑стек** — основная часть на TypeScript (Node.js), отдельный высоконагруженный сервис на Rust.
- **Контейнеризация** — Dockerfile на каждый сервис, docker‑compose для dev и prod.
- **Reverse proxy / TLS** — Nginx перед API Gateway.
- **Монорепозиторий** — pnpm workspaces + Turborepo, общие пакеты `@kanban/shared-types` и `@kanban/database`.
- **CI** — GitHub Actions: typecheck, build, тесты с поднятием Postgres и Redis в services.
- **CD** — деплой на удалённый сервер по SSH при merge в `main`.

---

## Архитектура

Система состоит из четырёх сервисов и двух общих пакетов кода.

### Сервисы

- **API Gateway** (`apps/api-gateway`, Node.js + TypeScript)
  - Единственная публично доступная точка входа.
  - Валидирует JWT access‑токены, добавляет user context в запросы.
  - Маршрутизирует REST‑запросы во внутренние сервисы.
  - Делает rate limiting и базовые CORS / security‑заголовки.
  - Для WebSocket‑соединений отдаёт клиента в `notification-service`.

- **Auth Service** (`apps/auth-service`, Node.js + TypeScript)
  - Регистрация (`/register`), вход (`/login`), refresh (`/refresh`), выход (`/logout`).
  - Хэширование паролей через bcrypt.
  - Выдача и валидация JWT (access + refresh) с разными секретами и временем жизни.
  - Своя БД `kanban_auth` (пользователи, refresh‑токены).

- **Task Service** (`apps/task-service`, Node.js + TypeScript)
  - CRUD по доменным сущностям: workspaces → projects → tasks.
  - Бизнес‑правила (роли в workspace, доступы к проектам и задачам).
  - При изменении задач **публикует события** в Redis (`task.created`, `task.updated`, `task.deleted`) — типы описаны в `@kanban/shared-types/events`.
  - Своя БД `kanban_tasks`.

- **Notification Service** (`apps/notification-service`, Rust)
  - Подписывается на события из Redis Pub/Sub.
  - Доставляет уведомления подключённым клиентам по WebSocket (fan‑out по `userId` / `workspaceId`).
  - Намеренно сделан на Rust, чтобы продемонстрировать polyglot‑микросервисы и работу с асинхронным runtime (tokio).

### Общие пакеты

- **`@kanban/shared-types`** (`packages/shared-types`)
  - Чистые TypeScript‑интерфейсы, без runtime‑зависимостей.
  - Сущности (`User`, `Task`, …) и контракты Redis‑событий (`TaskCreatedEvent`, `TaskUpdatedEvent`, `TaskDeletedEvent`).
  - Гарантирует, что producer (task‑service) и consumer (notification‑service / клиент) используют один и тот же контракт.

- **`@kanban/database`** (`packages/database`)
  - Единая Prisma‑схема (`prisma/schema.prisma`) и миграции.
  - Экспортирует общий инициализированный `PrismaClient` (с защитой от повторного создания в dev через `globalThis`).
  - Каждый сервис подключается к **своей** базе через свой `DATABASE_URL` (`AUTH_DATABASE_URL`, `TASKS_DATABASE_URL`, …), но схема ведётся в одном месте.

### Инфраструктура

- **Nginx** — reverse proxy перед API Gateway, терминация TLS, проксирование HTTP и WebSocket.
- **PostgreSQL 16** — основная БД (отдельные базы под каждый сервис).
- **Redis 7** — Pub/Sub для событий + потенциальный cache / rate‑limit storage.
- **Docker Compose** — два файла: `docker-compose.yml` для локалки и `docker-compose.prod.yml` для прод‑сервера.

### Поток типового сценария «создание задачи»

1. Клиент → `POST /api/tasks` через **Nginx → API Gateway**.
2. Gateway валидирует JWT, прокидывает запрос в **Task Service**.
3. Task Service пишет задачу в PostgreSQL (`kanban_tasks`) и публикует `task.created` в Redis.
4. **Notification Service** (Rust) ловит событие из Redis Pub/Sub и шлёт WebSocket‑сообщение всем подключённым участникам workspace.

---

## Диаграмма архитектуры

```mermaid
flowchart TB
    Client["Web / Mobile Client"]

    subgraph Edge["Edge (VPS)"]
        Nginx["Nginx<br/>TLS termination<br/>Reverse proxy"]
    end

    subgraph App["Application Layer (Docker network)"]
        Gateway["API Gateway<br/>(Node.js + TS)<br/>JWT, routing, rate limit"]
        Auth["Auth Service<br/>(Node.js + TS)<br/>register / login / refresh"]
        Tasks["Task Service<br/>(Node.js + TS)<br/>workspaces / projects / tasks"]
        Notif["Notification Service<br/>(Rust)<br/>WebSocket fan-out"]
    end

    subgraph Data["Data Layer"]
        PG[("PostgreSQL 16<br/>kanban_auth / kanban_tasks")]
        Redis[("Redis 7<br/>Pub/Sub + cache")]
    end

    Client -- "HTTPS / WSS" --> Nginx
    Nginx -- "HTTP" --> Gateway
    Nginx -. "WS upgrade" .-> Gateway

    Gateway -- "REST" --> Auth
    Gateway -- "REST" --> Tasks
    Gateway -. "WS proxy" .-> Notif

    Auth -- "Prisma" --> PG
    Tasks -- "Prisma" --> PG

    Tasks == "publish task.* events" ==> Redis
    Redis == "subscribe" ==> Notif
    Notif -- "WS push" --> Client
```

> Сплошные стрелки — синхронные HTTP/Prisma‑вызовы, пунктирные — WebSocket, двойные — асинхронные события через Redis Pub/Sub.

---

## Стек технологий

| Слой               | Технологии                                                                    |
| ------------------ | ----------------------------------------------------------------------------- |
| Языки              | TypeScript (Node.js 20), Rust (stable)                                        |
| Runtime / web      | Node.js, фреймворк для HTTP в `apps/*` (TS), `tokio` в `notification-service` |
| Хранилище          | PostgreSQL 16, Redis 7                                                        |
| ORM / схема        | Prisma 6 (`packages/database`)                                                |
| Аутентификация     | JWT (access + refresh), bcrypt                                                |
| Межсервисный обмен | REST (sync), Redis Pub/Sub (async events)                                     |
| Realtime           | WebSocket (Rust сервис)                                                       |
| Контейнеризация    | Docker, Docker Compose (dev + prod)                                           |
| Edge               | Nginx (reverse proxy + TLS)                                                   |
| Монорепозиторий    | pnpm workspaces, Turborepo                                                    |
| Качество кода      | TypeScript strict, ESLint, Prettier, Husky + lint‑staged                      |
| CI / CD            | GitHub Actions (тесты + деплой по SSH)                                        |

---

## Структура монорепозитория

```
kanban/
├── apps/                          # Запускаемые сервисы
│   ├── api-gateway/               # Node.js + TS, единая точка входа
│   ├── auth-service/              # Node.js + TS, аутентификация
│   ├── task-service/              # Node.js + TS, домен задач + публикация событий
│   └── notification-service/      # Rust, WebSocket + подписка на Redis
│
├── packages/                      # Общий код (не запускается сам по себе)
│   ├── shared-types/              # @kanban/shared-types — TS-интерфейсы и контракты событий
│   └── database/                  # @kanban/database — Prisma schema + PrismaClient
│
├── infrastructure/
│   ├── docker-compose.yml         # Локальная разработка (Postgres + Redis)
│   ├── docker-compose.prod.yml    # Прод (Postgres + Redis + сервисы)
│   ├── init-scripts/              # SQL для инициализации БД (создание kanban_auth/kanban_tasks)
│   └── nginx/                     # Конфиги Nginx (на сервере)
│
├── .github/
│   └── workflows/
│       └── ci.yml                 # CI: typecheck, build, тесты; deploy job по SSH в main
│
├── package.json                   # Root: скрипты turbo, dev-зависимости
├── pnpm-workspace.yaml            # apps/* + packages/*
├── turbo.json                     # Пайплайны build / dev / test / lint
└── tsconfig.base.json             # Общий strict TS-конфиг
```

---

## Окружение и переменные

Все переменные окружения описаны в `infrastructure/.env.example`. Минимальный набор:

```env
# PostgreSQL
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=
POSTGRES_HOST=
POSTGRES_PORT=5432

# Базы под каждый сервис
AUTH_DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/kanban_auth
TASKS_DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/kanban_tasks
NOTIFICATIONS_DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/kanban_notifications

# Redis
REDIS_PASSWORD=
REDIS_URL=redis://:PASSWORD@HOST:6379

# JWT (сгенерировать: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

Перед локальным запуском:

```bash
cp infrastructure/.env.example infrastructure/.env
# заполнить значения
```

---

## Локальный запуск

Требуется: **Node.js 20**, **pnpm 9**, **Docker**, (опционально) **Rust stable** для нотификаций.

```bash
# 1. Установка зависимостей всего workspace
pnpm install

# 2. Поднять инфраструктуру (Postgres + Redis)
docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env up -d

# 3. Сгенерировать Prisma client и применить миграции
pnpm db:generate
pnpm db:migrate

# 4. Запустить все TS-сервисы в dev-режиме (через turbo)
pnpm dev
```

Полезные скрипты из корневого `package.json`:

| Скрипт                              | Что делает                                                     |
| ----------------------------------- | -------------------------------------------------------------- |
| `pnpm dev`                          | `turbo dev` — параллельно поднимает все сервисы в watch‑режиме |
| `pnpm build`                        | `turbo build` — собирает все пакеты с учётом зависимостей      |
| `pnpm test`                         | `turbo test` — прогоняет тесты во всех пакетах                 |
| `pnpm lint`                         | `turbo lint`                                                   |
| `pnpm format` / `pnpm format:check` | Prettier по всему репо                                         |
| `pnpm db:generate`                  | `prisma generate` в `@kanban/database`                         |
| `pnpm db:migrate`                   | `prisma migrate dev`                                           |
| `pnpm db:studio`                    | Открыть Prisma Studio                                          |

---

## База данных и миграции

- Единая Prisma‑схема лежит в `packages/database/prisma/schema.prisma`.
- Каждый сервис подключается к **своей** базе (`kanban_auth`, `kanban_tasks`, …) — это эмулирует database‑per‑service, но схема ведётся централизованно для простоты учебного проекта.
- Миграции применяются командой `pnpm db:migrate` (dev) или `prisma migrate deploy` (prod / CI).
- Тестовые базы (`*_test`) создаются автоматически в CI отдельным шагом и используются для интеграционных тестов.

---

## CI/CD

Workflow: `.github/workflows/ci.yml`.

### CI (на каждый PR и push в `main`)

Job **TypeScript**:

- Поднимает `postgres:16-alpine` и `redis:7-alpine` как GitHub Actions services с healthcheck.
- Создаёт тестовые БД `kanban_auth_test` и `kanban_tasks_test`.
- Накатывает Prisma‑миграции (`prisma migrate deploy`).
- Запускает `pnpm -r typecheck`, `pnpm build`, `pnpm test`.

Job **Rust** (закомментирован, будет включён вместе с `notification-service`):

- `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`.

Concurrency настроен так, что при пуше нового коммита в ту же ветку предыдущий запуск отменяется.

### CD (только push в `main`)

Job **Deploy**:

- Зависит от успешного прохождения `typescript` job.
- Подключается к серверу по SSH (используются GitHub Secrets `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`).
- Делает `git pull origin main` и `docker compose -f infrastructure/docker-compose.prod.yml up -d --build`.
- Затем `docker compose ps` для проверки и `docker image prune -f` для очистки.

---

## Деплой на сервер

- На сервере уже настроен **Nginx** как reverse proxy: терминирует TLS и проксирует HTTP/WebSocket в API Gateway.
- Прод‑компоуз (`infrastructure/docker-compose.prod.yml`) поднимает Postgres и Redis **без проброса портов наружу** (`expose`, а не `ports`) — доступ только из docker‑сети.
- Сервисы приложений добавляются в `docker-compose.prod.yml` по мере готовности (сейчас закомментированы как заглушки).
- Сами секреты на сервере лежат в `~/kanban/infrastructure/.env` и в репозиторий не коммитятся.

---

## Дорожная карта

- [x] Скелет монорепозитория (pnpm workspaces + Turborepo)
- [x] Общие пакеты `@kanban/shared-types` и `@kanban/database`
- [x] Prisma schema + миграции
- [x] Docker Compose для dev и prod
- [x] CI на GitHub Actions (typecheck, build, тесты с Postgres + Redis)
- [x] CD по SSH в main
- [x] Nginx на проде
- [ ] Реализация `auth-service` (register / login / refresh / logout)
- [ ] Реализация `task-service` (workspaces / projects / tasks + публикация событий)
- [ ] Реализация `api-gateway` (JWT middleware, routing, rate limit)
- [ ] Реализация `notification-service` на Rust (Redis sub + WebSocket)
- [ ] Включение Rust job в CI
- [ ] Observability: structured logs + базовые метрики (Prometheus / OpenTelemetry)
- [ ] Интеграционные тесты сценария end‑to‑end (auth → create task → ws notification)

---

## Лицензия

ISC. Проект учебный, использовать как угодно.
