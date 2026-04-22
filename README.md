# HRHub.ae — UAE HR & PRO Management Platform

Production-grade multi-tenant SaaS HR platform built for UAE businesses. Manages employees, visas, WPS payroll, recruitment, leave, documents, and Emiratisation compliance — all in a single bilingual (English/Arabic) dashboard.

---

## Features

| Module | What it does |
|---|---|
| **Employee Management** | Full employee lifecycle — create, onboard, update, archive. Extended profile fields (passport, visa, bank, emergency contact). Bulk CSV import with transactional rollback. Org chart with cycle-detection. |
| **Visa & PRO** | Track UAE residency visa applications end-to-end. Expiry alerts at 90/60/30-day thresholds. Automated email notifications to HR managers. |
| **WPS Payroll** | UAE-compliant payroll engine — prorated pay, unpaid leave deductions, sick-leave half-pay. Generates Ministry of Labour WPS SIF files. Entire payroll run wrapped in a DB transaction. |
| **Leave Management** | Annual, sick, emergency, unpaid leave requests. Manager approval flow with email notification. Leave balance deducted from payroll automatically. |
| **Recruitment** | Job postings, candidate pipeline, Kanban stage tracker. |
| **Documents** | Upload, categorise, and track employee documents. Expiry tracking for contracts and certificates. |
| **Onboarding** | Checklist-based onboarding tasks per employee. |
| **Compliance** | Emiratisation (Nationalisation) score calculation. MOHRE compliance tracking. Payroll compliance overview. |
| **Dashboard** | Real-time KPIs, payroll cost trend, nationality breakdown, department headcount, expiring visa list, recent activity feed. |
| **Audit Log** | Tamper-evident activity log for all data mutations. |
| **Notifications** | In-app notification centre — both tenant-wide and user-specific. |
| **Bilingual UI** | Full English ↔ Arabic toggle. RTL layout support via i18next + Tailwind. |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS 4 |
| **UI Components** | shadcn/ui (Radix primitives), Recharts, TanStack Table |
| **State / Data** | TanStack Query 5, Zustand 5, react-hook-form + Zod |
| **i18n** | i18next 26, react-i18next 17 (en + ar, 23 namespaces) |
| **Backend** | Fastify 5 + `@fastify/compress` (gzip) + `@fastify/rate-limit` |
| **ORM** | Drizzle ORM 0.45 on PostgreSQL 17 |
| **Auth** | JWT — 15 min access token + 7 day rotating refresh token. Bcrypt (10 rounds). Account lockout after 5 failed attempts. |
| **Background Jobs** | BullMQ (Redis) — visa expiry worker runs nightly |
| **File Storage** | AWS S3 (or compatible) — no local disk storage |
| **Package manager** | pnpm 10 |

---

## Architecture Overview

```
frontend/          React SPA (Vite)
  src/
    pages/         One file per module (lazy-loaded)
    hooks/         TanStack Query hooks — one per module
    store/         Zustand slices (auth, ui)
    locales/       en.json + ar.json (23 sections each)
    lib/api.ts     Axios wrapper — attaches Bearer token, refreshes on 401

backend/           Fastify server
  src/
    modules/       Feature modules — each has routes.ts + service.ts
    db/schema/     Drizzle table definitions (one file per domain)
    plugins/       authenticate.ts — JWT verify, no DB hit per request
    workers/       expiry.worker.ts — BullMQ job for visa/document expiry
    lib/
      errors.ts    ServiceError class — typed 4xx/5xx responses
      validation.ts Zod schemas shared by routes
```

**Key design decisions:**

- **No DB query per request** — user identity (`id`, `tenantId`, `role`, `name`, `email`) is embedded in the JWT at login. The auth plugin only verifies the signature.
- **Single window-function query for paginated lists** — `COUNT(*) OVER()` replaces the old 2-query pattern (count + fetch).
- **Transactional payroll** — the entire payroll run (delete old payslips → insert new → update run status) is wrapped in `db.transaction()`.
- **Transactional bulk import** — employee bulk import rolls back on any single row failure.
- **Gzip compression** — all API responses are compressed via `@fastify/compress`.
- **30-second request timeout** — enforced via Fastify's `connectionTimeout`.

---

## Prerequisites

- Node.js ≥ 20
- pnpm 10 (`npm i -g pnpm`)
- PostgreSQL 17 running locally **or** Docker (see below)
- Redis (required for visa expiry background jobs)

---

## Local Setup

### 1 — Database

**Option A — Docker (recommended)**
```bash
docker compose up -d
```
This starts PostgreSQL and Redis together.

**Option B — Manual (Homebrew)**
```bash
brew services start postgresql@17
brew services start redis
createuser -s hrhub_user
createdb -O hrhub_user hrhub
psql -U hrhub_user -d hrhub -c "ALTER USER hrhub_user WITH PASSWORD 'hrhub_secret';"
```

### 2 — Backend

```bash
cd backend
cp .env.example .env          # fill in the values below
pnpm install
pnpm db:migrate               # applies Drizzle migrations
pnpm db:seed                  # creates demo tenant + admin user
pnpm dev                      # starts on http://localhost:4000
```

