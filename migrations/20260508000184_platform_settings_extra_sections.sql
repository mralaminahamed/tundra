-- Seed extra settings sections added in v1.1
INSERT INTO platform_settings (section) VALUES
    ('branding'),
    ('dns'),
    ('defaults'),
    ('security_policy')
ON CONFLICT (section) DO NOTHING;
