-- Data hygiene: normalise the invalid (basic + percentage_of_basic) combination.
--
-- A basic-category earning can't logically be a percentage of basic — what's
-- it a percentage of? The resolver has always treated such rows as flat AED
-- (defensive), and we just added a creation-time validation in
-- `salary-components.service.ts` to reject the combination going forward.
--
-- This migration cleans up any legacy rows that slipped through before the
-- validation existed: anything with kind='earning' AND category='basic' AND
-- calculation_type='percentage_of_basic' gets flipped to flat. No amount
-- change — the resolver was already treating it as flat, so the math
-- doesn't shift.

UPDATE salary_components
SET calculation_type = 'flat',
    updated_at = NOW()
WHERE kind = 'earning'
  AND category = 'basic'
  AND calculation_type = 'percentage_of_basic';
