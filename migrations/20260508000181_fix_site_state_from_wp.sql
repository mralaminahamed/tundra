-- Sync sites.status for WordPress installs that finished provisioning
-- but left the parent site stuck in 'provisioning'.
UPDATE sites s
SET    status = i.state, updated_at = now()
FROM   plugin_wordpress_installations i
WHERE  s.id = i.site_id
  AND  s.status = 'provisioning'
  AND  i.state IN ('active', 'error');
