import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'

export const Route = createFileRoute('/_auth/settings/security-policy')({
  component: SecurityPolicyPage,
})

interface SecurityPolicySettings {
  password_min_length?: number | null
  password_require_uppercase?: boolean
  password_require_number?: boolean
  password_require_special?: boolean
  max_login_attempts?: number | null
  lockout_duration_minutes?: number | null
  lockout_whitelist?: string[]
  allow_operator_self_register?: boolean
  require_email_verification?: boolean
  maintenance_mode?: boolean
  maintenance_message?: string | null
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

function Toggle({ checked, onChange, label, desc, warn }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string; warn?: boolean }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <div className="relative mt-0.5 shrink-0">
        <input type="checkbox" checked={checked} onChange={(e) => { onChange(e.target.checked) }} className="sr-only" />
        <div className={`w-9 h-5 rounded-full transition-colors ${checked ? (warn ? 'bg-tundra-rust' : 'bg-tundra-lichen') : 'bg-tundra-ink-200'}`} />
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </div>
      <div>
        <p className={`text-sm font-medium ${warn && checked ? 'text-tundra-rust' : 'text-tundra-ink'}`}>{label}</p>
        {desc && <p className="text-xs text-tundra-ink-400 mt-0.5">{desc}</p>}
      </div>
    </label>
  )
}

function SecurityPolicyPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'security_policy'],
    queryFn: () => api<{ data: SecurityPolicySettings }>('/settings/security_policy'),
  })
  const s = data?.data ?? {}

  const [minLength,       setMinLength]       = useState('12')
  const [reqUpper,        setReqUpper]        = useState(true)
  const [reqNumber,       setReqNumber]       = useState(true)
  const [reqSpecial,      setReqSpecial]      = useState(false)
  const [maxAttempts,     setMaxAttempts]     = useState('10')
  const [lockoutMins,     setLockoutMins]     = useState('30')
  const [whitelist,       setWhitelist]       = useState('')
  const [selfRegister,    setSelfRegister]    = useState(false)
  const [emailVerify,     setEmailVerify]     = useState(true)
  const [maintenance,     setMaintenance]     = useState(false)
  const [maintMessage,    setMaintMessage]    = useState('')

  useEffect(() => {
    if (!data) return
    setMinLength(String(s.password_min_length ?? 12))
    setReqUpper(s.password_require_uppercase ?? true)
    setReqNumber(s.password_require_number ?? true)
    setReqSpecial(s.password_require_special ?? false)
    setMaxAttempts(String(s.max_login_attempts ?? 10))
    setLockoutMins(String(s.lockout_duration_minutes ?? 30))
    setWhitelist((s.lockout_whitelist ?? []).join('\n'))
    setSelfRegister(s.allow_operator_self_register ?? false)
    setEmailVerify(s.require_email_verification ?? true)
    setMaintenance(s.maintenance_mode ?? false)
    setMaintMessage(s.maintenance_message ?? '')
  }, [data])

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api('/settings/security_policy', { method: 'PATCH', body }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['settings', 'security_policy'] }); toast.success('Security policy saved') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const ips = whitelist.split('\n').map((l) => l.trim()).filter(Boolean)
    saveMut.mutate({
      password_min_length: parseInt(minLength, 10) || 12,
      password_require_uppercase: reqUpper,
      password_require_number: reqNumber,
      password_require_special: reqSpecial,
      max_login_attempts: parseInt(maxAttempts, 10) || 10,
      lockout_duration_minutes: parseInt(lockoutMins, 10) || 30,
      lockout_whitelist: ips,
      allow_operator_self_register: selfRegister,
      require_email_verification: emailVerify,
      maintenance_mode: maintenance,
      maintenance_message: maintMessage.trim() || null,
    })
  }

  if (isLoading) return <div className="h-48 rounded-xl bg-tundra-ink-100 animate-pulse" />

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <SectionCard title="Password policy" desc="Applies to all operators at next password change.">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Minimum length</label>
            <input type="number" value={minLength} onChange={(e) => { setMinLength(e.target.value) }}
              min={6} max={128} placeholder="12" className={INPUT} />
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <Toggle checked={reqUpper}   onChange={setReqUpper}   label="Require uppercase letter"  desc="At least one A–Z character." />
          <Toggle checked={reqNumber}  onChange={setReqNumber}  label="Require number"             desc="At least one 0–9 digit." />
          <Toggle checked={reqSpecial} onChange={setReqSpecial} label="Require special character"  desc="At least one !@#$%^&* etc." />
        </div>
      </SectionCard>

      <SectionCard title="Brute-force protection" desc="Locks out IPs that fail login too many times.">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Max failed attempts</label>
            <input type="number" value={maxAttempts} onChange={(e) => { setMaxAttempts(e.target.value) }}
              min={1} max={100} placeholder="10" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Lockout duration (minutes)</label>
            <input type="number" value={lockoutMins} onChange={(e) => { setLockoutMins(e.target.value) }}
              min={1} placeholder="30" className={INPUT} />
          </div>
          <div className="col-span-2">
            <label className={LABEL}>IP whitelist <span className="text-xs font-normal text-tundra-ink-400">(one CIDR or IP per line — exempt from lockout)</span></label>
            <textarea value={whitelist} onChange={(e) => { setWhitelist(e.target.value) }} rows={3}
              placeholder={'127.0.0.1\n10.0.0.0/8'}
              className={`${INPUT} font-mono text-xs resize-y`} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Registration">
        <div className="space-y-4">
          <Toggle checked={selfRegister} onChange={setSelfRegister}
            label="Allow operator self-registration"
            desc="When enabled, anyone with the panel URL can create an account. Disable for invite-only access." />
          <Toggle checked={emailVerify} onChange={setEmailVerify}
            label="Require email verification"
            desc="New operators must verify their email before gaining access. Requires SMTP to be configured." />
        </div>
      </SectionCard>

      <SectionCard title="Maintenance mode" desc="Puts the panel in read-only mode and displays a message to operators.">
        <div className="space-y-4">
          <Toggle checked={maintenance} onChange={setMaintenance} warn
            label="Maintenance mode active"
            desc="All write operations are blocked. Operators see the maintenance message on sign-in." />
          {maintenance && (
            <div>
              <label className={LABEL}>Maintenance message</label>
              <textarea value={maintMessage} onChange={(e) => { setMaintMessage(e.target.value) }} rows={2}
                placeholder="System maintenance in progress. Back at 14:00 UTC."
                className={`${INPUT} resize-y`} />
            </div>
          )}
        </div>
      </SectionCard>

      <div className="flex justify-end gap-3">
        <button type="submit" disabled={saveMut.isPending}
          className="rounded-lg bg-tundra-lichen px-5 py-2.5 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-40 transition-colors">
          {saveMut.isPending ? 'Saving…' : 'Save security policy'}
        </button>
      </div>
    </form>
  )
}
