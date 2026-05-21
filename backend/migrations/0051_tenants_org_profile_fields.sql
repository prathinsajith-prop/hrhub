-- Organization Profile schema corrections.
--
-- 1. `jurisdiction` was a misnomer — the column stores values
--    'mainland' / 'freezone', which are UAE *business types*, not legal
--    jurisdictions (Dubai/Abu Dhabi/Sharjah, etc). The signup page already
--    labels it "Business Type". Rename the column to match the semantics so
--    future readers don't mis-extend it.
--
-- 2. Add the three missing Organization Profile fields surfaced in the UI:
--    address, company_email, company_website. The `phone` column already
--    exists (added during signup), it just wasn't surfaced — the frontend
--    will start rendering it as "Company Phone".

ALTER TABLE tenants RENAME COLUMN jurisdiction TO business_type;

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS address text,
    ADD COLUMN IF NOT EXISTS company_email text,
    ADD COLUMN IF NOT EXISTS company_website text;
