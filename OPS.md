# HRHub — Operations Guide

This document covers production deployment, backup, and incident response for
the HRHub platform.

---

## 1. Deployment

### Docker images

```bash
# Backend
docker build -t hrhub-api:$(git rev-parse --short HEAD) -f backend/Dockerfile backend

# Frontend (bake API URL)
docker build \
  --build-arg VITE_API_URL=https://api.hrhub.ae/api/v1 \
  -t hrhub-web:$(git rev-parse --short HEAD) \
  -f frontend/Dockerfile frontend
```

Both images:

- Run as a non-root user
- Expose HTTP healthchecks (`/health` for the API, `/` for nginx)
- Handle `SIGTERM` for zero-downtime rolling restarts

### Environment

- Backend env: see [backend/.env.example](backend/.env.example). Must-change
  for production:
  - `JWT_SECRET`, `REFRESH_TOKEN_SECRET` (≥ 32 random chars each)
  - `DATABASE_URL` (use connection pooler / PgBouncer in prod)
  - `CORS_ORIGINS` (comma-separated list of allowed origins)
  - `S3_*`, `SMTP_*` / `RESEND_API_KEY`
  - `SENTRY_DSN` (optional — requires `@sentry/node`)
- Frontend env is baked at build time via `VITE_API_URL`.

### Zero-downtime rollout

The API handles `SIGTERM`:

```ts
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))
```

On shutdown the server stops accepting new connections, waits for in-flight
requests to finish, then closes DB and Redis clients. Container orchestrators
(ECS, Kubernetes, Nomad) should use `terminationGracePeriodSeconds >= 30`.

### TLS / Reverse proxy

Terminate TLS at the load balancer (ALB, Cloudflare, nginx). Forward
`X-Forwarded-For` and `X-Request-ID`. Set `trust proxy` at the LB edge.

---

## 2. Database

### Migrations

Apply with the Drizzle migration runner baked into the image:

```bash
docker run --rm --env-file backend/.env hrhub-api:latest \
  node dist/db/migrate.js
```

The runner is idempotent and safe to re-run.

### Backups

PostgreSQL 17 — **daily `pg_dump` + continuous WAL** recommended.

**Managed DB (recommended):** Enable the provider's automated backups
(AWS RDS, DigitalOcean, Neon, Supabase all support daily snapshots + PITR
out of the box). Set retention to ≥ 7 days.

**Self-hosted fallback** — cron on the DB host:

```cron
# Daily logical dump at 02:00 UTC
0 2 * * *  /usr/bin/pg_dump -Fc $DATABASE_URL \
             > /backups/hrhub-$(date -u +\%Y\%m\%d).dump \
             && find /backups -name 'hrhub-*.dump' -mtime +14 -delete
```

Test the restore path at least quarterly:

```bash
pg_restore --clean --if-exists -d $DATABASE_URL hrhub-YYYYMMDD.dump
```

### File storage

Uploads are stored in S3-compatible object storage (`S3_BUCKET`). Enable
versioning + lifecycle (30-day non-current cleanup) on the bucket. Back up
through the provider's cross-region replication.

---

## 3. Observability

- **Logs**: structured JSON via pino. Ship stdout to CloudWatch / Loki /
  Datadog.
- **Request tracing**: every response has `X-Request-ID`; include it in
  user-facing error messages for fast lookups.
- **Metrics**: `/health/detailed` returns DB and Redis latency — scrape from
  a monitoring system to alert on degradation.
- **Errors**: set `SENTRY_DSN` and install `@sentry/node` to forward 5xx
  errors. The error handler already checks for a global `Sentry`.

---

## 4. Background jobs

BullMQ workers run inside the API process:

- **Visa / document expiry** — daily scan at 02:00 local, enqueues notifications
- **Payroll generation** — kicked off by `POST /api/v1/payroll/runs`

If Redis is unreachable the workers are skipped (the app still boots). In a
multi-instance deployment, prefer a single "worker" instance to avoid duplicate
job execution, or use BullMQ's built-in concurrency lock.

---

## 5. Security

- JWT access token — 15 min. Refresh token — 7 days, rotated on every use,
  stored as SHA-256 hash.
- Rate limits: 200 req/min global; 5/15 min on login; 10/15 min on 2FA.
- Helmet + CSP + CORS allowlist.
- All inputs validated with Zod before reaching Drizzle. SQL queries are
  parameterized.
- `NODE_ENV=production` disables Swagger and stack traces in responses.

Rotate `JWT_SECRET` and `REFRESH_TOKEN_SECRET` by redeploying with new values.
Existing sessions will be invalidated.

---

## 6. Incident response

1. Check `/health/detailed` — if degraded, inspect the failing check.
2. Search recent logs by `X-Request-ID` or user email.
3. For elevated 5xx rate, roll back to the previous image tag; the DB is
   forward-compatible across a single migration.
4. Post-incident, capture a `pg_dump` snapshot before mitigations that could
   change state.
