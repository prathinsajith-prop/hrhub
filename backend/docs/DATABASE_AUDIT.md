# HRHub Database Audit & Architecture (2025)

This document captures the verified state of the database after the
performance + integrity hardening pass shipped in migrations
`0009`–`0013`. Use it as the single source of truth when designing new
modules or onboarding new engineers.

> **TL;DR**
> 36 tables, all multi-tenant, all RLS-protected, all soft-delete-aware
> where it matters. Pagination is **keyset by default**, with offset as
> a fallback for "go to page N" UIs. Repositories are the only place
> that talks to Drizzle.

---

## 1. Inventory

### Core (`backend/src/db/schema/`)

| Domain | Tables |
| --- | --- |
| Tenancy | `tenants`, `tenant_memberships` |
| Identity | `users`, `password_reset_tokens`, `two_fa_backup_codes` |
| Employees | `employees` |
| Visa & Compliance | `visas`, `documents`, `document_versions`, `document_templates` |
| Time | `attendance_records`, `leave_requests`, `leave_policies`, `leave_balances` |
| Payroll | `payroll_runs`, `payslips` |
| Recruitment | `job_postings`, `job_applications`, `interviews` |
| Onboarding & Exit | `onboarding_steps`, `exit_requests` |
| Performance | `performance_reviews` |
| Assets | `asset_categories`, `assets`, `asset_assignments`, `asset_maintenance` |
| Notifications | `notifications`, `connected_apps` |
| Audit | `activity_logs`, `login_history`, `audit_logs` |

Total: **36 tables**.

### Migration history

| File | Purpose |
| --- | --- |
| `0000_initial_schema.sql` | Bootstrap (tenants, users, employees, leave, payroll, recruitment, attendance, audit). |
| `0001_soft_delete_columns.sql` | `deleted_at` on mutable tables. |
| `0002_extended_tables_and_fields.sql` | Visa fields, payroll runs, exit requests, document templates. |
| `0003_employee_fts_index.sql` | `tsvector` index for employee global search. |
| `0004_row_level_security.sql` | Initial RLS policies on the high-traffic tables. |
| `0005_two_fa_backup_codes.sql` | 2FA backup code storage. |
| `0006_assets_module.sql` | Asset management tables. |
| `0007*` / `0008*` | (Reserved / module-specific.) |
| **`0009_performance_indexes.sql`** | Composite + partial indexes for hot queries (this audit). |
| **`0010_rls_policy_gaps.sql`** | RLS on the 13 tables that were still un-policed (this audit). |
| **`0011_users_tenant_email.sql`** | Case-insensitive global + tenant-scoped email indexes (Phase 1, non-breaking). |
| **`0012_employees_reporting_to_fk.sql`** | FK + indexes for `employees.reporting_to`. |
| **`0013_enum_check_constraints.sql`** | `CHECK` constraints to lock down enum-shaped text columns. |
| **`0014_users_employee_link.sql`** | FK + unique index linking `users.employee_id → employees.id`; backfilled by case-insensitive email match. |

---

## 2. Why `users` and `employees` are separate tables

This question comes up often because most other domain tables collapse
into one. Keeping them separate is a deliberate design choice shared by
every mature HR product (BambooHR, Workday, Rippling, Personio):

| Concern | `users` | `employees` |
| --- | --- | --- |
| Purpose | **Authentication identity** | **HR record of employment** |
| Required? | Only for accounts that log in | One row per person ever employed |
| Lifecycle | Created on invite, deleted/disabled on offboarding | Created on hire, soft-deleted (`is_archived`) on termination but preserved for years (audit, payslip history, gratuity) |
| Personal data | Auth-relevant only (email, password hash, MFA, last login) | HR-relevant (passport, Emirates ID, salary, visa, bank, allowances) |
| Access | Read by Fastify auth plugin on every request | Read by HR / payroll / employee portal |
| Cardinality | A human can have **N** user rows (one per tenant) | One employee row per (tenant, hire) |

Concretely, the rows that **must not** mix:

* **Super-admins, integration accounts, parent-company auditors** — log
  in but are not employees of the operating tenant.
* **Terminated employees** — keep the HR row for 5+ years (UAE labour
  law, gratuity calculations, visa cancellation audit) but the login
  account is disabled instantly. Merging the tables would either leak
  PII into auth logs or force us to delete payslip-bearing rows.
* **Blue-collar / contract employees without portal access** — exist as
  HR records, never get a `users` row.

### How they connect

`users.employee_id` is a **nullable FK** to `employees.id`
(migration 0014). The link is:

* **Optional** — non-employee users keep `employee_id IS NULL`.
* **1:1 within a tenant** — enforced by
  `UNIQUE (employee_id) WHERE employee_id IS NOT NULL`.
