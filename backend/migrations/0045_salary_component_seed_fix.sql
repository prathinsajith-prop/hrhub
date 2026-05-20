-- Fix the Housing seed default — it was seeded as `percentage_of_basic` with
-- amount=25, which combined with migration 0044's backfill (which copied
-- legacy AED amounts) produced absurd payroll totals: a 1500 AED housing
-- assignment was being interpreted as "1500% of basic".
--
-- The intended UX is: catalog says "Housing Allowance is a flat AED amount,
-- set per employee". HR who wants percentage-of-basic logic for housing can
-- toggle the catalog row from the UI. The seed default is flat so the
-- backfill values land correctly.
--
-- Idempotent — only updates seeded rows that still match the old defaults.

UPDATE salary_components
   SET calculation_type = 'flat',
       amount = NULL,
       updated_at = now()
 WHERE kind = 'earning'
   AND category = 'housing'
   AND calculation_type = 'percentage_of_basic'
   AND is_system = false;
