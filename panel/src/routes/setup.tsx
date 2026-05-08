import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { TundraLogo } from '@/components/TundraLogo'
import {
  ServerIcon, GlobeIcon, DatabaseIcon, ShieldCheckIcon,
  RocketIcon, CheckCircleIcon, FileTextIcon,
  MessageIcon, ExternalLinkIcon, CheckIcon,
} from '@/components/icons'

export const Route = createFileRoute('/setup')({
  component: SetupPage,
})

// ─── API ──────────────────────────────────────────────────────────────────────

async function apiSetupInit(body: {
  name: string
  email: string
  password: string
  instance_name?: string
}) {
  const res = await fetch('/api/v1/setup/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(err?.error?.message ?? 'Setup failed')
  }
  return res.json()
}

// ─── Step types ───────────────────────────────────────────────────────────────

type Step = 0 | 1 | 2   // 0 = account, 1 = configure, 2 = done

const STEP_META: { label: string; title: string; subtitle: string }[] = [
  { label: 'Account',   title: 'Create owner account',   subtitle: 'This account has full, unrestricted access to Tundra.' },
  { label: 'Configure', title: 'Configure your instance', subtitle: 'Personalise the panel. You can change this any time in Settings.' },
  { label: 'Done',      title: "You're all set!",         subtitle: 'Your Tundra instance is ready.' },
]

// ─── Left brand panel ─────────────────────────────────────────────────────────

const FEATURES = [
  { icon: ServerIcon,      label: 'Servers',   desc: 'Provision and monitor your entire fleet' },
  { icon: GlobeIcon,       label: 'Sites',     desc: 'Deploy web apps with zero-downtime releases' },
  { icon: DatabaseIcon,    label: 'Databases', desc: 'PostgreSQL, MySQL, MariaDB and Valkey' },
  { icon: ShieldCheckIcon, label: 'Security',  desc: 'TLS, firewall rules, audit logs and MFA' },
  { icon: RocketIcon,      label: 'Deploys',   desc: 'Git-driven CI/CD with blue-green deploys' },
]

