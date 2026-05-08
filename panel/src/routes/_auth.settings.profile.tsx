import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

export const Route = createFileRoute('/_auth/settings/profile')({
  component: ProfilePage,
})

interface OperatorProfile {
  id: string
  email: string
  full_name: string
  role: string
  phone: string | null
  timezone: string
  job_title: string | null
  preferred_locale: string
  has_totp: boolean
  last_login_at: string | null
  created_at: string
}

const TIMEZONES = [
  'UTC',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'America/Sao_Paulo',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
  'Europe/Rome', 'Europe/Amsterdam', 'Europe/Stockholm', 'Europe/Warsaw',
  'Europe/Istanbul', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Dhaka',
  'Asia/Bangkok', 'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo',
  'Asia/Seoul', 'Australia/Sydney', 'Pacific/Auckland',
]

const LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
  { value: 'ar', label: 'العربية' },
]

function fmtLogin(iso: string | null) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString()
}

function ProfilePage() {
  const qc = useQueryClient()
  const setOperator = useAuthStore((s) => s.setOperator)

  const { data, isLoading } = useQuery({
    queryKey: ['operators', 'me'],
    queryFn: () => api<OperatorProfile>('/operators/me'),
  })

  const [fullName,   setFullName]   = useState('')
  const [email,      setEmail]      = useState('')
  const [phone,      setPhone]      = useState('')
  const [timezone,   setTimezone]   = useState('UTC')
  const [jobTitle,   setJobTitle]   = useState('')
  const [locale,     setLocale]     = useState('en')

  useEffect(() => {
    if (!data) return
    setFullName(data.full_name ?? '')
    setEmail(data.email ?? '')
    setPhone(data.phone ?? '')
    setTimezone(data.timezone ?? 'UTC')
    setJobTitle(data.job_title ?? '')
    setLocale(data.preferred_locale ?? 'en')
  }, [data])

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<OperatorProfile>('/operators/me', { method: 'PATCH', body }),
    onSuccess: (updated) => {
      void qc.invalidateQueries({ queryKey: ['operators', 'me'] })
      // Sync name/email in auth store so sidebar shows updated info
      setOperator({
        id: updated.id,
        email: updated.email,
        full_name: updated.full_name,
        role: updated.role as 'owner' | 'admin' | 'operator' | 'readonly',
      })
      toast.success('Profile saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    saveMut.mutate({
      full_name:        fullName || undefined,
      email:            email || undefined,
      phone:            phone.trim() || null,
      timezone:         timezone || undefined,
      job_title:        jobTitle.trim() || null,
      preferred_locale: locale || undefined,
    })
  }

  const isDirty = data && (
    fullName  !== (data.full_name ?? '') ||
    email     !== (data.email ?? '') ||
    phone     !== (data.phone ?? '') ||
    timezone  !== (data.timezone ?? 'UTC') ||
    jobTitle  !== (data.job_title ?? '') ||
    locale    !== (data.preferred_locale ?? 'en')
  )

  const INPUT = 'w-full rounded-lg border border-tundra-ink-200 bg-white px-3.5 py-2.5 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20'
  const LABEL = 'block text-sm font-medium text-tundra-ink-700 mb-1.5'

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-6 animate-pulse">
        {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-tundra-ink-100" />)}
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-tundra-ink">My profile</h1>
        <p className="mt-0.5 text-sm text-tundra-ink-500">Personal info and preferences for your account.</p>
      </div>

      {/* Avatar + meta */}
      <div className="flex items-center gap-4 rounded-xl border border-tundra-ink-200 bg-white p-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-tundra-lichen-100 text-xl font-bold text-tundra-lichen-800 select-none">
          {(data?.full_name ?? '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-tundra-ink truncate">{data?.full_name || '—'}</p>
          <p className="text-sm text-tundra-ink-500 truncate">{data?.email}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-tundra-lichen-200 bg-tundra-lichen-100 px-2 py-0.5 text-xs font-medium text-tundra-lichen-800 capitalize">
              {data?.role}
            </span>
            {data?.has_totp && (
              <span className="inline-flex items-center gap-1 text-xs text-tundra-lichen-700">
                <span className="h-1.5 w-1.5 rounded-full bg-tundra-lichen" />
                TOTP enabled
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-tundra-ink-400">Last sign in</p>
          <p className="text-xs font-medium text-tundra-ink-600">{fmtLogin(data?.last_login_at ?? null)}</p>
          <p className="mt-1 text-xs text-tundra-ink-400">Member since</p>
          <p className="text-xs font-medium text-tundra-ink-600">
            {data?.created_at ? new Date(data.created_at).toLocaleDateString() : '—'}
          </p>
        </div>
      </div>

      {/* Edit form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Identity */}
        <div className="rounded-xl border border-tundra-ink-200 bg-white overflow-hidden">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-5 py-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Identity</span>
          </div>
          <div className="p-5 grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Full name</label>
              <input value={fullName} onChange={(e) => { setFullName(e.target.value) }}
                required placeholder="Alice Smith" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Email address</label>
              <input type="email" value={email} onChange={(e) => { setEmail(e.target.value) }}
                required placeholder="alice@example.com" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Job title <span className="text-tundra-ink-400 font-normal">(optional)</span></label>
              <input value={jobTitle} onChange={(e) => { setJobTitle(e.target.value) }}
                placeholder="DevOps Engineer" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Phone <span className="text-tundra-ink-400 font-normal">(optional — for alert notifications)</span></label>
              <input type="tel" value={phone} onChange={(e) => { setPhone(e.target.value) }}
                placeholder="+1 555 000 0000" className={INPUT} />
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div className="rounded-xl border border-tundra-ink-200 bg-white overflow-hidden">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-5 py-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Preferences</span>
          </div>
          <div className="p-5 grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Timezone</label>
              <select value={timezone} onChange={(e) => { setTimezone(e.target.value) }}
                className={INPUT}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-tundra-ink-400">Used for cron expressions, deployment windows and alert times.</p>
            </div>
            <div>
              <label className={LABEL}>Language</label>
              <select value={locale} onChange={(e) => { setLocale(e.target.value) }}
                className={INPUT}>
                {LOCALES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Security summary — links to Security tab */}
        <div className="rounded-xl border border-tundra-ink-200 bg-white overflow-hidden">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-5 py-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Security</span>
          </div>
          <div className="p-5 flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-tundra-ink">Password &amp; two-factor auth</p>
              <p className="text-xs text-tundra-ink-400">Manage passkeys, TOTP, and account security.</p>
            </div>
            <a
              href="/settings/security"
              className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
            >
              Security settings →
            </a>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              if (data) {
                setFullName(data.full_name ?? '')
                setEmail(data.email ?? '')
                setPhone(data.phone ?? '')
                setTimezone(data.timezone ?? 'UTC')
                setJobTitle(data.job_title ?? '')
                setLocale(data.preferred_locale ?? 'en')
              }
            }}
            disabled={!isDirty || saveMut.isPending}
            className="rounded-lg border border-tundra-ink-200 px-5 py-2.5 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-40 transition-colors"
          >
            Discard
          </button>
          <button
            type="submit"
            disabled={!isDirty || saveMut.isPending}
            className="rounded-lg bg-tundra-lichen px-5 py-2.5 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-40 transition-colors"
          >
            {saveMut.isPending ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </div>
  )
}
