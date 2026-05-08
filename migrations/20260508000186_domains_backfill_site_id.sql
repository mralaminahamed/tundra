-- Backfill site_id on existing domains where apex matches a site's primary_domain
UPDATE domains
SET site_id = s.id
FROM sites s
WHERE domains.apex = s.primary_domain
  AND domains.site_id IS NULL;
