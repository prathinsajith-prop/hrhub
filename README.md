# HRHub.ae — UAE HR & PRO Management Platform

Production-grade multi-tenant SaaS HR platform for UAE businesses. Manages employees, visas, payroll, recruitment, leave, documents, and Emiratisation compliance in a single dashboard.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19.2, TypeScript, Vite 8, Tailwind CSS 4 |
| **UI** | shadcn/ui (Radix primitives), Recharts, TanStack Table |
| **State / Data** | TanStack Query 5, Zustand 5, react-hook-form + Zod |
| **Backend** | Fastify 5, Drizzle ORM, PostgreSQL 17 |
| **Auth** | @fastify/jwt — 15 min access token + 7 day refresh token with rotation |
| **Package manager** | pnpm 10 |

---

## Prerequisites

- Node.js ≥ 20
- pnpm 10 (`npm i -g pnpm`)
- PostgreSQL 17 running locally **or** Docker (see below)

---

## Local Setup

### 1 — Database

**Option A — Docker (recommended)**
```bash
docker compose up -d postgres
```

**Option B — Homebrew PostgreSQL**
```bash
brew services start postgresql@17
createuser -s hrhub_user
createdb -O hrhub_user hrhub
psql -U hrhub_user -d hrhub -c "ALTER USER hrhub_user WITH PASSWORD 'hrhub_secret';"
```

### 2 — Backend

```bash
cd backend
cp .env.example .env          # edit DATABASE_URL, JWT_SECRET, REFRESH_TOKEN_SECRET
pnpm install
pnpm db:migrate               # runs Drizzle migrations
pnpm db:seed                  # seeds demo tenant + admin user
pnpm dev                      # starts on http://localhost:4000
```

Key env vars (see `backend/.env.example` for full list):

```
DATABASE_URL=postgresql://hrhub_user:hrhub_secret@localhost:5432/hrhub
JWT_SECRET=<random 64-char string>
REFRESH_TOKEN_SECRET=<different random 64-char string>
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d
CORS_ORIGINS=http://localhost:5173
```

### 3 — Frontend

```bash
cd frontend
pnpm install
pnpm dev                      # starts on http://localhost:5173
```

The Vite dev server proxies `/api/v1/*` → `http://localhost:4000`.

### Demo credentials

| Email | Password | Role |
|---|---|---|
| `admin@hrhub.ae` | `Admin@12345` | Super Admin |

---

## API

Swagger UI is available at **http://localhost:4000/docs** in development.

### Auth routes

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/auth/login` | Login — returns `accessToken` + `refreshToken` (rate limited: 10 req/15 min/IP) |
| POST | `/api/v1/auth/refresh` | Rotate refresh token — returns new pair |
| POST | `/api/v1/auth/logout` | Revoke refresh token |
| GET | `/api/v1/auth/me` | Current user info |

### Feature routes (all require `Authorization: Bearer <token>`)

| Prefix | Module |
|---|---|
| `/api/v1/employees` | Employee CRUD, extended profile fields |
| `/api/v1/visa` | Visa applications, timeline tracking |
| `/api/v1/recruitment` | Jobs, candidates, Kanban stage updates |
| `/api/v1/payroll` | Payroll runs, payslips |
| `/api/v1/leave` | Leave requests, approvals |
| `/api/v1/documents` | Document management |
| `/api/v1/onboarding` | Onboarding checklists |
| `/api/v1/compliance` | Emiratisation + MOHRE scores |
| `/api/v1/dashboard` | KPIs, payroll trend, nationality breakdown, dept headcount |

---

## Database Migrations

```bash
cd backend
pnpm db:generate     # generate migration from schema changes
pnpm db:migrate      # apply pending migrations
pnpm db:studio       # open Drizzle Studio (visual DB browser)
```

Migration files live in `backend/migrations/`. Three applied so far:
- `0000` — initial schema (all core tables)
- `0001` — users / refresh tokens
- `0002` — employee extended fields (workEmail, mobileNo, IBAN, visa fields, etc.)

---

## Feature Status

### Implemented ✅
- Multi-tenant auth with JWT refresh token rotation + revocation
- Employee management — list, detail view, 30+ profile fields
- Visa tracking — full 8-step processing pipeline per application
- Recruitment — Kanban pipeline, candidate scoring, job listings
- Payroll — run management, payslips, WPS file ref storage
- Leave management — requests, approval workflow, balance tracking
- Document management — upload UI (storage adapter needed for production)
- Onboarding checklists — per-employee progress tracking
- Emiratisation compliance — ratio tracking, MOHRE score
- Dashboard — live KPIs, payroll trend, nationality breakdown, dept headcount
- Rate limiting — global 200 req/min; `/auth/login` stricter at 10 req/15 min/IP
- Consistent page layout (`PageWrapper`) and reusable `KpiCard` component across all 10 pages

### Pending ⏳
- **File storage adapter** — document upload UI exists but files need an S3/R2 backend (`@fastify/multipart` installed, adapter not wired)
- **Add/Edit Employee modal** — "Add Employee" button exists, multi-step form not yet built
- **WPS SIF file generation** — MOHRE-compliant XML/CSV export (`wpsFileRef` in schema, endpoint not built)
- **New Job / New Visa Application forms** — buttons exist, dialogs not wired
- **Reports page** — headcount, payroll, visa expiry, Emiratisation exports (Phase 4)
- **Cursor-based pagination** — employees and visa endpoints currently use offset pagination
- **Email provider** — no SMTP wired (nodemailer/Resend) for notifications or forgot-password
- **Background jobs** — no scheduler for visa expiry alerts, payroll reminders
- **2FA / TOTP** — Settings MFA toggle is UI-only
- **Audit log viewer** — Settings Security tab stub only

---

## Project Structure

```
hrhub/
├── backend/
│   ├── src/
│   │   ├── modules/        # auth, employees, visa, payroll, etc.
│   │   ├── db/
│   │   │   ├── schema/     # Drizzle table definitions
│   │   │   ├── migrate.ts
│   │   │   └── seed.ts
│   │   ├── plugins/        # authenticate.ts (JWT + requireRole)
│   │   └── index.ts        # Fastify bootstrap
│   └── migrations/
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── layout/     # AppLayout, PageWrapper, PageHeader, Sidebar
│       │   └── ui/         # shadcn/ui + kpi-card, data-table, form-controls
│       ├── hooks/          # TanStack Query hooks per module
│       ├── pages/          # One folder per route
│       ├── store/          # Zustand: authStore, uiStore
│       └── types/          # Shared TypeScript interfaces
└── docker-compose.yml      # PostgreSQL 17 + Redis 7
```