function BrandPanel() {
  return (
    <div className="hidden lg:flex w-[300px] xl:w-[340px] shrink-0 flex-col bg-tundra-ink text-white">
      {/* Logo */}
      <div className="px-8 pt-8 pb-6 border-b border-white/10">
        <TundraLogo className="h-7 brightness-0 invert" />
      </div>

      {/* Headline */}
      <div className="px-8 py-7">
        <h2 className="text-lg font-semibold leading-snug mb-1">
          Self-hosted server<br />management
        </h2>
        <p className="text-sm text-white/50 leading-relaxed">
          Open source · No licensing fees · Full control
        </p>
      </div>

      {/* Feature list */}
      <div className="flex-1 px-8 space-y-5">
        {FEATURES.map(({ icon: Icon, label, desc }) => (
          <div key={label} className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10">
              <Icon size={14} className="text-tundra-lichen-300" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">{label}</p>
              <p className="text-xs text-white/40 leading-snug">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-8 py-6 border-t border-white/10">
        <p className="text-xs text-white/30">
          © {new Date().getFullYear()} Tundra · Apache 2.0
        </p>
      </div>
    </div>
  )
}

// ─── Step header with numbered indicator ─────────────────────────────────────

function StepHeader({ current }: { current: Step }) {
  if (current === 2) return null
  return (
    <div className="flex items-center gap-0 border-b border-tundra-ink-100 px-8 py-4">
      {([0, 1] as const).map((i) => {
        const done    = i < current
        const active  = i === current
        const meta    = STEP_META[i]
        return (
          <div key={i} className="flex items-center gap-0">
            <div className="flex items-center gap-2.5">
              <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                done   ? 'bg-tundra-lichen text-white' :
                active ? 'bg-tundra-lichen text-white' :
                         'bg-tundra-ink-100 text-tundra-ink-400'
              }`}>
                {done ? <CheckIcon size={11} /> : i + 1}
              </div>
              <span className={`text-sm font-medium transition-colors hidden sm:block ${
                active ? 'text-tundra-ink' : done ? 'text-tundra-lichen-700' : 'text-tundra-ink-400'
              }`}>
                {meta.label}
              </span>
            </div>
            {i < 1 && (
              <div className={`mx-4 h-px w-10 transition-colors ${i < current ? 'bg-tundra-lichen' : 'bg-tundra-ink-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Password strength ────────────────────────────────────────────────────────

function strength(p: string) {
  let s = 0
  if (p.length >= 8)         s++
  if (p.length >= 12)        s++
  if (/[A-Z]/.test(p))      s++
  if (/[0-9]/.test(p))      s++
  if (/[^A-Za-z0-9]/.test(p)) s++
  if (s <= 1) return { s, label: 'Weak',   bar: 'bg-red-400' }
  if (s <= 2) return { s, label: 'Fair',   bar: 'bg-yellow-400' }
  if (s <= 3) return { s, label: 'Good',   bar: 'bg-blue-400' }
  return              { s, label: 'Strong', bar: 'bg-tundra-lichen' }
}

// ─── Shared input helpers ─────────────────────────────────────────────────────

function inputCls(hasError: boolean) {
  return `w-full rounded-lg border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all ${
    hasError
      ? 'border-red-300 bg-red-50/50 focus:border-red-400 focus:ring-red-100'
      : 'border-tundra-ink-200 bg-white focus:border-tundra-lichen focus:ring-tundra-lichen/20'
  }`
}

// ─── Step 0: Account ──────────────────────────────────────────────────────────

interface AccountFields {
  name: string
  email: string
  password: string
  confirm: string
}

function StepAccount({
  fields,
  onChange,
  onNext,
}: {
  fields: AccountFields
  onChange: (f: Partial<AccountFields>) => void
  onNext: () => void
}) {
  const [showPw,  setShowPw]  = useState(false)
  const [errors,  setErrors]  = useState<Partial<Record<keyof AccountFields, string>>>({})

  function validate() {
    const e: Partial<Record<keyof AccountFields, string>> = {}
    if (!fields.name.trim())              e.name    = 'Full name is required'
    if (!fields.email.includes('@'))      e.email   = 'Enter a valid email address'
    if (fields.password.length < 8)       e.password = 'Minimum 8 characters'
    if (fields.password !== fields.confirm) e.confirm = 'Passwords do not match'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const pw = strength(fields.password)

  return (
    <div className="space-y-5">
      {/* Name */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Full name</label>
        <input
          type="text" autoFocus placeholder="Alice Smith"
          value={fields.name}
          onChange={(e) => { onChange({ name: e.target.value }); setErrors((p) => ({ ...p, name: undefined })) }}
          className={inputCls(!!errors.name)}
        />
        {errors.name && <p className="mt-1.5 text-xs text-red-600">{errors.name}</p>}
      </div>

      {/* Email */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Email address</label>
        <input
          type="email" placeholder="alice@example.com"
          value={fields.email}
          onChange={(e) => { onChange({ email: e.target.value }); setErrors((p) => ({ ...p, email: undefined })) }}
          className={inputCls(!!errors.email)}
        />
        {errors.email && <p className="mt-1.5 text-xs text-red-600">{errors.email}</p>}
      </div>

      {/* Password */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Password</label>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'} placeholder="Minimum 8 characters"
            value={fields.password}
            onChange={(e) => { onChange({ password: e.target.value }); setErrors((p) => ({ ...p, password: undefined })) }}
            className={`${inputCls(!!errors.password)} pr-10`}
          />
          <button
            type="button"
            onClick={() => { setShowPw(!showPw) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-tundra-ink-300 hover:text-tundra-ink-600 transition-colors"
            aria-label={showPw ? 'Hide password' : 'Show password'}
          >
            {showPw
              ? <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></svg>
              : <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            }
          </button>
        </div>
        {errors.password
          ? <p className="mt-1.5 text-xs text-red-600">{errors.password}</p>
          : fields.password
            ? (
              <div className="mt-2">
                <div className="flex gap-1 mb-1">
                  {[1,2,3,4].map((n) => (
                    <div key={n} className={`h-1 flex-1 rounded-full transition-colors duration-200 ${n <= pw.s ? pw.bar : 'bg-tundra-ink-100'}`} />
                  ))}
                </div>
                <p className="text-[11px] text-tundra-ink-400">{pw.label} password</p>
              </div>
            )
            : null
        }
      </div>

      {/* Confirm */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Confirm password</label>
        <div className="relative">
          <input
            type="password" placeholder="Repeat password"
            value={fields.confirm}
            onChange={(e) => { onChange({ confirm: e.target.value }); setErrors((p) => ({ ...p, confirm: undefined })) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { if (validate()) onNext() } }}
            className={inputCls(!!errors.confirm)}
          />
          {fields.confirm && fields.confirm === fields.password && (
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-tundra-lichen">
              <CheckIcon size={14} />
            </div>
          )}
        </div>
        {errors.confirm && <p className="mt-1.5 text-xs text-red-600">{errors.confirm}</p>}
      </div>

      <button
        type="button"
        onClick={() => { if (validate()) onNext() }}
        className="w-full rounded-xl bg-tundra-lichen py-2.5 text-sm font-semibold text-white hover:bg-tundra-lichen-600 transition-colors shadow-sm"
      >
        Continue →
      </button>
    </div>
  )
}

// ─── Step 1: Configure ────────────────────────────────────────────────────────

function StepConfigure({
  instanceName,
  onChange,
  onSubmit,
  onBack,
  loading,
  error,
}: {
  instanceName: string
  onChange: (v: string) => void
  onSubmit: () => void
  onBack: () => void
  loading: boolean
  error: string | null
}) {
  return (
    <div className="space-y-5">
      {/* Instance name */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">
          Instance name <span className="text-tundra-ink-300 font-normal">(optional)</span>
        </label>
        <input
          type="text" autoFocus
          placeholder="e.g. Acme Corp · My Panel"
          value={instanceName}
          onChange={(e) => { onChange(e.target.value) }}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit() }}
          className={inputCls(false)}
        />
        <p className="mt-1.5 text-xs text-tundra-ink-400">Displayed in the sidebar header alongside the Tundra logo.</p>
      </div>

      {/* Sidebar preview */}
      <div className="overflow-hidden rounded-xl border border-tundra-ink-200">
        <div className="flex items-center gap-2 border-b border-tundra-ink-100 bg-tundra-ink-50 px-3 py-2">
          <div className="h-1.5 w-1.5 rounded-full bg-tundra-ink-200" />
          <span className="text-[10px] font-medium text-tundra-ink-400 uppercase tracking-wide">Sidebar preview</span>
        </div>
        <div className="bg-tundra-ink px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-tundra-lichen">
              <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
              </svg>
            </div>
            <span className="text-sm font-semibold text-white">
              {instanceName.trim() || 'tundra'}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
          </svg>
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button" onClick={onBack} disabled={loading}
          className="rounded-xl border border-tundra-ink-200 px-5 py-2.5 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-50 transition-colors"
        >
          Back
        </button>
        <button
          type="button" onClick={onSubmit} disabled={loading}
          className="flex-1 rounded-xl bg-tundra-lichen py-2.5 text-sm font-semibold text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors shadow-sm"
        >
          {loading
            ? <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Setting up…
              </span>
            : 'Finish setup'
          }
        </button>
      </div>
    </div>
  )
}

// ─── Step 2: Done ─────────────────────────────────────────────────────────────

const NEXT_STEPS = [
  {
    icon: ServerIcon,
    title: 'Add a server',
    desc: 'Enroll your first server via SSH or manual token',
    href: null as string | null,
  },
  {
    icon: FileTextIcon,
    title: 'Documentation',
    desc: 'Guides, API reference, and deployment examples',
    href: 'https://docs.tundra.dev',
  },
  {
    icon: MessageIcon,
    title: 'Community',
    desc: 'Questions and announcements on GitHub Discussions',
    href: 'https://github.com/mralaminahamed/tundra/discussions',
  },
]

function StepDone({ onLogin }: { onLogin: () => void }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => { setVisible(true) }, 80)
    return () => { clearTimeout(t) }
  }, [])

  return (
    <div className={`flex flex-col items-center text-center transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
      {/* Success ring */}
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-tundra-lichen/10 ring-4 ring-tundra-lichen/20">
        <CheckCircleIcon size={32} className="text-tundra-lichen" />
      </div>

      <h2 className="text-xl font-semibold text-tundra-ink mb-1.5">You're all set!</h2>
      <p className="text-sm text-tundra-ink-500 mb-7 max-w-xs leading-relaxed">
        Owner account created. Sign in to start managing your infrastructure.
      </p>

      {/* Next steps */}
      <div className="w-full space-y-2 mb-7 text-left">
        {NEXT_STEPS.map(({ icon: Icon, title, desc, href }) =>
          href ? (
            <a key={title} href={href} target="_blank" rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-xl border border-tundra-ink-200 bg-white px-4 py-3 hover:border-tundra-lichen hover:bg-tundra-lichen/5 transition-all">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tundra-ink-100 group-hover:bg-tundra-lichen/10 transition-colors">
                <Icon size={15} className="text-tundra-ink-500 group-hover:text-tundra-lichen transition-colors" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-tundra-ink group-hover:text-tundra-lichen transition-colors flex items-center gap-1">
                  {title}
                  <ExternalLinkIcon size={11} className="opacity-50 group-hover:opacity-100" />
                </p>
                <p className="text-xs text-tundra-ink-400">{desc}</p>
              </div>
            </a>
          ) : (
            <div key={title}
              className="flex items-center gap-3 rounded-xl border border-tundra-ink-100 bg-tundra-ink-50/60 px-4 py-3 opacity-50">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tundra-ink-100">
                <Icon size={15} className="text-tundra-ink-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-tundra-ink">{title}</p>
                <p className="text-xs text-tundra-ink-400">{desc}</p>
              </div>
            </div>
          )
        )}
      </div>

      <button
        type="button" onClick={onLogin}
        className="w-full rounded-xl bg-tundra-lichen py-2.5 text-sm font-semibold text-white hover:bg-tundra-lichen-600 transition-colors shadow-sm"
      >
        Sign in to Tundra →
      </button>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

function SetupPage() {
  const router = useRouter()

  const [step, setStep] = useState<Step>(0)
  const [account, setAccount] = useState<AccountFields>({
    name: '', email: '', password: '', confirm: '',
  })
  const [instanceName, setInstanceName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleFinish() {
    setLoading(true)
    setError(null)
    try {
      await apiSetupInit({
        name:          account.name.trim(),
        email:         account.email.trim().toLowerCase(),
        password:      account.password,
        instance_name: instanceName.trim() || undefined,
      })
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  const meta = STEP_META[step]

  return (
    <div className="min-h-screen bg-tundra-ink-50 flex items-center justify-center p-4 lg:p-8">
      <div className="w-full max-w-[820px]">
        {/* Mobile logo */}
        <div className="flex justify-center mb-6 lg:hidden">
          <TundraLogo className="h-7" />
        </div>

        <div className="overflow-hidden rounded-2xl border border-tundra-ink-200 shadow-2xl shadow-tundra-ink-200/40 flex">

          {/* ── Left brand panel ── */}
          <BrandPanel />

          {/* ── Right form panel ── */}
          <div className="flex flex-1 flex-col bg-white min-w-0">

            {/* Step header */}
            <StepHeader current={step} />

            {/* Content */}
            <div className="flex-1 px-7 py-7 sm:px-9 sm:py-8">
              {/* Title block */}
              {step < 2 && (
                <div className="mb-6">
                  <h1 className="text-xl font-semibold text-tundra-ink">{meta.title}</h1>
                  <p className="mt-1 text-sm text-tundra-ink-500">{meta.subtitle}</p>
                </div>
              )}

              {step === 0 && (
                <StepAccount
                  fields={account}
                  onChange={(f) => { setAccount((p) => ({ ...p, ...f })) }}
                  onNext={() => { setStep(1) }}
                />
              )}
              {step === 1 && (
                <StepConfigure
                  instanceName={instanceName}
                  onChange={setInstanceName}
                  onSubmit={() => { void handleFinish() }}
                  onBack={() => { setStep(0) }}
                  loading={loading}
                  error={error}
                />
              )}
              {step === 2 && (
                <StepDone onLogin={() => { void router.navigate({ to: '/login' }) }} />
              )}
            </div>

            {/* Footer */}
            {step < 2 && (
              <div className="border-t border-tundra-ink-100 bg-tundra-ink-50/60 px-7 py-3 sm:px-9">
                <p className="text-xs text-tundra-ink-400">
                  Step {step + 1} of 2 · Self-hosted · No data sent externally
                </p>
              </div>
            )}
          </div>
        </div>

        <p className="mt-3 text-center text-[11px] text-tundra-ink-300">
          Tundra {import.meta.env.VITE_TUNDRA_VERSION ? `v${String(import.meta.env.VITE_TUNDRA_VERSION)}` : ''}
        </p>
      </div>
    </div>
  )
}
