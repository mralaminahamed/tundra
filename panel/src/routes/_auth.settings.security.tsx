import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { QRCode } from 'react-qr-code'
import { authApi, type PasskeyItem } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_auth/settings/security')({
  component: SecuritySettingsPage,
})

function SecuritySettingsPage() {
  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="mb-1 text-2xl font-semibold">Security</h1>
        <p className="text-sm text-tundra-ink-500">
          Manage two-factor authentication and passkeys for your account.
        </p>
      </div>

      <TotpSection />
      <PasskeysSection />
    </div>
  )
}

// ---------------------------------------------------------------------------
// TOTP section
// ---------------------------------------------------------------------------

function TotpQr({ uri }: { uri: string }) {
  return (
    <QRCode
      value={uri}
      size={192}
      fgColor="#1C1F1A"
      bgColor="#FFFFFF"
      level="M"
    />
  )
}

function TotpSection() {
  const queryClient = useQueryClient()
  const [showSetup, setShowSetup] = useState(false)
  const [setupCode, setSetupCode] = useState('')
  const [setupError, setSetupError] = useState<string | null>(null)
  const [showManual, setShowManual] = useState(false)

  // We infer TOTP state from the /operators/me response. The backend should
  // expose `totp_enabled` on the operator object. We assume false if not present.
  const { data: operator } = useQuery({
    queryKey: ['me'],
    queryFn: () => authApi.me(),
  })

  const totpEnabled = Boolean((operator as Record<string, unknown> | undefined)?.totp_enabled)

  const { data: setupData, mutate: startSetup, isPending: setupPending } = useMutation({
    mutationFn: () => authApi.totpSetup(),
    onSuccess: () => { setShowSetup(true) },
  })

  const { mutate: enableTotp, isPending: enablePending } = useMutation({
    mutationFn: ({ secret, code }: { secret: string; code: string }) =>
      authApi.totpEnable(secret, code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      setShowSetup(false)
      setSetupCode('')
      setSetupError(null)
      setShowManual(false)
    },
    onError: (err) => {
      setSetupError(err instanceof Error ? err.message : 'Failed to enable TOTP.')
    },
  })

  const { mutate: disableTotp, isPending: disablePending } = useMutation({
    mutationFn: () => authApi.totpDisable(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })

  function handleEnableSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!setupData?.secret) return
    setSetupError(null)
    enableTotp({ secret: setupData.secret, code: setupCode })
  }

  return (
    <section>
      <SectionHeading title="Authenticator app (TOTP)" />

      <div className="rounded-lg border border-tundra-ink-200 p-5">
        {totpEnabled ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tundra-lichen-100 text-tundra-lichen-700">
                <ShieldCheckIcon />
              </span>
              <div>
                <div className="text-sm font-medium">TOTP is enabled</div>
                <div className="text-xs text-tundra-ink-500">
                  Your account is protected with a time-based one-time password.
                </div>
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              loading={disablePending}
              onClick={() => { disableTotp() }}
            >
              Remove
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tundra-ink-100 text-tundra-ink-500">
                  <ShieldIcon />
                </span>
                <div>
                  <div className="text-sm font-medium">TOTP is not enabled</div>
                  <div className="text-xs text-tundra-ink-500">
                    Add an extra layer of security with an authenticator app.
                  </div>
                </div>
              </div>
              {!showSetup && (
                <Button size="sm" loading={setupPending} onClick={() => { startSetup() }}>
                  Set up
                </Button>
              )}
            </div>

            {showSetup && setupData && (
              <div className="mt-4 rounded-md border border-tundra-ink-100 bg-tundra-ink-50 p-4 space-y-4">
                <div>
                  <p className="text-sm font-medium mb-1">1. Add to your authenticator app</p>
                  <p className="text-xs text-tundra-ink-500 mb-3">
                    Open Authy, Google Authenticator, 1Password, or any TOTP app and scan the QR code.
                  </p>

                  {!showManual ? (
                    <div className="flex flex-col items-start gap-3">
                      <div className="rounded-xl bg-white p-3 shadow-sm border border-tundra-ink-100">
                        <TotpQr uri={setupData.uri} />
                      </div>
                      <button
                        type="button"
                        onClick={() => { setShowManual(true) }}
                        className="text-xs text-tundra-ink-400 hover:text-tundra-ink underline-offset-2 hover:underline transition-colors"
                      >
                        Can't scan? Enter manually instead
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs font-medium text-tundra-ink-600 mb-1">Secret key</p>
                          <code className="block rounded bg-tundra-ink-900 px-3 py-2 text-xs text-tundra-ink-100 select-all font-mono tracking-wider break-all">
                            {setupData.secret}
                          </code>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-tundra-ink-600 mb-1">Full OTP URI</p>
                          <pre className="overflow-x-auto rounded bg-tundra-ink-900 p-2 text-xs text-tundra-ink-100 whitespace-pre-wrap break-all select-all">
                            {setupData.uri}
                          </pre>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setShowManual(false) }}
                        className="text-xs text-tundra-ink-400 hover:text-tundra-ink underline-offset-2 hover:underline transition-colors self-start"
                      >
                        ← Back to QR code
                      </button>
                    </div>
                  )}
                </div>

                <form onSubmit={handleEnableSubmit} className="space-y-3">
                  <div>
                    <label htmlFor="totp-confirm" className="text-sm font-medium block mb-1">
                      2. Enter the 6-digit code to confirm
                    </label>
                    <input
                      id="totp-confirm"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="000000"
                      value={setupCode}
                      onChange={(e) => {
                        setSetupError(null)
                        setSetupCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }}
                      className="w-full max-w-[200px] rounded border border-tundra-ink-200 bg-white px-3 py-2 text-center font-mono text-lg tracking-[0.4em] placeholder:text-tundra-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tundra-aurora"
                    />
                  </div>
                  {setupError && (
                    <p className="text-sm text-tundra-rust">{setupError}</p>
                  )}
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" loading={enablePending} disabled={setupCode.length !== 6}>
                      Enable TOTP
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setShowSetup(false); setSetupCode(''); setSetupError(null); setShowManual(false) }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Passkeys section
// ---------------------------------------------------------------------------

function PasskeysSection() {
  const queryClient = useQueryClient()
  const operator = useAuthStore((s) => s.operator)
  const [addLabel, setAddLabel] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [addPending, setAddPending] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['passkeys'],
    queryFn: () => authApi.passkeysList(),
  })

  const { mutate: deletePasskey, isPending: deletePending } = useMutation({
    mutationFn: (id: string) => authApi.passkeyDelete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['passkeys'] })
    },
  })

  async function handleRegister(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!addLabel.trim()) return
    setAddError(null)
    setAddPending(true)
    try {
      const { challenge_id, challenge } = await authApi.passkeyRegisterChallenge()
      const challengeBytes = base64urlDecode(challenge)

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: challengeBytes,
          rp: { name: 'Tundra', id: window.location.hostname },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: operator?.email ?? '',
            displayName: operator?.full_name ?? operator?.email ?? '',
          },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
          authenticatorSelection: { userVerification: 'preferred', residentKey: 'preferred' },
          timeout: 60000,
        },
      }) as PublicKeyCredential | null

      if (!credential) {
        setAddError('Passkey registration was cancelled.')
        return
      }

      const response = credential.response as AuthenticatorAttestationResponse
      const coseKey = extractCoseKeyFromAuthData(response.getAuthenticatorData())

      await authApi.passkeyRegister({
        challenge_id,
        credential_id: base64urlEncode(credential.rawId),
        public_key_cbor: base64urlEncode(coseKey),
        label: addLabel.trim(),
      })

      void queryClient.invalidateQueries({ queryKey: ['passkeys'] })
      setAddLabel('')
      setShowAddForm(false)
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to register passkey.')
    } finally {
      setAddPending(false)
    }
  }

  const passkeys: PasskeyItem[] = data?.data ?? []

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <SectionHeading title="Passkeys" />
        {!showAddForm && (
          <Button size="sm" onClick={() => { setShowAddForm(true) }}>
            + Add passkey
          </Button>
        )}
      </div>

      {showAddForm && (
        <div className="mb-4 rounded-lg border border-tundra-ink-200 bg-tundra-ink-50 p-4">
          <p className="text-sm font-medium mb-3">Register a new passkey</p>
          <form onSubmit={(e) => { void handleRegister(e) }} className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-1.5 flex-1 min-w-[160px]">
              <label htmlFor="passkey-label" className="text-xs font-medium text-tundra-ink-700">
                Label (e.g. MacBook Touch ID)
              </label>
              <input
                id="passkey-label"
                type="text"
                value={addLabel}
                onChange={(e) => { setAddError(null); setAddLabel(e.target.value) }}
                placeholder="My passkey"
                required
                className="flex h-9 w-full rounded border border-tundra-ink-200 bg-white px-3 py-2 text-sm placeholder:text-tundra-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tundra-aurora"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={addPending}>
                Register
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setShowAddForm(false); setAddLabel(''); setAddError(null) }}
              >
                Cancel
              </Button>
            </div>
          </form>
          {addError && <p className="mt-2 text-sm text-tundra-rust">{addError}</p>}
        </div>
      )}

      <div className="rounded-lg border border-tundra-ink-200">
        {isLoading ? (
          <div className="p-6 text-center text-sm text-tundra-ink-400">Loading passkeys…</div>
        ) : passkeys.length === 0 ? (
          <div className="p-6 text-center text-sm text-tundra-ink-400">
            No passkeys registered. Add one to sign in without a password.
          </div>
        ) : (
          <ul className="divide-y divide-tundra-ink-100">
            {passkeys.map((pk) => (
              <li key={pk.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tundra-ink-100 text-tundra-ink-500">
                    <PasskeySmallIcon />
                  </span>
                  <div>
                    <div className="text-sm font-medium">{pk.label}</div>
                    <div className="text-xs text-tundra-ink-400">
                      Added {formatDate(pk.created_at)}
                    </div>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  loading={deletePending}
                  onClick={() => { deletePasskey(pk.id) }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-tundra-ink-400">
      {title}
    </h2>
  )
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso))
  } catch {
    return iso
  }
}

function ShieldCheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function PasskeySmallIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
  const padded = str + '=='.slice(0, (4 - (str.length % 4)) % 4)
  const b64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  const bytes = new Uint8Array(atob(b64).split('').map((c) => c.charCodeAt(0)))
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

// Extract the COSE_Key bytes from an authenticatorData buffer.
// Structure: rpIdHash(32) + flags(1) + signCount(4) + aaguid(16) +
//            credIdLen(2) + credId(n) + cosePublicKey(rest)
function extractCoseKeyFromAuthData(authData: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(authData)
  const flags = bytes[32]
  if (!(flags & 0x40)) throw new Error('Attestation flag not set — cannot extract public key')
  const credIdLen = (bytes[53] << 8) | bytes[54]
  return authData.slice(55 + credIdLen)
}
