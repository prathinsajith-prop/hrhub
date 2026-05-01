# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

**HRHub.ae** is a production-grade multi-tenant SaaS HR platform for UAE businesses. Bilingual (EN/AR). Monorepo with two workspaces:
- `backend/` — Fastify 5 REST API (TypeScript, ESM), port 4000
- `frontend/` — React 19 SPA (TypeScript, Vite), port 5174

**Always use `pnpm` — never npm or yarn.**

Deployed on Railway (backend) + Vercel (frontend). Production: `https://hrhub-alpha.vercel.app`.

---

## Commands

### Backend (`cd backend`)

```bash
pnpm dev              # tsx watch — hot reload on http://localhost:4000
pnpm build            # tsc compile to dist/
pnpm lint             # ESLint
pnpm lint:fix         # ESLint --fix
pnpm test             # vitest run (all tests)
pnpm test:watch       # vitest interactive
pnpm test:coverage    # vitest --coverage
pnpm db:generate      # drizzle-kit generate (after schema changes)
pnpm db:migrate       # apply pending migrations to Neon PostgreSQL
pnpm db:seed          # seed demo tenant + admin user (idempotent)
pnpm db:studio        # open Drizzle Studio visual DB browser
```

Run a single test file:
```bash
pnpm vitest run src/__tests__/payslip.test.ts
```

### Frontend (`cd frontend`)

```bash
pnpm dev              # Vite dev server on http://localhost:5174
pnpm build            # tsc type-check + vite build
pnpm lint             # ESLint
pnpm test             # vitest run
pnpm test:watch       # vitest interactive
pnpm preview          # preview production build
```

Run a single test file:
```bash
pnpm vitest run src/__tests__/permissions.test.ts
```

Coverage is scoped to `src/lib/**` and `src/hooks/**` only — page components are not covered by the test suite.

### Infrastructure

```bash
docker compose up -d  # start PostgreSQL 17, Redis, MinIO, and Mailpit (local dev)
```

Local dev services:
- PostgreSQL 17 — `localhost:5432`
- Redis 7 — `localhost:6379`
- MinIO (S3-compatible) — API `localhost:9000`, console `localhost:9001`
- Mailpit (SMTP test UI) — `http://localhost:8025` — catches all outgoing email when `EMAIL_PROVIDER=smtp` + `EMAIL_DEV_FALLBACK` not set

### Linting / Formatting

Root-level `biome.json` (Biome 1.9): 4-space indent, single quotes, trailing commas (ES5), 120 char line width. Both workspaces have their own ESLint config. Run ESLint via `pnpm lint` inside each workspace.

---

## Environment Variables

### Backend (`.env` — copy from `.env.example`)

| Variable | Description |
|---|---|
| `NODE_ENV` | `development` / `production` |
| `PORT` | Server port (default 4000) |
| `HOST` | Bind address (default `0.0.0.0`) |
| `DATABASE_URL` | PostgreSQL 17 connection string (Neon in prod) |
| `JWT_SECRET` | HS256 signing secret (min 32 chars in prod) |
| `JWT_EXPIRES_IN` | Access token TTL (default `15m`) |
| `REFRESH_TOKEN_SECRET` | Refresh token signing secret |
| `REFRESH_TOKEN_EXPIRES_IN` | Refresh TTL (default `7d`) |
| `REDIS_URL` | BullMQ + active-session cache (optional — workers disabled if absent) |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `S3_ENDPOINT` | S3 or MinIO endpoint URL |
| `S3_BUCKET` | Bucket name |
| `S3_ACCESS_KEY` | AWS/MinIO access key |
| `S3_SECRET_KEY` | AWS/MinIO secret key |
| `S3_PUBLIC_URL` | Public base URL for generating download links |
| `EMAIL_PROVIDER` | `smtp` / `resend` / `gmail` |
| `RESEND_API_KEY` | Required when `EMAIL_PROVIDER=resend` |
| `GMAIL_USER` | Gmail address (app password flow) |
| `GMAIL_APP_PASSWORD` | Gmail app password |
| `EMAIL_FROM` | Sender address |
| `EMAIL_FROM_NAME` | Sender display name |
| `EMAIL_DEV_FALLBACK` | `true` logs emails to console instead of sending |
| `STRIPE_SECRET_KEY` | Stripe secret key (subscription checkout) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `APP_URL` | Frontend origin — used in expiry-alert email links |

### Frontend (`.env.local` — copy from `.env.example`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend API base URL. Leave empty in local dev (Vite proxy handles it). Set to Railway URL in prod. |
| `VITE_APP_NAME` | App name shown in page titles (default `HRHub`) |

