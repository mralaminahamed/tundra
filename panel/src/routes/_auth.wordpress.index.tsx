import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'

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

const WP_VERSIONS = ['6.7.2 (Latest)', '6.6.2', '6.5.5', '6.4.3']
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
            value={form.wp_version ?? '6.7.2 (Latest)'}
            onChange={(e) => { setForm({ ...form, wp_version: e.target.value }) }}
            className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-[#21759B] focus:outline-none"
          >
            {WP_VERSIONS.map((v) => <option key={v} value={v}>{v}</option>)}
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
            <button
              type="button"
              role="switch"
              aria-checked={form.multisite ?? false}
              onClick={() => { setForm({ ...form, multisite: !form.multisite }) }}
              className={`relative h-5 w-9 rounded-full border transition-colors ${
                form.multisite ? 'border-[#21759B] bg-[#21759B]' : 'border-tundra-ink-300 bg-tundra-ink-100'
              }`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.multisite ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
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
          <p><span className="font-medium text-tundra-ink">Version:</span> {form.wp_version ?? '6.7.2 (Latest)'}</p>
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
    wp_version: '6.7.2 (Latest)',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-tundra-ink-200 bg-white shadow-2xl">
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
      </div>
    </div>
  )
}

function WordPressPage() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)

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
    mutationFn: (body: InstallPayload) =>
      fetch('/api/v1/wordpress/installations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-installations'] })
      setShowModal(false)
    },
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/v1/wordpress/installations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-installations'] })
    },
  })

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

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-tundra-ink">WordPress</h1>
          <p className="mt-1 text-sm text-tundra-ink-400">
            {String(installs.length)} installation{installs.length !== 1 ? 's' : ''}
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

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-tundra-ink-100" />
          ))}
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
          <button
            onClick={() => { setShowModal(true) }}
            className="mt-4 rounded-lg bg-[#21759B] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1a6284] transition-colors"
          >
            Install WordPress
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 bg-tundra-ink-50 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
              <tr>
                <th className="px-4 py-3 text-left">Site / URL</th>
                <th className="px-4 py-3 text-left">WP Version</th>
                <th className="px-4 py-3 text-left">Path</th>
                <th className="px-4 py-3 text-left">State</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {installs.map((inst) => (
                <tr key={inst.id} className="group hover:bg-tundra-ink-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-tundra-ink">
                      {inst.site_title ?? inst.site_id}
                    </div>
                    {inst.site_url && (
                      <a href={inst.site_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-tundra-aurora hover:underline">
                        {inst.site_url} ↗
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-500">
                    {inst.wp_version ?? '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-tundra-ink-400">
                    {inst.wp_path}
                  </td>
                  <td className="px-4 py-3">
                    <StatePill state={inst.state} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to="/wordpress/$installId"
                        params={{ installId: inst.id }}
                        className="rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
                      >
                        Manage →
                      </Link>
                      <button
                        onClick={() => {
                          if (confirm('Mark this WordPress installation for removal? Files will be deleted on next agent sync.')) {
                            removeMutation.mutate(inst.id)
                          }
                        }}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
