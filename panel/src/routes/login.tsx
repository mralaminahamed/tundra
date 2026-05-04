import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { authApi } from '@/lib/api'
import { useAuthStore, type AuthOperator } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TundraLogo } from '@/components/TundraLogo'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

type Step = 'method' | 'password' | 'totp' | 'passkey'

function LoginPage() {
  const router = useRouter()
  const setOperator = useAuthStore((s) => s.setOperator)

  const [step, setStep] = useState<Step>('method')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totpRef = useRef<HTMLInputElement>(null)

  function clearError() {
    setError(null)
  }

  async function handlePasswordSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    clearError()
    setLoading(true)
    try {
      const res = await authApi.login({ email, password })
      if (res.requires_totp) {
        setStep('totp')
        setTimeout(() => totpRef.current?.focus(), 50)
      } else {
        setOperator(res.operator as AuthOperator)
        await router.navigate({ to: '/dashboard' })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  async function submitTotp(code: string) {
    if (code.length !== 6) return
    clearError()
    setLoading(true)
    try {
      await authApi.totpVerify(code)
      const me = await authApi.me()
      setOperator(me as AuthOperator)
      await router.navigate({ to: '/dashboard' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code. Please try again.')
      setTotpCode('')
      setTimeout(() => totpRef.current?.focus(), 50)
    } finally {
      setLoading(false)
    }
  }

  function handleTotpChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6)
    setTotpCode(val)
    clearError()
    if (val.length === 6) {
      void submitTotp(val)
    }
  }

  async function handlePasskeyLogin() {
    clearError()
    setLoading(true)
    setStep('passkey')
    try {
      const { challenge_id, challenge } = await authApi.passkeyChallenge()
      const challengeBytes = base64urlDecode(challenge)

      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: challengeBytes,
          rpId: window.location.hostname,
          userVerification: 'preferred',
          timeout: 60000,
        },
      }) as PublicKeyCredential | null

      if (!credential) {
        setError('Passkey authentication was cancelled.')
        setStep('method')
        return
      }

      const response = credential.response as AuthenticatorAssertionResponse
      await authApi.passkeyVerify({
        challenge_id,
        credential_id: base64urlEncode(credential.rawId),
        authenticator_data: base64urlEncode(response.authenticatorData),
        client_data_json: base64urlEncode(response.clientDataJSON),
        signature: base64urlEncode(response.signature),
      })

      const me = await authApi.me()
      setOperator(me as AuthOperator)
      await router.navigate({ to: '/dashboard' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey authentication failed.')
      setStep('method')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-105 xl:w-120 shrink-0 flex-col justify-between bg-tundra-ink-900 px-10 py-12">
        <div>
          <TundraLogo size={36} variant="dark" />
        </div>

        <div className="space-y-4">
          <p className="text-3xl font-semibold leading-snug text-tundra-paper">
            Self-hosted server<br />management — done right.
          </p>
          <p className="text-sm leading-relaxed text-tundra-ink-400">
            One binary. No licensing fees. Full control over your servers,
            sites, databases, and deployments from a single panel.
          </p>
        </div>

        <div className="space-y-3">
          <Feature text="Multi-server fleet with mTLS agent mesh" />
          <Feature text="Blue/green deployments across 6 runtimes" />
          <Feature text="Wasmtime plugin host · MCP AI integration" />
          <Feature text="SLSA Level 3 · AES-256-GCM · Argon2id" />
          <div className="pt-2 text-xs text-tundra-ink-600">v1.0.0 · General Availability</div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 flex-col items-center justify-center bg-tundra-paper px-6 py-12">
        {/* Mobile logo */}
        <div className="mb-8 lg:hidden">
          <TundraLogo size={28} variant="light" />
        </div>

        <div className="w-full max-w-sm">
          {/* Step: method selection */}
          {step === 'method' && (
            <div>
              <div className="mb-8">
                <h1 className="text-2xl font-semibold text-tundra-ink">Welcome back</h1>
                <p className="mt-1 text-sm text-tundra-ink-500">Sign in to your Tundra panel</p>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => { clearError(); setStep('password') }}
                  className="flex items-center gap-3 w-full rounded-lg border border-tundra-ink-200 bg-white px-4 py-4 text-left transition-colors hover:border-tundra-lichen hover:bg-tundra-lichen-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tundra-aurora"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-tundra-ink-100">
                    <PasswordIcon />
                  </span>
                  <div>
                    <div className="font-medium text-tundra-ink">Sign in with password</div>
                    <div className="text-xs text-tundra-ink-500 mt-0.5">Use your email and password</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => { void handlePasskeyLogin() }}
                  disabled={loading}
                  className="flex items-center gap-3 w-full rounded-lg border border-tundra-ink-200 bg-white px-4 py-4 text-left transition-colors hover:border-tundra-lichen hover:bg-tundra-lichen-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tundra-aurora disabled:pointer-events-none disabled:opacity-50"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-tundra-ink-100">
                    {loading ? (
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-tundra-ink-400 border-t-transparent" />
                    ) : (
                      <PasskeyIcon />
                    )}
                  </span>
                  <div>
                    <div className="font-medium text-tundra-ink">Sign in with passkey</div>
                    <div className="text-xs text-tundra-ink-500 mt-0.5">Use Face ID, Touch ID or a security key</div>
                  </div>
                </button>
              </div>

              {error && <ErrorMessage message={error} />}

              <p className="mt-8 text-center text-xs text-tundra-ink-400">
                Access is restricted to authorised operators.
              </p>
            </div>
          )}

          {/* Step: password form */}
          {step === 'password' && (
            <div>
              <div className="mb-8">
                <h1 className="text-2xl font-semibold text-tundra-ink">Sign in with password</h1>
                <p className="mt-1 text-sm text-tundra-ink-500">Enter your email and password</p>
              </div>

              <form
                onSubmit={(e) => { void handlePasswordSubmit(e) }}
                className="flex flex-col gap-5"
              >
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="email" className="text-sm font-medium text-tundra-ink-700">
                    Email address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="operator@example.com"
                    value={email}
                    onChange={(e) => { clearError(); setEmail(e.target.value) }}
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-tundra-ink-700">
                    Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => { clearError(); setPassword(e.target.value) }}
                    required
                  />
                </div>

                {error && <ErrorMessage message={error} />}

                <Button type="submit" loading={loading} className="mt-1 w-full">
                  Continue
                </Button>
              </form>

              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={() => { clearError(); setStep('method') }}
                  className="text-sm text-tundra-ink-500 hover:text-tundra-ink underline-offset-2 hover:underline"
                >
                  Use passkey instead
                </button>
              </div>
            </div>
          )}

          {/* Step: TOTP verification */}
          {step === 'totp' && (
            <div>
              <div className="mb-8">
                <h1 className="text-2xl font-semibold text-tundra-ink">Two-factor authentication</h1>
                <p className="mt-1 text-sm text-tundra-ink-500">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <input
                  ref={totpRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={totpCode}
                  onChange={handleTotpChange}
                  disabled={loading}
                  className="w-full rounded border border-tundra-ink-200 bg-transparent px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] placeholder:text-tundra-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tundra-aurora disabled:cursor-not-allowed disabled:opacity-50"
                />

                {loading && (
                  <div className="flex items-center justify-center gap-2 text-sm text-tundra-ink-500">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-tundra-ink-400 border-t-transparent" />
                    Verifying…
                  </div>
                )}

                {error && <ErrorMessage message={error} />}
              </div>

              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => { clearError(); setTotpCode(''); setStep('password') }}
                  className="text-sm text-tundra-ink-500 hover:text-tundra-ink underline-offset-2 hover:underline"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {/* Step: passkey in-progress (browser dialog open) */}
          {step === 'passkey' && (
            <div>
              <div className="mb-8">
                <h1 className="text-2xl font-semibold text-tundra-ink">Sign in with passkey</h1>
                <p className="mt-1 text-sm text-tundra-ink-500">
                  Follow the prompt from your browser or device.
                </p>
              </div>

              <div className="flex flex-col items-center gap-5 py-6">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-tundra-lichen-50">
                  {loading ? (
                    <span className="h-8 w-8 animate-spin rounded-full border-2 border-tundra-lichen border-t-transparent" />
                  ) : (
                    <PasskeyIcon className="h-8 w-8 text-tundra-lichen" />
                  )}
                </span>
                <p className="text-sm text-tundra-ink-500 text-center">
                  Waiting for biometric or security key authentication…
                </p>
              </div>

              {error && <ErrorMessage message={error} />}

              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => { clearError(); setStep('method') }}
                  className="text-sm text-tundra-ink-500 hover:text-tundra-ink underline-offset-2 hover:underline"
                >
                  Use password instead
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 text-sm text-tundra-ink-400">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-tundra-lichen-500" />
      <span>{text}</span>
    </div>
  )
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="mt-1 text-sm text-tundra-rust" role="alert">
      {message}
    </p>
  )
}

function PasswordIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-tundra-ink-600" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function PasskeyIcon({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'text-tundra-ink-600'}
      aria-hidden="true"
    >
      <circle cx="8" cy="9" r="4" />
      <path d="M14 9h.01" />
      <path d="M14 15h.01" />
      <path d="M17 12h.01" />
      <path d="M20 9h.01" />
      <path d="M19.27 13.72A4 4 0 0 0 14 10h-2" />
      <path d="M2 21v-2a4 4 0 0 1 4-4h4" />
    </svg>
  )
}

function base64urlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64urlDecode(str: string): ArrayBuffer {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const bytes = new Uint8Array(atob(b64).split('').map((c) => c.charCodeAt(0)))
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}
