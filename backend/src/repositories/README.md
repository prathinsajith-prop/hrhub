# Repository layer

This folder is the new home for **all SQL knowledge** in the backend.
Service files (`backend/src/modules/<feature>/*.service.ts`) used to mix
business logic with raw Drizzle queries. As the codebase grew this caused
duplication (e.g. multiple ways to fetch "active employees in tenant X")
and made it hard to add cross-cutting concerns like tenant isolation,
soft-delete filtering, or query-result caching.

Going forward:

* **Repositories** own all `db.select(...)`, `db.insert(...)`, `db.update(...)` calls.
* They expose **typed, intent-revealing functions** like `employeesRepo.listActive(tenantId, opts)`.
* Repositories return DTOs — never half-built query builders — so they can be
  cached, mocked in tests, and called from workers/jobs without dragging the
  whole HTTP request context.
* Cross-cutting concerns (`tenantFilter`, `notDeleted`, keyset pagination,
  `withTenantContext` for RLS) come from `backend/src/lib/query-helpers.ts`.

## Migration plan

1. New code lives here from day one.
2. Existing services are migrated incrementally, module by module, when
   touched for unrelated reasons.
3. Each repo has at least one focused unit test under
   `backend/src/__tests__/repositories/`.

## Conventions

* One file per aggregate root (e.g. `employees.repo.ts`, `attendance.repo.ts`).
* Functions are exported individually (no class wrappers) so they tree-shake.
* Inputs that affect query shape go in a single typed `opts` argument.
* Outputs use a stable result envelope for paginated data:
  ```ts
  { items: T[]; nextCursor: string | null; total?: number }
  ```