* **Soft on detach** — `ON DELETE SET NULL` so deleting the HR record
  (rare, GDPR-only) preserves the user row for audit history.

The login response, JWT payload, and `request.user` all expose
`employeeId`, so the frontend (employee self-service portal) can fetch
the right HR record without a second API call. Code that needs to
resolve "what employee is this user?" goes through
`identityRepo.resolveEmployeeForUser()` instead of doing ad-hoc email
matches.

---

## 3. Multi-tenancy & Row Level Security

Every business table carries a `tenant_id uuid NOT NULL` (one exception:
`login_history` allows NULL because failed logins arrive before the tenant
is known). Tenant isolation is enforced at three layers:

1. **HTTP middleware** sets `app.current_tenant` once per request via
   `withTenantContext()` in `backend/src/db/index.ts`.
2. **PostgreSQL RLS** policies (`tenant_isolation`) on every table refuse
   any row where `tenant_id <> current_setting('app.current_tenant')::uuid`.
3. **Repository layer** still adds `eq(table.tenantId, ...)` predicates so
   queries are correct even if the session GUC is unset (defence in depth).

### RLS coverage matrix (after `0010_rls_policy_gaps.sql`)

| Table | RLS enabled | Policy |
| --- | --- | --- |
| `tenants` | ✅ | `tenant_self_access` (`id = current_tenant`) |
| `users` | ✅ | tenant_isolation |
| `employees` | ✅ | tenant_isolation |
| `attendance_records` | ✅ | tenant_isolation |
| `leave_requests` | ✅ | tenant_isolation |
| `leave_policies` | ✅ (new) | tenant_isolation |
| `leave_balances` | ✅ (new) | tenant_isolation |
| `payroll_runs` | ✅ | tenant_isolation |
| `payslips` | ✅ | tenant_isolation |
| `documents` | ✅ | tenant_isolation |
| `document_versions` | ✅ (new) | tenant_isolation (via parent EXISTS) |
| `document_templates` | ✅ | tenant_isolation |
| `visas` | ✅ | tenant_isolation |
| `notifications` | ✅ | tenant_isolation |
| `connected_apps` | ✅ (new) | tenant_isolation |
| `asset_categories` | ✅ (new) | tenant_isolation |
| `assets` | ✅ (new) | tenant_isolation |
| `asset_assignments` | ✅ (new) | tenant_isolation |
| `asset_maintenance` | ✅ (new) | tenant_isolation |
| `tenant_memberships` | ✅ (new) | tenant_isolation |
| `activity_logs` | ✅ (new) | tenant_isolation |
| `login_history` | ✅ (new) | tenant_isolation **OR** `tenant_id IS NULL` |
| `audit_logs` | ✅ | tenant_isolation |
| `job_postings` | ✅ | tenant_isolation |
| `job_applications` | ✅ (new) | tenant_isolation (via `EXISTS` on `job_postings`) |
| `interviews` | ✅ | tenant_isolation |
| `onboarding_steps` | ✅ (new) | tenant_isolation (via `EXISTS` on `employees`) |
| `exit_requests` | ✅ | tenant_isolation |
| `performance_reviews` | ✅ | tenant_isolation |

---

## 4. Index strategy

### Principles

* **Composite over single-column** when filters are co-occurring (`tenant_id, date`).
* **Partial indexes** for sparse predicates (`WHERE deleted_at IS NULL`,
  `WHERE returned_at IS NULL`, `WHERE expiry_date IS NOT NULL`).
* **Functional `LOWER(email)`** indexes for case-insensitive uniqueness.
* **Keyset-friendly ordering**: every list page paginates on `(date DESC, id DESC)` or `(created_at DESC, id DESC)`; the supporting index is built on the same tuple so PostgreSQL can stream results without a sort.

### Hot indexes added in `0009`

| Index | Table | Notes |
| --- | --- | --- |
| `idx_attendance_tenant_date` | attendance_records | Default month view. |
| `idx_attendance_tenant_employee_date` | attendance_records | Employee timeline. |
| `uq_attendance_employee_date` | attendance_records | Hard guarantee of one row per employee per day. |
| `idx_leave_requests_tenant_date_employee` (partial) | leave_requests | Payroll period scans. |
| `idx_notifications_user_unread` (partial) | notifications | Header bell, very hot. |
| `idx_activity_logs_tenant_created` | activity_logs | Audit feed. |
| `idx_login_history_tenant_created` | login_history | Security dashboard. |
| `idx_documents_tenant_expiry` (partial) | documents | Expiring-soon widget. |
| `idx_documents_uploaded_by` (partial) | documents | "My uploads". |
| `idx_asset_assignments_open` (partial) | asset_assignments | Open assignment join. |
| `idx_employees_reporting_to`, `idx_employees_tenant_reporting_to` (partial) | employees | Org chart traversal (added in `0012`). |
| `uq_users_email_global_ci`, `uq_users_tenant_email_ci`, `idx_users_email_ci` | users | Case-insensitive auth lookups (added in `0011`). |

