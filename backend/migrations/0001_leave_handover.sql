ALTER TABLE "leave_requests"
    ADD COLUMN IF NOT EXISTS "handover_to" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS "handover_notes" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leave_handover_to" ON "leave_requests" ("handover_to") WHERE "handover_to" IS NOT NULL;
