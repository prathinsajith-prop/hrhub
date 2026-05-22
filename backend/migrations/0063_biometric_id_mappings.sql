-- Biometric / external ID → employee mapping.
--
-- See backend/src/db/schema/biometric_id_mappings.ts for the rationale.
-- Soft-deleted (deletedAt) so punch history that references mapper ids
-- stays auditable even after HR removes the link.
--
-- The mapper_id unique index is *partial* — it only enforces uniqueness on
-- live rows (deleted_at IS NULL) so HR can re-use the same external ID
-- after retiring an old mapping (e.g. when a new employee takes over a
-- device slot).

CREATE TABLE IF NOT EXISTS "biometric_id_mappings" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "mapper_id" text NOT NULL,
    "label" text,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "chk_biometric_mappings_mapper_id_nonempty"
        CHECK (length(trim("mapper_id")) > 0)
);

CREATE INDEX IF NOT EXISTS "idx_biometric_mappings_tenant"
    ON "biometric_id_mappings"("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_biometric_mappings_employee"
    ON "biometric_id_mappings"("tenant_id", "employee_id");

-- Partial unique index: only enforce on live (non-soft-deleted) rows.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_biometric_mappings_mapper"
    ON "biometric_id_mappings"("tenant_id", "mapper_id")
    WHERE "deleted_at" IS NULL;
