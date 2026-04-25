-- Add step_id FK to documents (links a doc to an onboarding step)
ALTER TABLE "documents"
    ADD COLUMN IF NOT EXISTS "step_id" uuid REFERENCES "onboarding_steps"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_documents_step" ON "documents" ("step_id");
