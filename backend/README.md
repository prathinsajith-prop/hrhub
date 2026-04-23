# HRHub Backend

Fastify 5 + Drizzle ORM + PostgreSQL 17 + Redis (BullMQ) + S3/MinIO.

## Requirements

- Node.js 20+
- pnpm 10.30+
- PostgreSQL 17 (or `docker compose up -d postgres`)
- Redis 7 (optional, enables BullMQ workers)
- MinIO / S3 (optional, enables file uploads)

## Setup

```bash
cp .env.example .env
# Fill JWT_SECRET (≥ 32 chars), REFRESH_TOKEN_SECRET (≥ 32 chars), DATABASE_URL
pnpm install
pnpm db:migrate
pnpm db:seed       # seeds an admin tenant + admin@hrhub.ae / Admin@12345
pnpm dev           # http://localhost:4000/docs for Swagger
```

## Scripts

| Script                 | Purpose                                  |
|------------------------|------------------------------------------|
| `pnpm dev`             | Hot-reload dev server (tsx watch)        |
| `pnpm build`           | TypeScript → `dist/`                     |
| `pnpm start`           | Run compiled server (production)         |
| `pnpm test`            | Vitest unit tests                        |
| `pnpm test:coverage`   | Coverage report (v8 provider)            |
| `pnpm db:generate`     | Generate migration from schema diff      |
| `pnpm db:migrate`      | Apply pending migrations                 |
| `pnpm db:studio`       | Drizzle Studio                           |
| `pnpm db:seed`         | Seed demo data                           |

## Project layout

```
src/
  config/env.ts          Zod-validated environment
  db/                    Drizzle schema, migration runner, seed
  lib/                   Shared helpers (errors, pdf, redis, validation)
  modules/<domain>/      Each feature: routes, service, schema
  plugins/               authenticate (RBAC), email, s3
  workers/               BullMQ background jobs (expiry, payroll)
  index.ts               Bootstrap: plugins → error handler → routes
migrations/              Versioned SQL migrations
```

## API

- Versioned at `/api/v1/*`
- Swagger UI at `/docs` (non-production only)
- Auth: `Authorization: Bearer <jwt>` (15-min access token)
- Refresh flow: `POST /api/v1/auth/refresh` (7-day rotating refresh token)

## Health

- `GET /health` — liveness
- `GET /health/detailed` — readiness (DB, Redis)

## Deploy

Build and run with Docker:

```bash
docker build -t hrhub-api -f backend/Dockerfile backend
docker run -p 4000:4000 --env-file backend/.env hrhub-api
```

The image runs as a non-root user, has an HTTP healthcheck, and handles
`SIGTERM`/`SIGINT` for graceful shutdown.

## Observability

- Structured logs via pino (pretty in dev, JSON in prod)
- `X-Request-ID` correlation header on every response
- Optional: set `SENTRY_DSN` and install `@sentry/node` to forward 5xx errors

See [../OPS.md](../OPS.md) for backup strategy and production deploy notes.
