-- Add unique company_code to tenants.
-- Nullable so existing rows are unaffected; backfilled below.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "company_code" text;
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_company_code_unique" UNIQUE("company_code");

-- Backfill existing tenants: derive a best-effort 4-char code from the name.
-- Uses initials of each word, uppercased, padded/truncated to 4 chars.
-- A suffix loop handles any collisions that arise during the one-time backfill.
DO $$
DECLARE
    rec RECORD;
    base_code TEXT;
    candidate TEXT;
    suffix INT;
BEGIN
    FOR rec IN SELECT id, name FROM tenants WHERE company_code IS NULL LOOP
        -- Build initials (e.g. "Prop CRM" -> "PCRM", "HRHub" -> "HRH")
        base_code := UPPER(
            SUBSTRING(
                REGEXP_REPLACE(
                    ARRAY_TO_STRING(
                        ARRAY(SELECT SUBSTRING(word FROM 1 FOR 1)
                              FROM UNNEST(STRING_TO_ARRAY(TRIM(rec.name), ' ')) AS word
                              WHERE TRIM(word) != ''),
                        ''
                    ),
                    '[^A-Z0-9]', '', 'g'
                ),
                1, 4
            )
        );
        IF LENGTH(base_code) < 2 THEN
            base_code := UPPER(SUBSTRING(REGEXP_REPLACE(rec.name, '[^A-Za-z0-9]', '', 'g'), 1, 4));
        END IF;
        -- Pad to 4 chars with X if still short
        WHILE LENGTH(base_code) < 4 LOOP
            base_code := base_code || 'X';
        END LOOP;
        candidate := base_code;
        suffix := 1;
        WHILE EXISTS (SELECT 1 FROM tenants WHERE company_code = candidate) LOOP
            candidate := SUBSTRING(base_code, 1, 3) || suffix::TEXT;
            suffix := suffix + 1;
        END LOOP;
        UPDATE tenants SET company_code = candidate WHERE id = rec.id;
    END LOOP;
END $$;