---

## Modules

| Module | Backend path | Frontend path | Notes |
|---|---|---|---|
| Auth | `modules/auth/` | `pages/auth/` | JWT HS256, refresh tokens, 2FA (TOTP), lockout |
| Employees | `modules/employees/` | `pages/employees/` | Full lifecycle, bulk CSV import, org chart |
| Payroll | `modules/payroll/` | `pages/payroll/` | WPS-compliant, async via BullMQ, payslip PDF, gratuity calc |
| Visa | `modules/visa/` | `pages/visa/` | 8-step workflow, costs tracking, PRO report export |
| Leave | `modules/leave/` | `pages/leave/` + `pages/my/` | Policies, balances, accrual, approvals |
| Documents | `modules/documents/` | `pages/documents/` | S3 presigned upload, categories, expiry tracking |
| Recruitment | `modules/recruitment/` + `modules/interview/` | `pages/recruitment/` | Kanban board, pipeline stages, interviews, resume upload |
| Performance | `modules/performance/` | `pages/performance/` | Review cycles, ratings, CSV/PDF export |
| Attendance | `modules/attendance/` | `pages/attendance/` | Manual, CSV import, external punch endpoint |
| Onboarding | `modules/onboarding/` | `pages/onboarding/` + `pages/misc/` | Guided checklist, step-by-step, employee-facing upload |
| Exit | `modules/exit/` | `pages/employees/ExitPage` | Settlement calc (UAE labour law), approvals, handover |
| Assets | `modules/assets/` | `pages/assets/` | Asset tracking, employee assignments |
| Org Structure | `modules/orgUnits/` + `modules/teams/` + `modules/designations/` | `pages/organizations/` | Branches → Divisions → Departments, teams, designations |
| Calendar | `modules/calendar/` | `pages/calendar/` | Company + personal events, holiday schedule |
| Compliance | `modules/compliance/` | `pages/misc/CompliancePage` | Emiratisation quotas, expiry alerts dashboard |
| Reports | `modules/reports/` | `pages/misc/ReportsPage` | Headcount, payroll, turnover, leave reports |
| Audit Log | `modules/audit/` | `pages/misc/AuditLogPage` | Activity log with diff view + login history |
| Notifications | `modules/notifications/` | `pages/misc/NotificationsPage` | In-app, polled every 60s |
| HR Dashboard | `modules/hr/` + `modules/dashboard/` | `pages/dashboard/` | Role-aware KPI cards + charts |
| Settings (personal) | `modules/auth/` | `pages/settings/` | Profile, security (2FA, password), notification prefs |
| Org Settings | `modules/settings/` | `pages/organizations/org-settings/` | Company profile, leave config, holidays, roles, security policy, members, designations, subscription |
| Connected Apps | `modules/apps/` | `pages/organizations/ConnectedAppsPage` | Third-party API integrations |
| Subscription | `modules/subscription/` | `pages/organizations/SubscriptionPage` | Plan management, Stripe checkout, billing history |
| Complaints | `modules/complaints/` | `pages/misc/ComplaintsPage` + `pages/my/MyComplaintsPage` | Confidential grievance workflow |
| Tenants | `modules/tenants/` | — | Internal super-admin tenant management |

---

## Architecture

### Multi-tenancy

Every DB table has `tenantId`. All service functions receive it from the verified JWT and filter by it — cross-tenant data access is impossible at the DB layer. JWT payload: `{ id, tenantId, role, name, email, employeeId, department }` — no DB hit needed per request for identity.

### Backend

**Module structure:** `backend/src/modules/<module>/` — each module has `<module>.routes.ts` + `<module>.service.ts`.

**Auth guards:**
```ts
const auth = { preHandler: [fastify.authenticate] }
const hrOnly = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }
```

**Auth plugin** (`plugins/authenticate.ts`): Verifies JWT, checks `isActive` via Redis cache (5 min TTL). Populates `request.user` with typed identity.

**Error handling:** Throw `ServiceError` from service layer; use `e400/e403/e404/e409` helpers for inline route errors. Wire format: `{ statusCode, error, message }`.

**DB layer:** Drizzle ORM on PostgreSQL 17 (Neon in prod). Schema files in `backend/src/db/schema/` — one file per domain, all re-exported from `index.ts`. Migrations in `backend/migrations/`. Use `COUNT(*) OVER()` window function for paginated lists (single query). `db.transaction()` for payroll and bulk employee import.

**Validation:** Zod schemas inline in routes using `z.safeParse()` or `validate(schema, input)` from `lib/validation.ts`.

