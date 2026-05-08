-- Extend operator profiles with contact and preference fields.
ALTER TABLE operators
    ADD COLUMN IF NOT EXISTS phone      text NULL,
    ADD COLUMN IF NOT EXISTS timezone   text NOT NULL DEFAULT 'UTC',
    ADD COLUMN IF NOT EXISTS job_title  text NULL;
