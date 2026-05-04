-- Add blue/green slot tracking to applications
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS listen_port  int  NULL,
  ADD COLUMN IF NOT EXISTS active_slot  text NULL CHECK (active_slot IN ('blue','green'));

CREATE INDEX IF NOT EXISTS idx_applications_slot ON applications (active_slot) WHERE active_slot IS NOT NULL;
