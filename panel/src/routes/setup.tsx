import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { TundraLogo } from '@/components/TundraLogo'

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

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ['Welcome', 'Your account', 'Instance', 'Done'] as const
type Step = 0 | 1 | 2 | 3

function StepDots({ current }: { current: Step }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-1">
            <div className={`h-2 w-2 rounded-full transition-all duration-300 ${
              i < current  ? 'bg-tundra-lichen scale-75 opacity-60' :
              i === current ? 'bg-tundra-lichen scale-100' :
                              'bg-tundra-ink-200 scale-75'
            }`} />
          </div>
          {i < STEPS.length - 1 && (
            <div className={`h-px w-8 transition-colors duration-300 ${i < current ? 'bg-tundra-lichen' : 'bg-tundra-ink-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Password strength ────────────────────────────────────────────────────────

function passwordStrength(p: string): { score: number; label: string; color: string } {
  let score = 0
  if (p.length >= 8)  score++
  if (p.length >= 12) score++
  if (/[A-Z]/.test(p)) score++
  if (/[0-9]/.test(p)) score++
  if (/[^A-Za-z0-9]/.test(p)) score++
  if (score <= 1) return { score, label: 'Weak',   color: 'bg-red-400' }
  if (score <= 2) return { score, label: 'Fair',   color: 'bg-yellow-400' }
  if (score <= 3) return { score, label: 'Good',   color: 'bg-blue-400' }
  return              { score, label: 'Strong', color: 'bg-tundra-lichen' }
}

function PasswordStrengthBar({ password }: { password: string }) {
  if (!password) return null
  const { score, label, color } = passwordStrength(password)
  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[1,2,3,4].map((n) => (
          <div key={n} className={`h-1 flex-1 rounded-full transition-colors ${n <= score ? color : 'bg-tundra-ink-100'}`} />
        ))}
      </div>
      <p className="text-[11px] text-tundra-ink-400">{label} password</p>
    </div>
  )
}

// ─── Step 0: Welcome ──────────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <div className="mb-8 flex justify-center">
        <TundraLogo className="h-10" />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight text-tundra-ink mb-3">
        Welcome to Tundra
      </h1>
      <p className="text-tundra-ink-500 mb-8 max-w-xs mx-auto leading-relaxed">
        The open-source server management platform. Deploy sites, manage databases, and monitor your infrastructure — all in one place.
      </p>

      <div className="grid grid-cols-3 gap-3 mb-8 text-left">
        {[
          { icon: '🖥', title: 'Servers', desc: 'Provision and monitor your fleet' },
          { icon: '🌐', title: 'Sites',   desc: 'Deploy web apps with one click' },
          { icon: '🗄', title: 'Data',    desc: 'Databases, backups, and more' },
        ].map(({ icon, title, desc }) => (
          <div key={title} className="rounded-xl border border-tundra-ink-200 bg-tundra-ink-50 px-3 py-3">
            <div className="text-xl mb-1">{icon}</div>
            <p className="text-xs font-semibold text-tundra-ink mb-0.5">{title}</p>
            <p className="text-[11px] text-tundra-ink-400 leading-snug">{desc}</p>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full rounded-xl bg-tundra-lichen py-3 text-sm font-semibold text-white hover:bg-tundra-lichen-600 transition-colors shadow-sm"
      >
        Get started →
      </button>
    </div>
  )
}

// ─── Step 1: Account ──────────────────────────────────────────────────────────

interface AccountFields {
  name: string
  email: string
  password: string
  confirmPassword: string
}

function StepAccount({
  fields,
  onChange,
  onNext,
  onBack,
}: {
  fields: AccountFields
  onChange: (f: Partial<AccountFields>) => void
  onNext: () => void
  onBack: () => void
}) {
  const [showPass, setShowPass] = useState(false)
  const [errors, setErrors]     = useState<Partial<AccountFields>>({})

  function validate() {
    const e: Partial<AccountFields> = {}
    if (!fields.name.trim())           e.name = 'Name is required'
    if (!fields.email.includes('@'))   e.email = 'Valid email required'
    if (fields.password.length < 8)    e.password = 'At least 8 characters'
    if (fields.password !== fields.confirmPassword) e.confirmPassword = 'Passwords do not match'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleNext() {
    if (validate()) onNext()
  }

  const inputCls = (field: keyof AccountFields) =>
    `w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-1 transition-colors ${
      errors[field]
        ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-200'
        : 'border-tundra-ink-200 bg-white focus:border-tundra-lichen focus:ring-tundra-lichen/30'
    }`

  return (
    <div>
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-semibold text-tundra-ink">Create owner account</h2>
        <p className="mt-1 text-sm text-tundra-ink-500">This account has full access to Tundra.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Full name</label>
          <input
            type="text"
            autoFocus
            placeholder="Alice Smith"
            value={fields.name}
            onChange={(e) => { onChange({ name: e.target.value }); setErrors((p) => ({ ...p, name: undefined })) }}
            className={inputCls('name')}
          />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Email address</label>
          <input
            type="email"
            placeholder="alice@example.com"
            value={fields.email}
            onChange={(e) => { onChange({ email: e.target.value }); setErrors((p) => ({ ...p, email: undefined })) }}
            className={inputCls('email')}
          />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Password</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="Minimum 8 characters"
              value={fields.password}
              onChange={(e) => { onChange({ password: e.target.value }); setErrors((p) => ({ ...p, password: undefined })) }}
              className={`${inputCls('password')} pr-10`}
            />
            <button
              type="button"
              onClick={() => { setShowPass(!showPass) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-tundra-ink-300 hover:text-tundra-ink-500"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                {showPass
                  ? <><path d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></>
                  : <><path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></>
                }
              </svg>
            </button>
          </div>
          {errors.password
            ? <p className="mt-1 text-xs text-red-600">{errors.password}</p>
            : <PasswordStrengthBar password={fields.password} />
          }
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Confirm password</label>
          <input
            type="password"
            placeholder="Repeat password"
            value={fields.confirmPassword}
            onChange={(e) => { onChange({ confirmPassword: e.target.value }); setErrors((p) => ({ ...p, confirmPassword: undefined })) }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleNext() }}
            className={inputCls('confirmPassword')}
          />
          {errors.confirmPassword && <p className="mt-1 text-xs text-red-600">{errors.confirmPassword}</p>}
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button type="button" onClick={onBack}
          className="flex-1 rounded-xl border border-tundra-ink-200 py-2.5 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
          Back
        </button>
        <button type="button" onClick={handleNext}
          className="flex-1 rounded-xl bg-tundra-lichen py-2.5 text-sm font-semibold text-white hover:bg-tundra-lichen-600 transition-colors shadow-sm">
          Continue →
        </button>
      </div>
    </div>
  )
}

// ─── Step 2: Instance ─────────────────────────────────────────────────────────

function StepInstance({
  instanceName,
  onChangeName,
  onSubmit,
  onBack,
  loading,
  error,
}: {
  instanceName: string
  onChangeName: (v: string) => void
  onSubmit: () => void
  onBack: () => void
  loading: boolean
  error: string | null
}) {
  return (
    <div>
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-semibold text-tundra-ink">Name your instance</h2>
        <p className="mt-1 text-sm text-tundra-ink-500">Shown in the panel header. You can change this later.</p>
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Instance name <span className="text-tundra-ink-300">(optional)</span></label>
        <input
          type="text"
          autoFocus
          placeholder="e.g. Acme Corp · My Panel"
          value={instanceName}
          onChange={(e) => { onChangeName(e.target.value) }}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit() }}
          className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-2.5 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen/30 transition-colors"
        />
      </div>

      {/* Preview */}
      <div className="mb-6 rounded-xl border border-tundra-ink-100 bg-tundra-ink-50 px-4 py-3">
        <p className="text-[11px] text-tundra-ink-400 mb-2 uppercase tracking-wide font-semibold">Preview</p>
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-tundra-lichen text-white text-[10px] font-bold">T</div>
          <span className="text-sm font-medium text-tundra-ink">
            {instanceName.trim() || 'Tundra'}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      <div className="flex gap-3">
        <button type="button" onClick={onBack} disabled={loading}
          className="flex-1 rounded-xl border border-tundra-ink-200 py-2.5 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-50 transition-colors">
          Back
        </button>
        <button type="button" onClick={onSubmit} disabled={loading}
          className="flex-1 rounded-xl bg-tundra-lichen py-2.5 text-sm font-semibold text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors shadow-sm">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Setting up…
            </span>
          ) : 'Finish setup →'}
        </button>
      </div>
    </div>
  )
}

// ─── Step 3: Done ─────────────────────────────────────────────────────────────

function StepDone({ onGoToLogin }: { onGoToLogin: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => { setVisible(true) }, 100)
    return () => { clearTimeout(t) }
  }, [])

  return (
    <div className={`text-center transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      {/* Success icon */}
      <div className="mb-6 flex justify-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-tundra-lichen/10 ring-4 ring-tundra-lichen/20">
          <svg className="h-10 w-10 text-tundra-lichen" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
      </div>

      <h2 className="text-2xl font-semibold text-tundra-ink mb-2">You're all set!</h2>
      <p className="text-tundra-ink-500 text-sm mb-8 leading-relaxed">
        Your owner account is created and Tundra is ready.<br/>
        Sign in to start managing your infrastructure.
      </p>

      {/* Quick links */}
      <div className="grid grid-cols-1 gap-2.5 mb-8 text-left">
        {[
          { icon: '📖', title: 'Documentation', desc: 'Setup guides and API reference', href: 'https://docs.tundra.dev', external: true },
          { icon: '🖥', title: 'Add a server',  desc: 'Enroll your first server with SSH', href: null },
          { icon: '💬', title: 'Community',      desc: 'GitHub Discussions for help', href: 'https://github.com/mralaminahamed/tundra/discussions', external: true },
        ].map(({ icon, title, desc, href, external }) => (
          href && external ? (
            <a key={title} href={href} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl border border-tundra-ink-200 bg-white px-4 py-3 hover:border-tundra-lichen hover:bg-tundra-lichen/5 transition-colors group">
              <span className="text-xl shrink-0">{icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-tundra-ink group-hover:text-tundra-lichen transition-colors">{title} ↗</p>
                <p className="text-xs text-tundra-ink-400">{desc}</p>
              </div>
            </a>
          ) : (
            <div key={title}
              className="flex items-center gap-3 rounded-xl border border-tundra-ink-200 bg-white px-4 py-3 opacity-60">
              <span className="text-xl shrink-0">{icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-tundra-ink">{title}</p>
                <p className="text-xs text-tundra-ink-400">{desc}</p>
              </div>
            </div>
          )
        ))}
      </div>

      <button
        type="button"
        onClick={onGoToLogin}
        className="w-full rounded-xl bg-tundra-lichen py-3 text-sm font-semibold text-white hover:bg-tundra-lichen-600 transition-colors shadow-sm"
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
    name: '', email: '', password: '', confirmPassword: '',
  })
  const [instanceName, setInstanceName] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    try {
      await apiSetupInit({
        name: account.name.trim(),
        email: account.email.trim().toLowerCase(),
        password: account.password,
        instance_name: instanceName.trim() || undefined,
      })
      setStep(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-tundra-ink-50 via-white to-tundra-lichen-50/30 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Step indicator — hide on welcome and done */}
        {step > 0 && step < 3 && <StepDots current={step} />}

        {/* Card */}
        <div className="overflow-hidden rounded-2xl border border-tundra-ink-200 bg-white shadow-xl shadow-tundra-ink-100/50">
          <div className="p-8">
            {step === 0 && (
              <StepWelcome onNext={() => { setStep(1) }} />
            )}
            {step === 1 && (
              <StepAccount
                fields={account}
                onChange={(f) => { setAccount((p) => ({ ...p, ...f })) }}
                onNext={() => { setStep(2) }}
                onBack={() => { setStep(0) }}
              />
            )}
            {step === 2 && (
              <StepInstance
                instanceName={instanceName}
                onChangeName={setInstanceName}
                onSubmit={() => { void handleSubmit() }}
                onBack={() => { setStep(1) }}
                loading={loading}
                error={error}
              />
            )}
            {step === 3 && (
              <StepDone onGoToLogin={() => { void router.navigate({ to: '/login' }) }} />
            )}
          </div>

          {/* Footer */}
          {step < 3 && (
            <div className="border-t border-tundra-ink-100 bg-tundra-ink-50 px-8 py-3 text-center">
              <p className="text-xs text-tundra-ink-400">
                Step {step + 1} of 3
                {step === 0 && ' — Self-hosted · Open source · No tracking'}
              </p>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-tundra-ink-300">
          Tundra v{import.meta.env.VITE_TUNDRA_VERSION ?? '—'}
        </p>
      </div>
    </div>
  )
}
