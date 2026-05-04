-- MFA and passkey challenges.
-- Sessions gain mfa_pending: password verified but TOTP not yet confirmed.
-- Short-lived passkey challenges prevent replay attacks (5-min TTL).

ALTER TABLE sessions ADD COLUMN mfa_pending bool NOT NULL DEFAULT false;

-- Short-lived passkey challenges (prevent replay, 5-min TTL).
CREATE TABLE passkey_challenges (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  challenge   bytea       NOT NULL,
  operator_id uuid        NULL REFERENCES operators(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '5 minutes'
);
CREATE INDEX idx_passkey_challenges_expires ON passkey_challenges (expires_at);
