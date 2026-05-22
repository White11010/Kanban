# syntax=docker/dockerfile:1.7
# ──────────────────────────────────────────────────────────────────────────
# Builder: устанавливает зависимости, генерирует Prisma Client, билдит TS
# ──────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /repo

RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/auth-service/package.json ./apps/auth-service/

RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/auth-service ./apps/auth-service

RUN pnpm --filter @kanban/database prisma:generate \
 && pnpm --filter @kanban/database build \
 && pnpm --filter @kanban/auth-service build

# ──────────────────────────────────────────────────────────────────────────
# Runner: минимальный рантайм-образ
# Прим.: на этом этапе копируем весь builder-tree из-за pnpm-симлинков —
# в фазе 2.7 можно ужать через `pnpm deploy` (см. README).
# ──────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl tini

ENV NODE_ENV=production

COPY --from=builder /repo /app

EXPOSE 3001

# tini корректно прокидывает SIGTERM от docker compose stop в node
ENTRYPOINT ["/sbin/tini", "--"]
# На старте: применяем миграции на kanban_auth, затем запускаем сервис
CMD ["sh", "-c", "cd /app/packages/database && ./node_modules/.bin/prisma migrate deploy && cd /app/apps/auth-service && node dist/index.js"]
