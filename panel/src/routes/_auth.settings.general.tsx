import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'

export const Route = createFileRoute('/_auth/settings/general')({
  component: GeneralPage,
})

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

interface GeneralSettings {
  platform_name?: string | null
  default_timezone?: string
  default_locale?: string
  date_format?: string
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

function GeneralPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'general'],
    queryFn: () => api<{ section: string; data: GeneralSettings }>('/settings/general'),
  })

  const s = data?.data ?? {}

  const [platformName, setPlatformName] = useState('')
  const [timezone,     setTimezone]     = useState('UTC')
  const [locale,       setLocale]       = useState('en')
  const [dateFormat,   setDateFormat]   = useState('relative')

  useEffect(() => {
    if (!data) return
    setPlatformName(s.platform_name ?? '')
    setTimezone(s.default_timezone ?? 'UTC')
    setLocale(s.default_locale ?? 'en')
    setDateFormat(s.date_format ?? 'relative')
  }, [data])

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/settings/general', { method: 'PATCH', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings', 'general'] })
      toast.success('Settings saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  const isDirty = data && (
    platformName !== (s.platform_name ?? '') ||
    timezone     !== (s.default_timezone ?? 'UTC') ||
    locale       !== (s.default_locale ?? 'en') ||
    dateFormat   !== (s.date_format ?? 'relative')
  )

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    saveMut.mutate({
      platform_name:    platformName.trim() || null,
      default_timezone: timezone,
      default_locale:   locale,
      date_format:      dateFormat,
    })
  }

  function handleDiscard() {
    setPlatformName(s.platform_name ?? '')
    setTimezone(s.default_timezone ?? 'UTC')
    setLocale(s.default_locale ?? 'en')
    setDateFormat(s.date_format ?? 'relative')
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2].map((i) => <div key={i} className="h-32 rounded-xl bg-tundra-ink-100" />)}
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <SectionCard title="Platform identity">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={LABEL}>Platform name</label>
            <input
              value={platformName}
              onChange={(e) => { setPlatformName(e.target.value) }}
              placeholder="Tundra"
              className={INPUT}
            />
            <p className="mt-1 text-xs text-tundra-ink-400">Shown in emails, browser tab title, and notifications.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Locale &amp; display">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Default timezone</label>
            <select value={timezone} onChange={(e) => { setTimezone(e.target.value) }} className={INPUT}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-tundra-ink-400">System default for cron, deployment windows, alerts.</p>
          </div>
          <div>
            <label className={LABEL}>Default language</label>
            <select value={locale} onChange={(e) => { setLocale(e.target.value) }} className={INPUT}>
              {LOCALES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-tundra-ink-400">Default for new operators. Operators can override individually.</p>
          </div>
          <div>
            <label className={LABEL}>Date display format</label>
            <select value={dateFormat} onChange={(e) => { setDateFormat(e.target.value) }} className={INPUT}>
              <option value="relative">Relative (2 hours ago)</option>
              <option value="absolute">Absolute (2026-05-08 14:30)</option>
            </select>
          </div>
        </div>
      </SectionCard>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          disabled={!isDirty || saveMut.isPending}
          onClick={handleDiscard}
          className="rounded-lg border border-tundra-ink-200 px-5 py-2.5 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-40 transition-colors"
        >
          Discard
        </button>
        <button
          type="submit"
          disabled={!isDirty || saveMut.isPending}
          className="rounded-lg bg-tundra-lichen px-5 py-2.5 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-40 transition-colors"
        >
          {saveMut.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
