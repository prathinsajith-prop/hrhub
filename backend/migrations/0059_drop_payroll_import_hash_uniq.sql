-- Drop the file-hash uniqueness constraint on payroll_adjustment_imports.
--
-- The previous behaviour was: same file bytes + same period → 409 Conflict.
-- We replaced that with row-level comparison inside bulkCreateAdjustments:
-- re-uploading the same file is now a no-op (every row is `unchanged`) rather
-- than a hard rejection. HR can intentionally re-upload to confirm state, and
-- the comparison engine handles the diff per row.
--
-- The `file_hash` column itself is kept — useful as a forensic checksum and
-- doesn't cost anything to keep populated. Just no uniqueness constraint.

DROP INDEX IF EXISTS "uq_payroll_adj_imports_dedupe";
