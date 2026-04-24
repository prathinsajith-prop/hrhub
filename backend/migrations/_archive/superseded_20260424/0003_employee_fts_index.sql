-- Full-text search GIN index on employees
-- Enables fast search across first_name, last_name, email, employee_no, designation
-- Uses PostgreSQL GIN index on tsvector expression — replaces ILIKE sequential scans

CREATE INDEX IF NOT EXISTS idx_employees_fts
    ON employees
    USING gin (
        to_tsvector(
            'simple',
            coalesce(first_name, '') || ' ' ||
            coalesce(last_name, '')  || ' ' ||
            coalesce(email, '')      || ' ' ||
            coalesce(employee_no, '') || ' ' ||
            coalesce(designation, '')
        )
    );
