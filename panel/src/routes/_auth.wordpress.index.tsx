import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { fmtDate } from '@/lib/utils'
import { Dialog } from '@/components/ui/dialog'

export const Route = createFileRoute('/_auth/wordpress/')({
  component: WordPressPage,
})

interface WpInstallation {
  id: string
  site_id: string
  wp_version: string | null
  wp_path: string
  site_title: string | null
  site_url: string | null
  admin_email: string | null
  state: 'provisioning' | 'active' | 'error' | 'removing'
  error_message: string | null
  created_at: string
}

interface Site {
  id: string
  name: string
  primary_domain: string
}

interface InstallPayload {
  site_id: string
  installation_path: string
  site_title: string
  site_description: string
  wp_version: string
  language: string
  admin_username: string
  admin_password: string
  admin_email: string
  db_prefix: string
  multisite: boolean
  auto_updates: 'disabled' | 'minor' | 'all'
  send_email: boolean
}

function StatePill({ state }: { state: WpInstallation['state'] }) {
  const map: Record<string, string> = {
    provisioning: 'border-tundra-aurora-300 bg-tundra-aurora-50 text-tundra-aurora-800',
    active:       'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-800',
    error:        'border-red-300 bg-red-50 text-red-800',
    removing:     'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-500',
  }
  const dot: Record<string, string> = {
    provisioning: 'bg-tundra-aurora animate-pulse',
    active:       'bg-tundra-lichen',
    error:        'bg-red-500',
    removing:     'bg-tundra-ink-300',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[state] ?? ''}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot[state] ?? ''}`} />
      {state}
    </span>
  )
}

// ── Password strength ─────────────────────────────────────────────────────────

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: '' }
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { score, label: 'Weak', color: 'bg-red-500' }
  if (score <= 2) return { score, label: 'Fair', color: 'bg-yellow-500' }
  if (score <= 3) return { score, label: 'Good', color: 'bg-tundra-aurora' }
  return { score, label: 'Strong', color: 'bg-tundra-lichen' }
}

function generatePassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()'
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ── Step components ───────────────────────────────────────────────────────────

function StepIndicator({ step, total }: { step: number; total: number }) {
  const labels = ['Site & Location', 'WordPress Setup', 'Admin Account']
  return (
    <div className="flex items-center gap-0">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1
        const done = n < step
        const active = n === step
        return (
          <div key={n} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                done    ? 'bg-tundra-lichen text-white' :
                active  ? 'bg-[#21759B] text-white' :
                          'border-2 border-tundra-ink-200 text-tundra-ink-300'
              }`}>
                {done ? (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : n}
              </div>
              <span className={`text-xs font-medium ${active ? 'text-tundra-ink' : 'text-tundra-ink-400'}`}>
                {labels[i]}
              </span>
            </div>
            {i < total - 1 && (
              <div className={`mx-2 mb-4 h-0.5 flex-1 transition-colors ${done ? 'bg-tundra-lichen' : 'bg-tundra-ink-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between">
      <label className="block text-sm font-medium text-tundra-ink">{label}</label>
      {hint && <span className="text-xs text-tundra-ink-400">{hint}</span>}
    </div>
  )
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm placeholder:text-tundra-ink-300 focus:border-[#21759B] focus:outline-none focus:ring-1 focus:ring-[#21759B] ${props.className ?? ''}`}
    />
  )
}

// ── Step 1: Site & Location ───────────────────────────────────────────────────

function Step1({
  sites,
  form,
  setForm,
}: {
  sites: Site[]
  form: Partial<InstallPayload>
  setForm: (p: Partial<InstallPayload>) => void
}) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () => sites.filter((s) =>
      !search ||
      s.primary_domain.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase()),
    ),
    [sites, search],
  )

  return (
    <div className="space-y-5">
      {/* Site selector */}
      <div>
        <FieldLabel label="Website / Domain" hint={`${sites.length} sites`} />
        <div className="relative mb-2">
          <svg className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="search"
            placeholder="Search domains…"
            value={search}
            onChange={(e) => { setSearch(e.target.value) }}
            className="w-full rounded-lg border border-tundra-ink-200 py-2 pl-9 pr-3 text-sm placeholder:text-tundra-ink-300 focus:border-[#21759B] focus:outline-none focus:ring-1 focus:ring-[#21759B]"
          />
        </div>
        <div className="max-h-52 overflow-y-auto rounded-lg border border-tundra-ink-200">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-tundra-ink-400">No sites found.</div>
          ) : (
            filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { setForm({ ...form, site_id: s.id }) }}
                className={`flex w-full items-center gap-3 border-b border-tundra-ink-100 px-4 py-2.5 text-left text-sm transition-colors last:border-0 ${
                  form.site_id === s.id
                    ? 'bg-[#21759B]/5 text-tundra-ink'
                    : 'hover:bg-tundra-ink-50 text-tundra-ink'
                }`}
              >
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  form.site_id === s.id ? 'border-[#21759B] bg-[#21759B]' : 'border-tundra-ink-300'
                }`}>
                  {form.site_id === s.id && (
                    <span className="h-2 w-2 rounded-full bg-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{s.primary_domain}</p>
                  <p className="text-xs text-tundra-ink-400 truncate">{s.name}</p>
                </div>
                {form.site_id === s.id && (
                  <svg className="h-4 w-4 text-[#21759B] shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Installation path */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1">
          <FieldLabel label="Protocol" />
          <select
            value="https://"
            disabled
            className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm text-tundra-ink-500 focus:outline-none"
          >
            <option>https://</option>
          </select>
        </div>
        <div className="col-span-2">
          <FieldLabel label="Installation Directory" hint="leave empty for root" />
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-tundra-ink-300">/</span>
            <Input
              type="text"
              placeholder="blog"
              value={(form.installation_path ?? '').replace(/^\//, '')}
              onChange={(e) => { setForm({ ...form, installation_path: e.target.value ? `/${e.target.value}` : '/' }) }}
              className="pl-6"
            />
          </div>
        </div>
      </div>

      {/* Preview URL */}
      {form.site_id && (
        <div className="rounded-lg bg-tundra-ink-50 px-4 py-2.5">
          <p className="text-xs text-tundra-ink-400">Installation URL preview</p>
          <p className="mt-0.5 font-mono text-sm text-tundra-ink">
            https://{sites.find((s) => s.id === form.site_id)?.primary_domain ?? '…'}{form.installation_path && form.installation_path !== '/' ? form.installation_path : ''}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Step 2: WordPress Setup ───────────────────────────────────────────────────

const WP_VERSIONS = [
  { value: 'latest',  label: '6.7.2 (Latest)' },
  { value: '6.6.2',   label: '6.6.2' },
  { value: '6.5.5',   label: '6.5.5' },
  { value: '6.4.3',   label: '6.4.3' },
]
const LANGUAGES = [
  { code: 'en_US', label: 'English (US)' },
  { code: 'en_GB', label: 'English (UK)' },
  { code: 'de_DE', label: 'German' },
  { code: 'fr_FR', label: 'French' },
  { code: 'es_ES', label: 'Spanish' },
  { code: 'pt_BR', label: 'Portuguese (Brazil)' },
  { code: 'it_IT', label: 'Italian' },
  { code: 'nl_NL', label: 'Dutch' },
  { code: 'ja',    label: 'Japanese' },
  { code: 'zh_CN', label: 'Chinese (Simplified)' },
]

function Step2({
  form,
  setForm,
}: {
  form: Partial<InstallPayload>
  setForm: (p: Partial<InstallPayload>) => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel label="WordPress Version" />
          <select
            value={form.wp_version ?? 'latest'}
            onChange={(e) => { setForm({ ...form, wp_version: e.target.value }) }}
            className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-[#21759B] focus:outline-none"
          >
            {WP_VERSIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel label="Language" />
          <select
            value={form.language ?? 'en_US'}
            onChange={(e) => { setForm({ ...form, language: e.target.value }) }}
            className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-[#21759B] focus:outline-none"
          >
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <FieldLabel label="Site Title" />
        <Input
          type="text"
          placeholder="My WordPress Site"
          value={form.site_title ?? ''}
          onChange={(e) => { setForm({ ...form, site_title: e.target.value }) }}
        />
      </div>

      <div>
        <FieldLabel label="Site Description" hint="optional" />
        <Input
          type="text"
          placeholder="Just another WordPress site"
          value={form.site_description ?? ''}
          onChange={(e) => { setForm({ ...form, site_description: e.target.value }) }}
        />
      </div>

      {/* Advanced section */}
      <div className="rounded-xl border border-tundra-ink-200">
        <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Advanced Options</span>
        </div>
        <div className="divide-y divide-tundra-ink-100 px-4">
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-tundra-ink">Database Table Prefix</p>
              <p className="text-xs text-tundra-ink-400">Change default wp_ to improve security</p>
            </div>
            <Input
              type="text"
              value={form.db_prefix ?? 'wp_'}
              onChange={(e) => { setForm({ ...form, db_prefix: e.target.value }) }}
              className="!w-28 text-center font-mono"
            />
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-tundra-ink">WordPress Multisite</p>
              <p className="text-xs text-tundra-ink-400">Enable network of sites (WPMU)</p>
            </div>
            <Switch
              checked={form.multisite ?? false}
              onChange={(v) => { setForm({ ...form, multisite: v }) }}
            />
          </div>
          <div className="py-3">
            <p className="mb-2 text-sm font-medium text-tundra-ink">WordPress Core Auto-Updates</p>
            <div className="flex gap-1">
              {(['disabled', 'minor', 'all'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setForm({ ...form, auto_updates: v }) }}
                  className={`flex-1 rounded-lg border py-1.5 text-xs font-medium capitalize transition-colors ${
                    (form.auto_updates ?? 'minor') === v
                      ? 'border-[#21759B] bg-[#21759B] text-white'
                      : 'border-tundra-ink-200 text-tundra-ink-500 hover:border-[#21759B]'
                  }`}
                >
                  {v === 'minor' ? 'Minor only' : v}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Step 3: Admin Account ─────────────────────────────────────────────────────

function Step3({
  form,
  setForm,
}: {
  form: Partial<InstallPayload>
  setForm: (p: Partial<InstallPayload>) => void
}) {
  const [showPw, setShowPw] = useState(false)
  const strength = passwordStrength(form.admin_password ?? '')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel label="Admin Username" />
          <Input
            type="text"
            placeholder="admin"
            autoComplete="username"
            value={form.admin_username ?? ''}
            onChange={(e) => { setForm({ ...form, admin_username: e.target.value }) }}
          />
        </div>
        <div>
          <FieldLabel label="Admin Email" />
          <Input
            type="email"
            placeholder="admin@example.com"
            autoComplete="email"
            value={form.admin_email ?? ''}
            onChange={(e) => { setForm({ ...form, admin_email: e.target.value }) }}
          />
        </div>
      </div>

      <div>
        <FieldLabel label="Admin Password" />
        <div className="relative">
          <Input
            type={showPw ? 'text' : 'password'}
            placeholder="••••••••••••"
            autoComplete="new-password"
            value={form.admin_password ?? ''}
            onChange={(e) => { setForm({ ...form, admin_password: e.target.value }) }}
            className="pr-20"
          />
          <div className="absolute right-2 top-1.5 flex gap-1">
            <button
              type="button"
              title="Generate strong password"
              onClick={() => { setForm({ ...form, admin_password: generatePassword() }); setShowPw(true) }}
              className="rounded px-1.5 py-1 text-tundra-ink-400 hover:bg-tundra-ink-100 hover:text-tundra-ink transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </button>
            <button
              type="button"
              onClick={() => { setShowPw(!showPw) }}
              className="rounded px-1.5 py-1 text-tundra-ink-400 hover:bg-tundra-ink-100 hover:text-tundra-ink transition-colors"
            >
              {showPw ? (
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/>
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Strength meter */}
        {form.admin_password && (
          <div className="mt-2">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i <= Math.ceil((strength.score / 5) * 4) ? strength.color : 'bg-tundra-ink-100'
                  }`}
                />
              ))}
            </div>
            <p className={`mt-1 text-xs font-medium ${
              strength.label === 'Weak' ? 'text-red-500' :
              strength.label === 'Fair' ? 'text-yellow-600' :
              strength.label === 'Good' ? 'text-tundra-aurora' :
              'text-tundra-lichen-600'
            }`}>
              {strength.label} password
            </p>
          </div>
        )}
      </div>

      {/* Notifications section */}
      <div className="rounded-xl border border-tundra-ink-200">
        <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Notifications</span>
        </div>
        <div className="px-4">
          <label className="flex cursor-pointer items-start gap-3 py-3">
            <input
              type="checkbox"
              checked={form.send_email ?? true}
              onChange={(e) => { setForm({ ...form, send_email: e.target.checked }) }}
              className="mt-0.5 h-4 w-4 rounded border-tundra-ink-300 accent-[#21759B]"
            />
            <div>
              <p className="text-sm font-medium text-tundra-ink">Email installation details</p>
              <p className="text-xs text-tundra-ink-400">
                Send credentials and login URL to {form.admin_email || 'the admin email'}
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-xl border border-tundra-ink-100 bg-tundra-ink-50 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Installation Summary</p>
        <div className="space-y-1 text-xs text-tundra-ink-500">
          <p><span className="font-medium text-tundra-ink">Version:</span> {WP_VERSIONS.find((v) => v.value === (form.wp_version ?? 'latest'))?.label ?? 'Latest'}</p>
          <p><span className="font-medium text-tundra-ink">Language:</span> {LANGUAGES.find((l) => l.code === (form.language ?? 'en_US'))?.label ?? 'English (US)'}</p>
          <p><span className="font-medium text-tundra-ink">DB Prefix:</span> <span className="font-mono">{form.db_prefix ?? 'wp_'}</span></p>
          <p><span className="font-medium text-tundra-ink">Multisite:</span> {form.multisite ? 'Enabled' : 'Disabled'}</p>
          <p><span className="font-medium text-tundra-ink">Auto-Updates:</span> {form.auto_updates ?? 'minor'}</p>
        </div>
      </div>
    </div>
  )
}

