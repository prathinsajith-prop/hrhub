-- Add doc_number column to documents.
-- Stores the identifier printed on the document itself
-- (visa number, Emirates ID, passport number, etc.)
ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "doc_number" text;