**Soft deletes:** `deletedAt` timestamp on `performance_reviews`, `visa_costs`, and most entity tables. `isActive` boolean on `designations` and `orgUnits`.

**Audit logging:** Call `recordActivity(...)` after every mutation. Always fire-and-forget:
```ts
recordActivity({
    tenantId: request.user.tenantId,
    userId: request.user.id,
    actorName: request.user.name,
    actorRole: request.user.role,
    entityType: 'entity_name',
    entityId: data.id,
    entityName: data.name,
    action: 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'submit',
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
}).catch(() => { })
```
The `visa.routes.ts` uses a local `audit()` wrapper — preferred pattern for complex modules.

**Background workers** (`workers/`): BullMQ + Redis. All workers gracefully skip registration if Redis is unavailable.

| Worker | Queue | Schedule | Purpose |
|---|---|---|---|
| `expiry.worker.ts` | `visa-expiry` | Daily 02:00 UTC (06:00 UAE) | Visa expiry alerts at 90/60/30/14/7 days |
| `expiry.worker.ts` | `document-expiry` | Daily 02:00 UTC | Document expiry alerts at 90/60/30 days |
| `expiry.worker.ts` | `contract-expiry` | Daily 02:00 UTC | Contract expiry alerts at 90/30 days |
| `expiry.worker.ts` | `passport-expiry` | Daily 02:00 UTC | Passport expiry alerts at 180/90/30 days |
| `expiry.worker.ts` | `subscription-expiry` | Daily 02:00 UTC | Subscription expiry reminders at 7/1 days |
| `expiry.worker.ts` | `onboarding-overdue` | Daily 02:00 UTC | Marks overdue onboarding steps |
| `payroll.worker.ts` | `payroll-run` | On-demand | Async payroll calculation (async path) |

**File storage:** All uploads go to AWS S3 (or MinIO locally) via `plugins/s3.ts`. No files stored locally. Presigned URLs for direct browser uploads. `objectExists(key)` exported for pre-flight validation.

**Pagination:** Offset (with `total`) + cursor/keyset (`base64url({ c: createdAt, i: id })`). Cursor preferred for real-time data (employees list uses `useInfiniteQuery` with cursor).

**Email:** Three providers configured via `EMAIL_PROVIDER` env var: `smtp`, `resend`, `gmail`. `EMAIL_DEV_FALLBACK=true` logs emails to console instead of sending. Templates in `plugins/email.ts`.

**Subscription plans:**
- `starter` — Free, up to 5 employees
- `professional` — AED 200 / 5 employees / month, Stripe checkout
- `enterprise` — Custom pricing, contact sales

### Frontend

**Data fetching:** TanStack Query 5. One hook file per module (`hooks/use<Module>.ts`). Query keys: `[module, tenantId, ...params]`. Standard `staleTime: 30_000`.

**API client** (`lib/api.ts`): Thin fetch wrapper. Bearer token from Zustand. 401 → token refresh (singleton promise, no race conditions). Base URL: `VITE_API_URL` env var, defaults to `/api/v1` (Vite proxy in dev — leave blank in `.env.local`).

**Auth state** (`store/authStore.ts`): Zustand, persisted to `localStorage` (with "remember me" → `sessionStorage` fallback).

**Permissions** (`lib/permissions.ts`): Hard-coded role → permission matrix (38 permissions, 44 guarded routes). Roles:

```
super_admin > hr_manager > pro_officer > dept_head > employee
```

Use `hasPermission(role, permission)` and `canAccessRoute(role, routeKey)`. **Do not add permission checks outside this file.**

**i18n** (`lib/i18n.ts`): EN eagerly loaded, AR lazily on language switch. Files: `locales/en.json`, `locales/ar.json` (~800 keys each — must stay in sync). RTL via `dir` + `rtl` class on `<html>`. **Always add new strings to both locale files.**

**Routing:** React Router v7, lazy-loaded pages, guarded by `canAccessRoute()`.

**UI components:** shadcn/ui (Radix primitives) + Tailwind CSS 4. Toasts: `toast` from `components/ui/overlays`. Data tables: TanStack Table. Charts: Recharts. Confirmation dialogs: `ConfirmDialog` from `overlays` (variants: `destructive`, `warning`, `success`). KPI cards: `KpiCard` from `components/shared/KpiCard`.

**Destructive actions:** Every delete/archive/deactivate must use `ConfirmDialog` before executing. Bulk operations too.

**State-during-render pattern** (preferred over useEffect for derived state sync):
```tsx
// Sync external state into local form fields without double-render
const [lastSynced, setLastSynced] = useState(externalValue)
if (externalValue !== lastSynced) {
    setLastSynced(externalValue)
    setLocalField(externalValue)
}
```

