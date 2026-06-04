-- Candidate photo extracted from the résumé (or uploaded with the application).
-- Stored as an S3 key under tenants/<tenantId>/...; served via a presigned URL
-- (resolveAvatarUrl) as `candidate.avatar` in the recruitment list/kanban.
ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "avatar_url" text;