The migration ends with `ANALYZE` on every touched table so the planner picks the new indexes immediately.

---

## 5. Data-integrity contracts

### Foreign keys & cascade conventions

* **`ON DELETE CASCADE`** for owned child rows (e.g. `payslips → payroll_runs`).
* **`ON DELETE SET NULL`** for soft references (e.g. `employees.reporting_to`,
  `users.deleted_by`). Manager removal must not orphan reports.
* **`DEFERRABLE INITIALLY DEFERRED`** on `employees.reporting_to` so bulk
  reorganisations can swap manager pointers inside a single transaction
  without ordering pain.

### `CHECK` constraints (`0013`)

Enum-shaped text columns are now constrained at the database level so a
missed validation in application code can't corrupt the table. Examples:

* `chk_employees_status IN ('active','on_leave','terminated','resigned','probation')`
* `chk_leave_requests_dates CHECK (end_date >= start_date)`
* `chk_payroll_runs_month CHECK (month BETWEEN 1 AND 12)`
* `chk_payslips_amounts_nonneg` for every monetary column.

All constraints are added with `NOT VALID` then `VALIDATE CONSTRAINT` so
the migration is non-blocking on large tables. The single intentional
exception is `chk_leave_requests_days_positive`, which stays unvalidated
to tolerate legacy zero-day rows.

### Soft delete

Tables that use soft delete carry `deleted_at timestamptz NULL` and
`deleted_by uuid NULL`. **Repositories must add `isNull(table.deletedAt)`
to every read** unless the caller explicitly opts in to deleted rows
(reporting / GDPR exports).

---

## 6. Pagination

The standard envelope, returned by every list endpoint, is:

```ts
{ items: T[]; nextCursor: string | null; total?: number }
```

`total` is included only when offset pagination was used (UI requested
`?page=N`). For keyset pagination (`?cursor=…` or no cursor), `total` is
omitted because computing it would defeat the purpose.

The cursor is a base64url-encoded JSON `{ c: ISO date, i: uuid }` (see
`backend/src/lib/db-helpers.ts`). Use `applyKeyset()` and
`buildKeysetResult()` from `backend/src/lib/query-helpers.ts` rather
than rolling your own.

The frontend `useXxx` hooks expose `page`, `limit`, and `cursor`
parameters, and consumers must read `data.items` (not `data` as an
array). The consumers already converted: attendance.

---

## 7. Caching

`backend/src/lib/cache.ts` declares **all** Redis namespaces in a single
file. Each namespace owns its TTL and provides typed `get/set/invalidate`
helpers, so we can:

* See every cache used by the app at a glance.
* Adjust TTLs in one place during incidents.
* Run `invalidateEmployeeCaches(tenantId)` from any mutation path
  without remembering which keys to bust.

If Redis is unreachable, all helpers degrade to no-ops (see `redis.ts`).

---

## 8. Repository layer

`backend/src/repositories/` is the only place allowed to call
`db.select / insert / update`. Service code consumes typed functions:

```ts
import { employeesRepo, attendanceRepo } from '../../repositories'

const page = await attendanceRepo.listAttendance(tenantId, { page: 1, limit: 50 })
```

This puts the SQL surface behind a façade that we can:

* Unit-test in isolation (mock `db`, not the HTTP framework).
* Optimise centrally (add `EXPLAIN`-driven hints, swap to materialised
  views, attach Redis caching).
* Rewrite for read replicas later without touching every controller.

The current scaffolding ships with `employees.repo.ts`,
`attendance.repo.ts`, `leave.repo.ts`, and `audit.repo.ts`. New modules
should follow the same pattern.

---

## 9. Phase-2 follow-ups

These were intentionally **not** done in this pass:

1. **Drop `uq_users_email_global_ci`** once the auth flow accepts a
   tenant selector at login. Today, login does
   `where(eq(users.email, lowercase)).limit(1)`, which would return an
   arbitrary row if the email existed in two tenants.
2. **Consolidate `audit_logs` and `activity_logs`.** They overlap in
   purpose; pick one schema and migrate the other away.
3. **Drop `employees.manager_name`** snapshot column once UI exclusively
   resolves the manager via `reporting_to → employees` join.
4. **Validate `chk_leave_requests_days_positive`** after the data team
   backfills legacy zero-day rows.
5. **Apply repository pattern** to leave, payroll, recruitment, assets,
   notifications, dashboard. Move query code out of `*.service.ts`
   incrementally.
6. **Frontend keyset adoption.** AttendancePage and EmployeeDetailPage
   are updated; remaining list pages still pull a single page.
   Convert them when next touched.
