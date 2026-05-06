import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Toggle } from '@/components/wp-shared'

export const Route = createFileRoute('/_auth/wordpress/$installId/security')({
  component: WpSecurityTab,
})

function WpSecurityTab() {
  const { installId } = Route.useParams()
  const [maintenance, setMaintenance] = useState(false)
  const [debugMode, setDebugMode] = useState(false)
  const [searchIndexing, setSearchIndexing] = useState(true)
  const [hotlinkProtection, setHotlinkProtection] = useState(false)
  const [passwordProtection, setPasswordProtection] = useState(false)
  const [twoFactor, setTwoFactor] = useState(false)

  const patchSetting = (key: string, value: boolean) => {
    void api(`/wordpress/installations/${installId}/settings`, {
      method: 'PATCH',
      body: { [key]: value },
    }).catch(() => null)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Site Visibility &amp; Access</span>
          </div>
          <div className="divide-y divide-tundra-ink-100 px-4">
            <Toggle label="Search Engine Indexing" description="Allow search engines to crawl and index this site"
              checked={searchIndexing} onChange={(v) => { setSearchIndexing(v); patchSetting('search_indexing', v) }} />
            <Toggle label="Maintenance Mode" description="Show a maintenance page to visitors while you work"
              checked={maintenance} onChange={(v) => { setMaintenance(v); patchSetting('maintenance_mode', v) }} />
            <Toggle label="Password Protection" description="Require a password to view the site (HTTP basic auth)"
              checked={passwordProtection} onChange={(v) => { setPasswordProtection(v); patchSetting('password_protection', v) }} />
            <Toggle label="Hotlink Protection" description="Prevent other sites from embedding your images"
              checked={hotlinkProtection} onChange={(v) => { setHotlinkProtection(v); patchSetting('hotlink_protection', v) }} />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Developer Settings</span>
          </div>
          <div className="divide-y divide-tundra-ink-100 px-4">
            <Toggle label="WordPress Debug Mode" description="Enable WP_DEBUG — only for development environments"
              checked={debugMode} onChange={(v) => { setDebugMode(v); patchSetting('debug_mode', v) }} />
            <Toggle label="Two-Factor Authentication" description="Require 2FA for all WordPress admin accounts"
              checked={twoFactor} onChange={(v) => { setTwoFactor(v); patchSetting('two_factor', v) }} />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Security Scans</span>
          </div>
          <div className="divide-y divide-tundra-ink-100">
            {[
              {
                label: 'File Integrity Check',
                desc: 'Verify core files against WordPress.org checksums',
                action: 'Scan',
                icon: <svg className="h-4 w-4 text-tundra-lichen-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>,
              },
              {
                label: 'Malware Scan',
                desc: 'Scan all PHP files for malicious code',
                action: 'Scan',
                icon: <svg className="h-4 w-4 text-tundra-lichen-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>,
              },
              {
                label: 'Check User Permissions',
                desc: 'Detect accounts with unexpected admin privileges',
                action: 'Check',
                icon: <svg className="h-4 w-4 text-tundra-lichen-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
              },
              {
                label: 'Brute Force Log',
                desc: 'Review failed login attempts and blocked IPs',
                action: 'View',
                icon: <svg className="h-4 w-4 text-tundra-lichen-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
              },
            ].map(({ label, desc, action, icon }) => (
              <div key={label} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-start gap-3">
                  {icon}
                  <div>
                    <p className="text-sm font-medium text-tundra-ink">{label}</p>
                    <p className="text-xs text-tundra-ink-400">{desc}</p>
                  </div>
                </div>
                <button type="button" onClick={() => toast.info(`${label} coming soon`)}
                  className="shrink-0 rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                  {action}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-tundra-lichen-200 bg-tundra-lichen-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="h-4 w-4 text-tundra-lichen-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span className="text-sm font-semibold text-tundra-lichen-800">SSL Certificate</span>
          </div>
          <p className="text-xs text-tundra-lichen-700 mb-3">
            Force HTTPS redirects and manage your TLS certificate from here.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => toast.info('Force HTTPS coming soon')}
              className="flex-1 rounded-lg border border-tundra-lichen-300 bg-white py-1.5 text-xs font-medium text-tundra-lichen-700 hover:bg-tundra-lichen-100 transition-colors">
              Force HTTPS
            </button>
            <button type="button" onClick={() => toast.info('SSL renewal coming soon')}
              className="flex-1 rounded-lg bg-tundra-lichen py-1.5 text-xs font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
              Renew Certificate
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