**Vite bundle splitting:** Manual chunks defined in `vite.config.ts` — vendor, router, query, ui, charts, pdf, dnd, and per-feature chunks for heavy pages.

### API Conventions

- Auth header: `Authorization: Bearer <accessToken>`
- Base path: `/api/v1/`
- Swagger UI: `http://localhost:4000/docs` (dev only)
- Paginated response: `{ data: T[], total, limit, offset, hasMore, nextCursor? }`
- Error response: `{ statusCode, error, message }`
- `dept_head` role is scoped server-side to their department — enforced in route handlers, not just client

### Database Schema (key tables)

| Table | Purpose |
|---|---|
| `tenants` | Customer companies |
| `users` | Login accounts (linked to employees via `employeeId`) |
| `employees` | Employee records (HR data, visa, passport, contract) |
| `employee_documents` | File attachments per employee |
| `documents` | Uploaded documents with expiry tracking |
| `payroll_runs` | Monthly payroll batches |
| `payslips` | Per-employee payslip for a run |
| `visa_applications` | 8-step visa workflow |
| `visa_costs` | Cost line items per visa application |
| `leave_requests` | Leave requests with approval flow |
| `leave_policies` | Configurable leave types/rules per tenant |
| `leave_balances` | Per-employee leave balance |
| `leave_holidays` | Public holiday calendar |
| `attendance_records` | Daily punch-in/out records |
| `performance_reviews` | Review cycles with ratings |
| `onboarding_checklists` | Onboarding instances per employee |
| `onboarding_steps` | Individual checklist items |
| `recruitments` | Job postings |
| `candidates` | Applicant records with pipeline stage |
| `interviews` | Scheduled interviews per candidate |
| `exit_requests` | Exit/offboarding workflow |
| `assets` | Company asset inventory |
| `asset_assignments` | Asset-to-employee assignments |
| `org_units` | Org structure (branch/division/department) |
| `teams` | Cross-functional teams |
| `designations` | Job titles / grades |
| `complaints` | Confidential grievance submissions |
| `notifications` | In-app notification queue |
| `activity_logs` | Full audit trail with diff |
| `calendar_events` | Company + personal events |
| `apps` | Connected third-party integrations |
| `subscriptions` | Tenant subscription plan + billing |

### Migrations

4 migrations applied (`backend/migrations/`):
- `0000_init.sql` — full schema
- `0001_company_code.sql` — company code field
- `0002_leave_settings.sql` — leave configuration tables
- `0003_soft_delete_columns.sql` — `deleted_at` on `performance_reviews` + `visa_costs`

**WARNING:** Drizzle-kit snapshots can drift from the actual DB state. If `pnpm db:generate` produces a huge migration (>10 KB), it's a snapshot mismatch — write a minimal `ALTER TABLE` migration by hand and update `meta/_journal.json` manually.

---

## Domain Reference

`WORKFLOWS.md` (root) is a 24 KB operational reference covering the full lifecycle of every module: visa 8-step workflow, payroll WPS run lifecycle, UAE Labour Law exit settlement rules, Emiratisation quotas, grievance SLAs, audit log retention tiers, and more. Read it before making non-trivial changes to any of those modules.

---

## Demo Credentials (local dev)

| Email | Password | Role |
|---|---|---|
| `admin@hrhub.ae` | `Admin@12345` | Super Admin |

---

## Known Security Items (open)

These issues were identified in a security review and have not yet been fixed:

1. **Cross-tenant S3 key injection** (`documents.routes.ts` `POST /`): The `s3Key` field from the request body is not validated to have a `tenants/${tenantId}/` prefix. A user can register an S3 object belonging to another tenant. Fix: add `if (!body.s3Key.startsWith('tenants/${request.user.tenantId}/')) return reply.code(403)` before the existence check.

2. **TOCTOU lockout bypass** (`auth.service.ts`): `failedLoginCount` increment is a read-modify-write operation (not atomic). Under concurrent requests, two threads can read the same counter and both write `count + 1`, meaning a brute-force attempt could avoid triggering the lockout threshold. Fix: replace with `UPDATE users SET failedLoginCount = failedLoginCount + 1, ... WHERE id = $id`.

3. **Intra-tenant attendance spoofing** (`attendance.routes.ts` `POST /external-punch`): The endpoint validates that the employee belongs to the tenant but does not check that the requester is the employee themselves (or an HR manager). Any authenticated employee can punch in/out for a colleague. Fix: add a guard `if (request.user.role === 'employee' && employeeId !== request.user.employeeId) return reply.code(403)`.