// ── Install wizard modal ──────────────────────────────────────────────────────

function InstallModal({
  sites,
  onClose,
  onInstall,
  isPending,
}: {
  sites: Site[]
  onClose: () => void
  onInstall: (payload: InstallPayload) => void
  isPending: boolean
}) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<Partial<InstallPayload>>({
    installation_path: '/',
    wp_version: 'latest',
    language: 'en_US',
    db_prefix: 'wp_',
    auto_updates: 'minor',
    multisite: false,
    send_email: true,
  })

  const canNext1 = !!form.site_id
  const canNext2 = !!(form.site_title)
  const canSubmit = !!(form.admin_username && form.admin_password && form.admin_email)

  const handleSubmit = () => {
    if (!canSubmit) return
    onInstall(form as InstallPayload)
  }

  return (
    <Dialog open onClose={onClose} maxWidth="max-w-2xl" className="rounded-2xl border border-tundra-ink-200 p-0 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-tundra-ink-100 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#21759B]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="white">
              <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm-1.5 14.5l-3-8.5c.5.1.9.1 1.3.1.5 0 1-.05 1-.05l1.2 3.5 1.3-3.6c.5.05.9.1 1.4.1.1 0 .2 0 .3-.01l-3 8.5-1.5-.05zm4.5 0l-1.3-3.8 2.8-7.7c.5 1.1.8 2.4.8 3.7 0 3.05-1.65 5.7-4 7l1.7.8z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-tundra-ink">Install WordPress</h2>
            <p className="text-xs text-tundra-ink-400">Step {step} of 3</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-tundra-ink-400 hover:bg-tundra-ink-100 hover:text-tundra-ink transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Step indicator */}
      <div className="border-b border-tundra-ink-100 px-6 py-4">
        <StepIndicator step={step} total={3} />
      </div>

      {/* Body */}
      <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
        {step === 1 && <Step1 sites={sites} form={form} setForm={setForm} />}
        {step === 2 && <Step2 form={form} setForm={setForm} />}
        {step === 3 && <Step3 form={form} setForm={setForm} />}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-tundra-ink-100 px-6 py-4">
        <button
          type="button"
          onClick={step === 1 ? onClose : () => { setStep(step - 1) }}
          className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
        >
          {step === 1 ? 'Cancel' : '← Back'}
        </button>

        <div className="flex items-center gap-2">
          {/* Dot progress */}
          <div className="flex gap-1.5 mr-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-4 bg-[#21759B]' : i < step ? 'w-1.5 bg-tundra-lichen' : 'w-1.5 bg-tundra-ink-200'
              }`} />
            ))}
          </div>

          {step < 3 ? (
            <button
              type="button"
              disabled={step === 1 ? !canNext1 : !canNext2}
              onClick={() => { setStep(step + 1) }}
              className="rounded-lg bg-[#21759B] px-5 py-2 text-sm font-medium text-white hover:bg-[#1a6284] disabled:opacity-40 transition-colors"
            >
              Next →
            </button>
          ) : (
            <button
              type="button"
              disabled={!canSubmit || isPending}
              onClick={handleSubmit}
              className="rounded-lg bg-[#21759B] px-5 py-2 text-sm font-medium text-white hover:bg-[#1a6284] disabled:opacity-40 transition-colors"
            >
              {isPending ? 'Installing…' : 'Install WordPress'}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  )
}

type SortKey = 'site_title' | 'wp_version' | 'state' | 'created_at'
type SortDir = 'asc' | 'desc'
type ViewMode = 'list' | 'grid'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

function WpLogo({ size = 32 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-lg bg-[#21759B]"
    >
      <svg viewBox="0 0 24 24" style={{ width: size * 0.57, height: size * 0.57 }} fill="white">
        <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm-1.5 14.5l-3-8.5c.5.1.9.1 1.3.1.5 0 1-.05 1-.05l1.2 3.5 1.3-3.6c.5.05.9.1 1.4.1.1 0 .2 0 .3-.01l-3 8.5-1.5-.05zm4.5 0l-1.3-3.8 2.8-7.7c.5 1.1.8 2.4.8 3.7 0 3.05-1.65 5.7-4 7l1.7.8z" />
      </svg>
    </div>
  )
}

function Pagination({
  total,
  page,
  pageSize,
  onPage,
  onPageSize,
}: {
  total: number
  page: number
  pageSize: number
  onPage: (p: number) => void
  onPageSize: (n: number) => void
}) {
  const totalPages = Math.ceil(total / pageSize)
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  const pages = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (page <= 4) return [1, 2, 3, 4, 5, '…', totalPages]
    if (page >= totalPages - 3) return [1, '…', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [1, '…', page - 1, page, page + 1, '…', totalPages]
  }, [page, totalPages])

  if (total === 0) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-tundra-ink-100 bg-tundra-ink-50 px-4 py-3">
      {/* Count + page size */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-tundra-ink-500">
          Showing <span className="font-medium text-tundra-ink">{from}–{to}</span> of{' '}
          <span className="font-medium text-tundra-ink">{total}</span>
        </span>
        <div className="flex items-center gap-1.5 text-xs text-tundra-ink-400">
          <span>Show:</span>
          {PAGE_SIZE_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => { onPageSize(n); onPage(1) }}
              className={`rounded px-2 py-0.5 font-medium transition-colors ${
                pageSize === n
                  ? 'bg-[#21759B] text-white'
                  : 'text-tundra-ink-500 hover:bg-tundra-ink-200'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Page navigation */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => { onPage(1) }}
            className="rounded border border-tundra-ink-200 px-2 py-1 text-xs font-medium text-tundra-ink-500 hover:bg-tundra-ink-100 disabled:opacity-40 transition-colors"
            title="First page"
          >
            «
          </button>
          <button
            type="button"
            disabled={page === 1}
            onClick={() => { onPage(page - 1) }}
            className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-500 hover:bg-tundra-ink-100 disabled:opacity-40 transition-colors"
          >
            ‹ Prev
          </button>

          {pages.map((p, i) =>
            p === '…' ? (
              <span key={`e${i}`} className="px-1.5 text-xs text-tundra-ink-300">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => { onPage(p as number) }}
                className={`min-w-[28px] rounded border px-2 py-1 text-xs font-medium transition-colors ${
                  p === page
                    ? 'border-[#21759B] bg-[#21759B] text-white'
                    : 'border-tundra-ink-200 text-tundra-ink-500 hover:bg-tundra-ink-100'
                }`}
              >
                {p}
              </button>
            ),
          )}

          <button
            type="button"
            disabled={page === totalPages}
            onClick={() => { onPage(page + 1) }}
            className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-500 hover:bg-tundra-ink-100 disabled:opacity-40 transition-colors"
          >
            Next ›
          </button>
          <button
            type="button"
            disabled={page === totalPages}
            onClick={() => { onPage(totalPages) }}
            className="rounded border border-tundra-ink-200 px-2 py-1 text-xs font-medium text-tundra-ink-500 hover:bg-tundra-ink-100 disabled:opacity-40 transition-colors"
            title="Last page"
          >
            »
          </button>
        </div>
      )}
    </div>
  )
}

function WordPressPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')
  const [filterState, setFilterState] = useState<string>('')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [view, setView] = useState<ViewMode>('list')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { data: installs = [], isLoading } = useQuery<WpInstallation[]>({
    queryKey: ['wp-installations'],
    queryFn: () =>
      fetch('/api/v1/wordpress/installations')
        .then((r) => r.json())
        .then((r: { data: WpInstallation[] }) => r.data),
  })

  const { data: sites = [] } = useQuery<Site[]>({
    queryKey: ['sites-list'],
    queryFn: () =>
      fetch('/api/v1/sites')
        .then((r) => r.json())
        .then((r: { data: Site[] }) => r.data),
    enabled: showModal,
  })

  const installMutation = useMutation({
    mutationFn: (body: InstallPayload) => {
      // Normalize version: "6.7.2 (Latest)" → "latest", "6.6.2" → "6.6.2"
      const rawVersion = body.wp_version ?? ''
      const wp_version = rawVersion.includes('Latest') ? 'latest' : rawVersion.split(' ')[0]

      const apiBody = {
        site_id:       body.site_id,
        wp_path:       body.installation_path ?? '/',   // field rename: installation_path → wp_path
        wp_version,
        site_title:    body.site_title,
        admin_user:    body.admin_username,             // field rename: admin_username → admin_user
        admin_email:   body.admin_email,
        admin_password: body.admin_password,
        db_prefix:     body.db_prefix,
        language:      body.language,
        multisite:     body.multisite,
      }
      return fetch('/api/v1/wordpress/installations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiBody),
        credentials: 'include',
      }).then((r) => {
        if (!r.ok) return r.json().then((e) => { throw new Error(e?.message ?? 'Install failed') })
        return r.json() as Promise<{ id: string; state: string }>
      })
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['wp-installations'] })
      setShowModal(false)
      toast.success('WordPress installation started')
      void navigate({ to: '/wordpress/$installId', params: { installId: data.id } })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Installation failed'),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/v1/wordpress/installations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-installations'] })
    },
  })

  // derive filtered + sorted + paginated list
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return installs
      .filter((i) => {
        if (filterState && i.state !== filterState) return false
        if (q && !(i.site_title ?? '').toLowerCase().includes(q) && !(i.site_url ?? '').toLowerCase().includes(q) && !i.wp_path.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        const aVal = a[sortKey] ?? ''
        const bVal = b[sortKey] ?? ''
        const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true })
        return sortDir === 'asc' ? cmp : -cmp
      })
  }, [installs, search, filterState, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const allOnPageSelected = paginated.length > 0 && paginated.every((i) => selected.has(i.id))

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  function toggleAll() {
    if (allOnPageSelected) {
      setSelected((s) => { const n = new Set(s); paginated.forEach((i) => n.delete(i.id)); return n })
    } else {
      setSelected((s) => { const n = new Set(s); paginated.forEach((i) => n.add(i.id)); return n })
    }
  }

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? (
      <svg className="h-3 w-3 text-tundra-ink-200" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M8 9l4-4 4 4M8 15l4 4 4-4"/>
      </svg>
    ) : sortDir === 'asc' ? (
      <svg className="h-3 w-3 text-[#21759B]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M12 5l-7 7h14z"/>
      </svg>
    ) : (
      <svg className="h-3 w-3 text-[#21759B]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M12 19l7-7H5z"/>
      </svg>
    )

  const counts = {
    total: installs.length,
    active: installs.filter((i) => i.state === 'active').length,
    provisioning: installs.filter((i) => i.state === 'provisioning').length,
    error: installs.filter((i) => i.state === 'error').length,
  }

  return (
    <div className="p-6">
      {showModal && (
        <InstallModal
          sites={sites}
          isPending={installMutation.isPending}
          onClose={() => { setShowModal(false) }}
          onInstall={(payload) => { installMutation.mutate(payload) }}
        />
      )}

      {/* Header */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-tundra-ink">WordPress</h1>
          <p className="mt-0.5 text-sm text-tundra-ink-400">
            Manage all WordPress installations across your sites
          </p>
        </div>
        <button
          onClick={() => { setShowModal(true) }}
          className="flex items-center gap-2 rounded-lg bg-[#21759B] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a6284] transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Install WordPress
        </button>
      </div>

      {/* Stat pills */}
      {installs.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {[
            { label: 'Total', value: counts.total, active: !filterState, onClick: () => { setFilterState(''); setPage(1) } },
            { label: 'Active', value: counts.active, active: filterState === 'active', onClick: () => { setFilterState(filterState === 'active' ? '' : 'active'); setPage(1) } },
            { label: 'Provisioning', value: counts.provisioning, active: filterState === 'provisioning', onClick: () => { setFilterState(filterState === 'provisioning' ? '' : 'provisioning'); setPage(1) }, hidden: counts.provisioning === 0 },
            { label: 'Error', value: counts.error, active: filterState === 'error', onClick: () => { setFilterState(filterState === 'error' ? '' : 'error'); setPage(1) }, hidden: counts.error === 0, danger: true },
          ].filter((c) => !c.hidden).map(({ label, value, active, onClick, danger }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-left transition-colors ${
                active
                  ? danger ? 'border-red-300 bg-red-50' : 'border-[#21759B]/30 bg-[#21759B]/5'
                  : 'border-tundra-ink-200 bg-white hover:bg-tundra-ink-50'
              }`}
            >
              <span className={`text-xl font-bold tabular-nums ${danger ? 'text-red-600' : active ? 'text-[#21759B]' : 'text-tundra-ink'}`}>{value}</span>
              <span className="text-xs text-tundra-ink-400">{label}</span>
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-tundra-ink-100" />)}
        </div>
      ) : installs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-tundra-ink-200 p-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#21759B]/10">
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="#21759B">
              <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm-1.5 14.5l-3-8.5c.5.1.9.1 1.3.1.5 0 1-.05 1-.05l1.2 3.5 1.3-3.6c.5.05.9.1 1.4.1.1 0 .2 0 .3-.01l-3 8.5-1.5-.05zm4.5 0l-1.3-3.8 2.8-7.7c.5 1.1.8 2.4.8 3.7 0 3.05-1.65 5.7-4 7l1.7.8z"/>
            </svg>
          </div>
          <p className="text-base font-semibold text-tundra-ink">No WordPress installations yet</p>
          <p className="mt-1 text-sm text-tundra-ink-400">Install WordPress on any of your sites in under a minute.</p>
          <button onClick={() => { setShowModal(true) }}
            className="mt-4 rounded-lg bg-[#21759B] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1a6284] transition-colors">
            Install WordPress
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            {/* Search */}
            <div className="relative">
              <svg className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                type="search"
                placeholder="Search sites, URLs, paths…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="h-8 w-52 rounded-lg border border-tundra-ink-200 bg-white pl-8 pr-3 text-xs focus:border-[#21759B] focus:outline-none focus:ring-1 focus:ring-[#21759B]"
              />
            </div>

            {/* State filter chips */}
            <div className="flex gap-1">
              {(['active', 'provisioning', 'error', 'removing'] as const).map((st) => {
                const cnt = installs.filter((i) => i.state === st).length
                if (cnt === 0) return null
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => { setFilterState(filterState === st ? '' : st); setPage(1) }}
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize transition-colors ${
                      filterState === st
                        ? 'border-[#21759B] bg-[#21759B] text-white'
                        : 'border-tundra-ink-200 text-tundra-ink-500 hover:border-[#21759B] hover:text-[#21759B]'
                    }`}
                  >
                    {st} ({cnt})
                  </button>
                )
              })}
              {filterState && (
                <button
                  type="button"
                  onClick={() => { setFilterState(''); setPage(1) }}
                  className="rounded-full border border-tundra-ink-200 px-2.5 py-0.5 text-xs text-tundra-ink-400 hover:bg-tundra-ink-100 transition-colors"
                >
                  Clear ×
                </button>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              {/* Sort */}
              <select
                value={`${sortKey}:${sortDir}`}
                onChange={(e) => {
                  const [k, d] = e.target.value.split(':') as [SortKey, SortDir]
                  setSortKey(k); setSortDir(d); setPage(1)
                }}
                className="h-8 rounded-lg border border-tundra-ink-200 bg-white px-2 text-xs text-tundra-ink-600 focus:outline-none"
              >
                <option value="created_at:desc">Newest first</option>
                <option value="created_at:asc">Oldest first</option>
                <option value="site_title:asc">Title A→Z</option>
                <option value="site_title:desc">Title Z→A</option>
                <option value="wp_version:desc">WP version ↓</option>
                <option value="state:asc">State</option>
              </select>

              {/* View toggle */}
              <div className="flex rounded-lg border border-tundra-ink-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => { setView('list') }}
                  title="List view"
                  className={`px-2.5 py-1.5 transition-colors ${view === 'list' ? 'bg-[#21759B] text-white' : 'bg-white text-tundra-ink-400 hover:bg-tundra-ink-50'}`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => { setView('grid') }}
                  title="Grid view"
                  className={`border-l border-tundra-ink-200 px-2.5 py-1.5 transition-colors ${view === 'grid' ? 'bg-[#21759B] text-white' : 'bg-white text-tundra-ink-400 hover:bg-tundra-ink-50'}`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                    <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 border-b border-tundra-ink-100 bg-[#21759B]/5 px-4 py-2">
              <span className="text-sm font-medium text-tundra-ink">{selected.size} selected</span>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Remove ${selected.size} installation(s)?`)) {
                    selected.forEach((id) => { removeMutation.mutate(id) })
                    setSelected(new Set())
                  }
                }}
                className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                Remove selected
              </button>
              <button
                type="button"
                onClick={() => { setSelected(new Set()) }}
                className="ml-auto text-xs text-tundra-ink-400 hover:text-tundra-ink"
              >
                Clear selection
              </button>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-tundra-ink-400">
              No installations match the current filters.{' '}
              <button type="button" onClick={() => { setSearch(''); setFilterState(''); setPage(1) }}
                className="font-medium text-[#21759B] hover:underline">
                Clear filters
              </button>
            </div>
          ) : view === 'list' ? (
            <>
              <table className="w-full text-sm">
                <thead className="border-b border-tundra-ink-100 text-xs text-tundra-ink-400">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleAll}
                        className="h-3.5 w-3.5 rounded border-tundra-ink-300 accent-[#21759B]"
                      />
                    </th>
                    <th className="px-4 py-3 text-left">
                      <button type="button" onClick={() => { toggleSort('site_title') }}
                        className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors">
                        Site / URL <SortIcon k="site_title" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left">
                      <button type="button" onClick={() => { toggleSort('wp_version') }}
                        className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors">
                        WP Version <SortIcon k="wp_version" />
                      </button>
                    </th>
                    <th className="hidden px-4 py-3 text-left font-semibold uppercase tracking-wide md:table-cell">Path</th>
                    <th className="px-4 py-3 text-left">
                      <button type="button" onClick={() => { toggleSort('state') }}
                        className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors">
                        State <SortIcon k="state" />
                      </button>
                    </th>
                    <th className="hidden px-4 py-3 text-left font-semibold uppercase tracking-wide lg:table-cell">
                      <button type="button" onClick={() => { toggleSort('created_at') }}
                        className="flex items-center gap-1 hover:text-tundra-ink transition-colors">
                        Installed <SortIcon k="created_at" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tundra-ink-100">
                  {paginated.map((inst) => (
                    <tr key={inst.id}
                      className={`group transition-colors ${selected.has(inst.id) ? 'bg-[#21759B]/5' : 'hover:bg-tundra-ink-50'}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(inst.id)}
                          onChange={() => {
                            setSelected((s) => {
                              const n = new Set(s)
                              n.has(inst.id) ? n.delete(inst.id) : n.add(inst.id)
                              return n
                            })
                          }}
                          className="h-3.5 w-3.5 rounded border-tundra-ink-300 accent-[#21759B]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <WpLogo size={32} />
                          <div className="min-w-0">
                            <Link
                              to="/wordpress/$installId"
                              params={{ installId: inst.id }}
                              className="block truncate font-semibold text-tundra-ink hover:text-[#21759B] transition-colors"
                            >
                              {inst.site_title ?? inst.site_id.slice(0, 16)}
                            </Link>
                            {inst.site_url && (
                              <a href={inst.site_url} target="_blank" rel="noopener noreferrer"
                                className="truncate text-xs text-tundra-aurora hover:underline">
                                {inst.site_url} ↗
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-tundra-ink-500">
                        {inst.wp_version ? (
                          <span className="rounded-full border border-tundra-ink-100 bg-tundra-ink-50 px-2 py-0.5 font-mono text-xs">
                            {inst.wp_version}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="hidden px-4 py-3 font-mono text-xs text-tundra-ink-400 md:table-cell">
                        {inst.wp_path}
                      </td>
                      <td className="px-4 py-3">
                        <StatePill state={inst.state} />
                        {inst.error_message && (
                          <p className="mt-0.5 max-w-[12rem] truncate text-xs text-red-500" title={inst.error_message}>
                            {inst.error_message}
                          </p>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-tundra-ink-400 lg:table-cell whitespace-nowrap">
                        {fmtDate(inst.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {inst.site_url && (
                            <a href={`${inst.site_url}/wp-admin`} target="_blank" rel="noopener noreferrer"
                              title="Open WP Admin"
                              className="rounded-lg border border-[#21759B]/30 px-2.5 py-1 text-xs font-medium text-[#21759B] hover:bg-[#21759B]/5 transition-colors">
                              WP Admin
                            </a>
                          )}
                          <Link
                            to="/wordpress/$installId"
                            params={{ installId: inst.id }}
                            className="rounded-lg border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
                          >
                            Manage →
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Mark this installation for removal? Files and database will be deleted on the next agent sync.')) {
                                removeMutation.mutate(inst.id)
                              }
                            }}
                            title="Remove"
                            className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                total={filtered.length}
                page={safePage}
                pageSize={pageSize}
                onPage={(p) => { setPage(p) }}
                onPageSize={(n) => { setPageSize(n); setPage(1) }}
              />
            </>
          ) : (
            /* Grid view */
            <>
              <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {paginated.map((inst) => (
                  <div key={inst.id}
                    className={`relative overflow-hidden rounded-xl border bg-white transition-shadow hover:shadow-md ${
                      selected.has(inst.id) ? 'border-[#21759B]' : 'border-tundra-ink-200'
                    }`}>
                    {/* Checkbox */}
                    <div className="absolute left-3 top-3 z-10">
                      <input
                        type="checkbox"
                        checked={selected.has(inst.id)}
                        onChange={() => {
                          setSelected((s) => {
                            const n = new Set(s)
                            n.has(inst.id) ? n.delete(inst.id) : n.add(inst.id)
                            return n
                          })
                        }}
                        className="h-4 w-4 rounded border-tundra-ink-300 accent-[#21759B] shadow"
                      />
                    </div>

                    {/* Card header */}
                    <div className="flex items-start gap-3 p-4 pb-3">
                      <WpLogo size={40} />
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/wordpress/$installId"
                          params={{ installId: inst.id }}
                          className="block truncate font-semibold text-tundra-ink hover:text-[#21759B] transition-colors"
                        >
                          {inst.site_title ?? inst.site_id.slice(0, 14)}
                        </Link>
                        {inst.site_url && (
                          <a href={inst.site_url} target="_blank" rel="noopener noreferrer"
                            className="block truncate text-xs text-tundra-aurora hover:underline">
                            {inst.site_url.replace(/^https?:\/\//, '')} ↗
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="divide-y divide-tundra-ink-100 border-t border-tundra-ink-100">
                      <div className="flex items-center justify-between px-4 py-2 text-xs">
                        <span className="text-tundra-ink-400">Status</span>
                        <StatePill state={inst.state} />
                      </div>
                      <div className="flex items-center justify-between px-4 py-2 text-xs">
                        <span className="text-tundra-ink-400">Version</span>
                        <span className="font-mono text-tundra-ink-500">{inst.wp_version ?? '—'}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2 text-xs">
                        <span className="text-tundra-ink-400">Installed</span>
                        <span className="text-tundra-ink-500">
                          {fmtDate(inst.created_at)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1.5 border-t border-tundra-ink-100 p-3">
                      {inst.site_url && (
                        <a href={`${inst.site_url}/wp-admin`} target="_blank" rel="noopener noreferrer"
                          className="flex-1 rounded-lg border border-[#21759B]/30 py-1.5 text-center text-xs font-medium text-[#21759B] hover:bg-[#21759B]/5 transition-colors">
                          WP Admin
                        </a>
                      )}
                      <Link
                        to="/wordpress/$installId"
                        params={{ installId: inst.id }}
                        className="flex-1 rounded-lg border border-tundra-ink-200 py-1.5 text-center text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
                      >
                        Manage
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
              <Pagination
                total={filtered.length}
                page={safePage}
                pageSize={pageSize}
                onPage={(p) => { setPage(p) }}
                onPageSize={(n) => { setPageSize(n); setPage(1) }}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
