-- Link domains to a site (nullable — a domain may exist without a site)
ALTER TABLE domains ADD COLUMN site_id uuid NULL REFERENCES sites(id) ON DELETE SET NULL;
CREATE INDEX idx_domains_site_id ON domains (site_id) WHERE site_id IS NOT NULL;
