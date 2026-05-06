import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'

export const Route = createFileRoute('/_auth/sites/$siteId/ssl')({
  component: SiteSslTab,
})

function SiteSslTab() {
  const [forceHttps, setForceHttps] = useState(true)
  const [hstsEnabled, setHstsEnabled] = useState(false)

  function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
      <div className="flex items-start justify-between gap-4 py-3">
        <div>
          <p className="text-sm font-medium text-tundra-ink">{label}</p>
          {desc && <p className="text-xs text-tundra-ink-400">{desc}</p>}
        </div>
        <Switch checked={checked} onChange={onChange} />
      </div>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Certificate status */}
      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
        <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Certificate</span>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-tundra-lichen-200 bg-tundra-lichen-50 p-4">
            <svg className="h-8 w-8 text-tundra-lichen-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <div>
              <p className="font-semibold text-tundra-lichen-800">Certificate active</p>
              <p className="text-xs text-tundra-lichen-600">Let's Encrypt · Valid for 87 days</p>
            </div>
          </div>

          {[
            { label: 'Issuer',    value: "Let's Encrypt" },
            { label: 'Expires',   value: 'Aug 11, 2025' },
            { label: 'Algorithm', value: 'RSA 2048' },
            { label: 'SANs',      value: '1 domain' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between border-b border-tundra-ink-100 py-2 text-sm last:border-0">
              <span className="text-tundra-ink-400">{label}</span>
              <span className="font-medium text-tundra-ink">{value}</span>
            </div>
          ))}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => toast.info('Renewal coming soon')}
              className="flex-1 rounded-lg border border-tundra-ink-200 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
              Renew now
            </button>
            <button type="button" onClick={() => toast.info('Certificate download coming soon')}
              className="flex-1 rounded-lg border border-tundra-ink-200 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
              Download
            </button>
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">HTTPS Settings</span>
          </div>
          <div className="divide-y divide-tundra-ink-100 px-4">
            <Toggle label="Force HTTPS" desc="Redirect all HTTP traffic to HTTPS automatically"
              checked={forceHttps} onChange={(v) => { setForceHttps(v); toast.success(`Force HTTPS ${v ? 'enabled' : 'disabled'}`) }} />
            <Toggle label="HSTS" desc="Strict Transport Security — instructs browsers to only use HTTPS"
              checked={hstsEnabled} onChange={(v) => { setHstsEnabled(v); toast.success(`HSTS ${v ? 'enabled' : 'disabled'}`) }} />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Custom Certificate</span>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-tundra-ink-400">Upload your own certificate and private key to replace the auto-issued Let's Encrypt certificate.</p>
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Certificate (PEM)</label>
              <textarea rows={3} placeholder="-----BEGIN CERTIFICATE-----"
                className="w-full resize-none rounded-lg border border-tundra-ink-200 px-3 py-2 font-mono text-xs focus:border-tundra-lichen focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Private Key (PEM)</label>
              <textarea rows={3} placeholder="-----BEGIN PRIVATE KEY-----"
                className="w-full resize-none rounded-lg border border-tundra-ink-200 px-3 py-2 font-mono text-xs focus:border-tundra-lichen focus:outline-none" />
            </div>
            <button type="button" onClick={() => toast.info('Custom certificate upload coming soon')}
              className="w-full rounded-lg bg-tundra-lichen py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
              Install certificate
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
