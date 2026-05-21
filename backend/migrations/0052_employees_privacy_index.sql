-- Expression index for the `searchableInDirectory` directory filter.
--
-- After migration 0050 added `employees.privacy_overrides jsonb`, the new
-- listEmployees SQL filter does:
--
--   WHERE COALESCE((privacy_overrides ->> 'searchableInDirectory')::boolean, true) = true
--
-- For tenants with thousands of employees this jsonb-key expression triggers
-- a sequential scan on every directory query. The index below precomputes
-- the boolean so the planner can index-scan and skip hidden rows.
--
-- The partial predicate (`WHERE is_archived = false`) keeps the index small
-- and aligned with the listEmployees default WHERE clause.

CREATE INDEX IF NOT EXISTS idx_employees_directory_searchable
    ON employees (
        tenant_id,
        (COALESCE((privacy_overrides ->> 'searchableInDirectory')::boolean, true))
    )
    WHERE is_archived = false;