Required environment variables (`backend/.env`):

```env
# Database
DATABASE_URL=postgresql://hrhub_user:hrhub_secret@localhost:5432/hrhub

# JWT — use two DIFFERENT random 64-character strings
JWT_SECRET=<random-64-chars>
REFRESH_TOKEN_SECRET=<different-random-64-chars>
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# CORS — comma-separated list of allowed frontend origins
CORS_ORIGINS=http://localhost:5174

# Redis (BullMQ background jobs)
REDIS_HOST=localhost
REDIS_PORT=6379

# AWS S3 (file uploads)
AWS_REGION=us-east-1
AWS_S3_BUCKET=hrhub-documents
AWS_ACCESS_KEY_ID=<key>
AWS_SECRET_ACCESS_KEY=<secret>

# Email (SMTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@hrhub.ae
SMTP_PASS=<password>
EMAIL_FROM=HRHub <noreply@hrhub.ae>

# App
NODE_ENV=development
PORT=4000
```

### 3 — Frontend

```bash
cd frontend
pnpm install
pnpm dev                      # starts on http://localhost:5174
```

The Vite dev server proxies `/api/v1/*` → `http://localhost:4000`.

### Demo credentials

| Email | Password | Role |
|---|---|---|
| `admin@hrhub.ae` | `Admin@12345` | Super Admin |

---

## API

Interactive Swagger UI: **http://localhost:4000/docs** (development only)

Health endpoints (no auth required):
- `GET /health` — basic liveness check
- `GET /health/detailed` — checks PostgreSQL and Redis connectivity with latency

### Auth routes

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Login — returns `accessToken` + `refreshToken` (rate limited 10 req/15 min/IP) |
| `POST` | `/api/v1/auth/refresh` | Rotate refresh token — returns new pair |
| `POST` | `/api/v1/auth/logout` | Revoke refresh token |
| `GET` | `/api/v1/auth/me` | Current authenticated user |
| `POST` | `/api/v1/auth/forgot-password` | Send password reset email |
| `POST` | `/api/v1/auth/reset-password` | Apply new password with reset token |

### Feature routes (all require `Authorization: Bearer <accessToken>`)

| Prefix | Module | Role required |
|---|---|---|
| `/api/v1/employees` | Employee CRUD, bulk import, org chart | `hr_manager`, `super_admin` |
| `/api/v1/visa` | Visa applications | `pro_officer`, `hr_manager` |
| `/api/v1/recruitment` | Jobs + candidates | `hr_manager` |
| `/api/v1/payroll` | Payroll runs, payslips, WPS SIF | `hr_manager` |
| `/api/v1/leave` | Leave requests, approvals | all authenticated |
| `/api/v1/documents` | Document upload, download | all authenticated |
| `/api/v1/onboarding` | Onboarding checklists | `hr_manager` |
| `/api/v1/compliance` | Emiratisation scores | `hr_manager` |
| `/api/v1/dashboard` | KPIs and charts | all authenticated |
| `/api/v1/audit` | Audit log | `super_admin` |
| `/api/v1/notifications` | Notification centre | all authenticated |

---

## Database Migrations

```bash
cd backend
pnpm db:generate     # generate a new migration from schema changes
pnpm db:migrate      # apply pending migrations to the DB
pnpm db:seed         # reseed demo data (idempotent)
pnpm db:studio       # open Drizzle Studio visual DB browser
```

---

## Available Scripts

### Backend (`cd backend`)

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server with hot-reload (tsx watch) |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run compiled server |
| `pnpm db:generate` | Generate Drizzle migration |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Seed demo data |
| `pnpm db:studio` | Open Drizzle Studio |

### Frontend (`cd frontend`)

| Command | Description |
|---|---|
| `pnpm dev` | Start Vite dev server on port 5174 |
| `pnpm build` | Production build to `dist/` |
| `pnpm preview` | Preview production build |
| `pnpm lint` | Run ESLint |

---

## Security

- Passwords hashed with bcrypt (10 rounds)
- Account locked for 15 minutes after 5 consecutive failed login attempts
- All JWT access tokens expire in 15 minutes; refresh tokens rotate on every use
- User identity embedded in JWT — no database lookup on every API request
- All routes validate input with Zod schemas
- Helmet headers enabled on all responses
- Rate limiting: 200 req/min globally; 10 login attempts/15 min per IP
- File uploads go directly to S3 — no files stored on the application server
- `X-Request-ID` correlation header on every response for tracing

---

## Multi-tenancy

Every table includes a `tenantId` column. All service functions filter by `tenantId` from the verified JWT — one tenant cannot access another's data. Tenants are isolated at the application layer (shared PostgreSQL schema).

---

## Background Workers

`backend/src/workers/expiry.worker.ts` — runs nightly via BullMQ:
- Checks visa expiry dates (90, 60, 30, 7 days out)
- Checks document expiry dates
- Emails alerts to HR managers and PRO officers (not to employees)

The worker requires Redis. If Redis is unavailable on startup, the worker skips registration and the rest of the application continues normally.

