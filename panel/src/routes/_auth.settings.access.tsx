import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'

export const Route = createFileRoute('/_auth/settings/access')({
  component: AccessPage,
})

interface SecuritySettings {
  session_timeout_minutes?: number | null
  require_totp?: boolean
  ip_allowlist?: string[]
  acme_email?: string | null
  acme_directory?: string
}

const INPUT = 'w-full rounded-lg border border-tundra-ink-200 bg-white px-3.5 py-2.5 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20'
const LABEL = 'block text-sm font-medium text-tundra-ink-700 mb-1.5'

function SectionCard({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-tundra-ink">{title}</h3>
        {desc && <p className="mt-0.5 text-xs text-tundra-ink-400">{desc}</p>}
      </div>
      <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange, label, desc }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  desc?: string
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <div className="relative mt-0.5 shrink-0">
        <input type="checkbox" checked={checked} onChange={(e) => { onChange(e.target.checked) }} className="sr-only" />
        <div className={`w-9 h-5 rounded-full transition-colors ${checked ? 'bg-tundra-lichen' : 'bg-tundra-ink-200'}`} />
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </div>
      <div>
        <p className="text-sm font-medium text-tundra-ink">{label}</p>
        {desc && <p className="text-xs text-tundra-ink-400 mt-0.5">{desc}</p>}
      </div>
    </label>
  )
}

function AccessPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'security'],
    queryFn: () => api<{ data: SecuritySettings }>('/settings/security'),
  })

  const s = data?.data ?? {}

  const [sessionTimeout, setSessionTimeout] = useState('480')
  const [requireTotp,    setRequireTotp]    = useState(false)
  const [ipAllowlist,    setIpAllowlist]    = useState('')
  const [acmeEmail,      setAcmeEmail]      = useState('')
  const [acmeDir,        setAcmeDir]        = useState('letsencrypt')

  useEffect(() => {
    if (!data) return
    setSessionTimeout(String(s.session_timeout_minutes ?? 480))
    setRequireTotp(s.require_totp ?? false)
    setIpAllowlist((s.ip_allowlist ?? []).join('\n'))
    setAcmeEmail(s.acme_email ?? '')
    setAcmeDir(s.acme_directory ?? 'letsencrypt')
  }, [data])

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/settings/security', { method: 'PATCH', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings', 'security'] })
      toast.success('Access settings saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const ips = ipAllowlist.split('\n').map((l) => l.trim()).filter(Boolean)
    saveMut.mutate({
      session_timeout_minutes: sessionTimeout ? parseInt(sessionTimeout, 10) : 480,
      require_totp: requireTotp,
      ip_allowlist: ips,
      acme_email: acmeEmail.trim() || null,
      acme_directory: acmeDir,
    })
  }

  if (isLoading) {
    return <div className="h-64 rounded-xl bg-tundra-ink-100 animate-pulse" />
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <SectionCard title="Session policy">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Session timeout (minutes)</label>
            <input
              type="number"
              value={sessionTimeout}
              onChange={(e) => { setSessionTimeout(e.target.value) }}
              min={5}
              max={10080}
              placeholder="480"
              className={INPUT}
            />
            <p className="mt-1 text-xs text-tundra-ink-400">Idle sessions are signed out after this duration. Default: 480 min (8 h).</p>
          </div>
        </div>
        <div className="mt-4">
          <Toggle
            checked={requireTotp}
            onChange={setRequireTotp}
            label="Require TOTP for all operators"
            desc="Operators without TOTP enabled will be prompted to set it up on next sign-in."
          />
        </div>
      </SectionCard>

      <SectionCard title="IP allowlist" desc="One CIDR or IP per line. Leave empty to allow all IPs.">
        <textarea
          value={ipAllowlist}
          onChange={(e) => { setIpAllowlist(e.target.value) }}
          rows={5}
          placeholder={'192.168.1.0/24\n10.0.0.0/8\n203.0.113.42'}
          className={`${INPUT} font-mono text-xs resize-y`}
        />
        <p className="mt-1 text-xs text-tundra-ink-400">
          Applies to all panel and API access. Make sure your own IP is included before saving.
        </p>
      </SectionCard>

      <SectionCard title="SSL / ACME" desc="Used by the automatic Let's Encrypt certificate provisioner.">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>ACME account email</label>
            <input
              type="email"
              value={acmeEmail}
              onChange={(e) => { setAcmeEmail(e.target.value) }}
              placeholder="ops@example.com"
              className={INPUT}
            />
            <p className="mt-1 text-xs text-tundra-ink-400">Receives expiry warnings from Let's Encrypt.</p>
          </div>
          <div>
            <label className={LABEL}>Certificate authority</label>
            <select value={acmeDir} onChange={(e) => { setAcmeDir(e.target.value) }} className={INPUT}>
              <option value="letsencrypt">Let's Encrypt (production)</option>
              <option value="letsencrypt_staging">Let's Encrypt (staging)</option>
              <option value="zerossl">ZeroSSL</option>
            </select>
          </div>
        </div>
      </SectionCard>

      <div className="flex justify-end gap-3">
        <button
          type="submit"
          disabled={saveMut.isPending}
          className="rounded-lg bg-tundra-lichen px-5 py-2.5 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-40 transition-colors"
        >
          {saveMut.isPending ? 'Saving…' : 'Save access settings'}
        </button>
      </div>
    </form>
  )
}
