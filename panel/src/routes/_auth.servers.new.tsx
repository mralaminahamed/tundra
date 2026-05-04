import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CreateServerResponse, WizardFingerprintResponse, WizardInstallResponse } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/servers/new')({
  component: AddServerPage,
})

// ─── OS options ───────────────────────────────────────────────────────────────

const OS_OPTIONS = [
  { value: 'ubuntu-24.04', label: 'Ubuntu 24.04 LTS', badge: 'LTS', sub: 'Recommended' },
  { value: 'ubuntu-22.04', label: 'Ubuntu 22.04 LTS', badge: 'LTS', sub: 'Stable' },
  { value: 'debian-12',    label: 'Debian 12 Bookworm', badge: 'stable', sub: '' },
  { value: 'debian-11',    label: 'Debian 11 Bullseye', badge: 'oldstable', sub: '' },
  { value: 'almalinux-9',  label: 'AlmaLinux 9', badge: 'RHEL-compat', sub: '' },
  { value: 'rocky-9',      label: 'Rocky Linux 9', badge: 'RHEL-compat', sub: '' },
] as const

// ─── Wizard steps ─────────────────────────────────────────────────────────────

const STEPS = [
  { id: 0, title: 'Server details', desc: 'Name, hostname, OS, region' },
  { id: 1, title: 'Install agent', desc: 'SSH auto-install or manual token' },
  { id: 2, title: 'Done', desc: 'Server enrolled and reporting' },
]

type SshSubStep = 'idle' | 'pending_fingerprint' | 'confirm_fingerprint' | 'installing' | 'success' | 'error'

// ─── Page ─────────────────────────────────────────────────────────────────────

function AddServerPage() {
  // Step 0 fields
  const [name,     setName]     = useState('')
  const [hostname, setHostname] = useState('')
  const [region,   setRegion]   = useState('')
  const [os,       setOs]       = useState('ubuntu-24.04')
  const [notes,    setNotes]    = useState('')

  // Wizard state
  const [step,        setStep]        = useState(0)
  const [created,     setCreated]     = useState<CreateServerResponse | null>(null)
  const [installMode, setInstallMode] = useState<'ssh' | 'manual'>('ssh')

  // SSH sub-steps
  const [sshUser,    setSshUser]    = useState('root')
  const [sshPort,    setSshPort]    = useState('22')
  const [sshHost,    setSshHost]    = useState('')
  const [sshSubStep, setSshSubStep] = useState<SshSubStep>('idle')
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [fingerprintOk, setFingerprintOk] = useState(false)
  const [installLog,  setInstallLog]  = useState<string[]>([])
  const [installOk,   setInstallOk]   = useState(false)

  const createMutation = useMutation({
    mutationFn: () => api<CreateServerResponse>('/servers', {
      method: 'POST',
      body: { name, hostname, region: region || null, os, notes: notes || null },
    }),
    onSuccess: (res) => {
      setCreated(res)
      setSshHost(hostname)
      setStep(1)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to create server record'),
  })

  const fingerprintMutation = useMutation({
    mutationFn: () => api<WizardFingerprintResponse>('/servers/wizard/fingerprint', {
      method: 'POST',
      body: { user: sshUser, host: sshHost, port: parseInt(sshPort, 10) || 22 },
    }),
    onSuccess: (res) => {
      setFingerprint(res.fingerprint)
      setSshSubStep('confirm_fingerprint')
    },
    onError: (e) => {
      setSshSubStep('error')
      toast.error(e instanceof Error ? e.message : 'Cannot reach host — check IP and SSH access')
    },
  })

  const installMutation = useMutation({
    mutationFn: () => api<WizardInstallResponse>('/servers/wizard/install', {
      method: 'POST',
      body: {
        server_id: created?.server.id,
        user: sshUser,
        host: sshHost,
        port: parseInt(sshPort, 10) || 22,
        confirmed_fingerprint: fingerprint ?? '',
      },
    }),
    onSuccess: (res) => {
      setInstallLog(res.log)
      setInstallOk(res.ok)
      setSshSubStep(res.ok ? 'success' : 'error')
      if (res.ok) toast.success('Agent installed successfully!')
      else toast.error('Installer returned errors — check the log')
    },
    onError: (e) => {
      setSshSubStep('error')
      toast.error(e instanceof Error ? e.message : 'SSH install failed')
    },
  })

  const step0Valid = name.trim().length > 0 && hostname.trim().length > 0

  function copyToken() {
    if (created?.setup_token) {
      void navigator.clipboard.writeText(created.setup_token).then(() => toast.success('Token copied'))
    }
  }

  function copyCommand() {
    if (created?.enrolment_command) {
      void navigator.clipboard.writeText(created.enrolment_command).then(() => toast.success('Command copied'))
    }
  }

  return (
    <div className="max-w-2xl">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-xs text-tundra-ink-400">
        <Link to="/servers/" className="hover:text-tundra-aurora">Servers</Link>
        <span>/</span>
        <span className="text-tundra-ink">Add server</span>
      </nav>

      <h1 className="mb-2 text-2xl font-bold tracking-tight text-tundra-ink">Add server</h1>
      <p className="mb-8 text-sm text-tundra-ink-400">
        Enrol a new Linux node into Tundra. The agent will be installed and connect back via mTLS.
      </p>

      {/* Step progress */}
      <div className="mb-8 flex gap-0">
        {STEPS.map(({ id, title, desc }) => (
          <div key={id} className="flex flex-1 items-start gap-3">
            <div className="flex flex-col items-center">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                step > id  ? 'bg-tundra-lichen text-white' :
                step === id ? 'bg-tundra-lichen text-white ring-4 ring-tundra-lichen/20' :
                'bg-tundra-ink-100 text-tundra-ink-400'
              }`}>
                {step > id ? (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : String(id + 1)}
              </div>
              {id < STEPS.length - 1 && (
                <div className={`mt-2 h-10 w-0.5 ${step > id ? 'bg-tundra-lichen' : 'bg-tundra-ink-100'}`} />
              )}
            </div>
            <div className="pt-1.5 pb-4">
              <p className={`text-sm font-medium ${step === id ? 'text-tundra-ink' : step > id ? 'text-tundra-lichen-700' : 'text-tundra-ink-400'}`}>
                {title}
              </p>
              <p className="text-xs text-tundra-ink-400">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Step 0: Details ──────────────────────────────────────────────────── */}
      {step === 0 && (
        <div className="rounded-xl border border-tundra-ink-200 bg-white p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-tundra-ink-700">Display name <span className="text-tundra-rust">*</span></span>
              <input
                value={name}
                onChange={(e) => { setName(e.target.value) }}
                placeholder="web-01, db-fra, lb-primary…"
                className="rounded-lg border border-tundra-ink-200 px-3 py-2 focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
                autoFocus
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-tundra-ink-700">Region <span className="font-normal text-tundra-ink-400">(optional)</span></span>
              <input
                value={region}
                onChange={(e) => { setRegion(e.target.value) }}
                placeholder="eu-central-1, us-east-2…"
                className="rounded-lg border border-tundra-ink-200 px-3 py-2 focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-tundra-ink-700">Hostname or IP <span className="text-tundra-rust">*</span></span>
            <input
              value={hostname}
              onChange={(e) => { setHostname(e.target.value) }}
              placeholder="vps-01.example.com or 1.2.3.4"
              className="rounded-lg border border-tundra-ink-200 px-3 py-2 font-mono text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
            />
            <p className="text-xs text-tundra-ink-400">Used for SSH install. Must be reachable from the control plane.</p>
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-tundra-ink-700">Operating system</span>
            <div className="grid grid-cols-2 gap-2">
              {OS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setOs(opt.value) }}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                    os === opt.value
                      ? 'border-tundra-lichen bg-tundra-lichen-50 ring-1 ring-tundra-lichen'
                      : 'border-tundra-ink-200 hover:bg-tundra-ink-50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <span className={`block font-medium ${os === opt.value ? 'text-tundra-lichen-800' : 'text-tundra-ink'}`}>
                      {opt.label}
                    </span>
                    {opt.sub && <span className="text-xs text-tundra-lichen-600">{opt.sub}</span>}
                  </div>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium ${os === opt.value ? 'bg-tundra-lichen-100 text-tundra-lichen-700' : 'bg-tundra-ink-100 text-tundra-ink-500'}`}>
                    {opt.badge}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-tundra-ink-700">Notes <span className="font-normal text-tundra-ink-400">(optional)</span></span>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value) }}
              rows={2}
              placeholder="Purpose, SSH key path, known quirks…"
              className="rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm resize-y focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
            />
          </label>

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => { createMutation.mutate() }}
              disabled={!step0Valid || createMutation.isPending}
              className="rounded-lg bg-tundra-lichen px-5 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? 'Creating…' : 'Create server & continue →'}
            </button>
            <Link to="/servers/" className="rounded-lg border border-tundra-ink-200 px-5 py-2 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
              Cancel
            </Link>
          </div>
        </div>
      )}

      {/* ── Step 1: Install ───────────────────────────────────────────────────── */}
      {step === 1 && created && (
        <div className="space-y-4">
          {/* Mode selector */}
          <div className="grid grid-cols-2 gap-3">
            {(['ssh', 'manual'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => { setInstallMode(mode); setSshSubStep('idle') }}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  installMode === mode
                    ? 'border-tundra-lichen bg-tundra-lichen-50'
                    : 'border-tundra-ink-200 hover:bg-tundra-ink-50'
                }`}
              >
                <div className={`mb-1 text-sm font-semibold ${installMode === mode ? 'text-tundra-lichen-800' : 'text-tundra-ink'}`}>
                  {mode === 'ssh' ? '🔑 SSH auto-install' : '📋 Manual token'}
                </div>
                <div className="text-xs text-tundra-ink-400">
                  {mode === 'ssh'
                    ? 'Tundra SSHs in and installs the agent automatically.'
                    : 'Copy and run a one-liner on the server yourself.'}
                </div>
              </button>
            ))}
          </div>

          {/* SSH install flow */}
          {installMode === 'ssh' && (
            <div className="rounded-xl border border-tundra-ink-200 bg-white p-6 space-y-4">
              <p className="text-sm text-tundra-ink-500">
                Tundra will SSH into the host, upload the agent binary, install it as a systemd service, and initiate the mTLS handshake.
              </p>

              <div className="grid grid-cols-[1fr_1fr_80px] gap-3">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-tundra-ink-700">SSH user</span>
                  <input
                    value={sshUser}
                    onChange={(e) => { setSshUser(e.target.value); setSshSubStep('idle') }}
                    className="rounded-lg border border-tundra-ink-200 px-3 py-2 font-mono text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
                    placeholder="root"
                    disabled={sshSubStep === 'installing'}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-tundra-ink-700">Host / IP</span>
                  <input
                    value={sshHost}
                    onChange={(e) => { setSshHost(e.target.value); setSshSubStep('idle') }}
                    className="rounded-lg border border-tundra-ink-200 px-3 py-2 font-mono text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
                    placeholder="1.2.3.4"
                    disabled={sshSubStep === 'installing'}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-tundra-ink-700">Port</span>
                  <input
                    value={sshPort}
                    onChange={(e) => { setSshPort(e.target.value); setSshSubStep('idle') }}
                    className="rounded-lg border border-tundra-ink-200 px-3 py-2 font-mono text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
                    placeholder="22"
                    disabled={sshSubStep === 'installing'}
                  />
                </label>
              </div>

              {/* SSH command preview */}
              <div className="rounded-lg bg-tundra-ink-900 px-3 py-2 text-xs font-mono text-tundra-ink-300">
                <span className="text-tundra-ink-500">$ </span>
                ssh -p {sshPort} {sshUser}@{sshHost || '<host>'}
              </div>

              {/* Sub-step: idle — fetch fingerprint */}
              {(sshSubStep === 'idle' || sshSubStep === 'error') && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      if (!sshUser.trim() || !sshHost.trim()) {
                        toast.error('Enter SSH user and host')
                        return
                      }
                      setSshSubStep('pending_fingerprint')
                      fingerprintMutation.mutate()
                    }}
                    disabled={fingerprintMutation.isPending || !sshUser.trim() || !sshHost.trim()}
                    className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
                  >
                    {fingerprintMutation.isPending ? 'Connecting…' : 'Check host fingerprint →'}
                  </button>
                  {sshSubStep === 'error' && (
                    <span className="text-xs text-red-600">Connection failed — check host and SSH access.</span>
                  )}
                </div>
              )}

              {/* Sub-step: pending fingerprint */}
              {sshSubStep === 'pending_fingerprint' && (
                <div className="flex items-center gap-2 text-sm text-tundra-ink-500">
                  <svg className="h-4 w-4 animate-spin text-tundra-lichen" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Connecting to {sshHost}…
                </div>
              )}

              {/* Sub-step: confirm fingerprint */}
              {(sshSubStep === 'confirm_fingerprint' || sshSubStep === 'installing') && fingerprint && (
                <div className="rounded-xl border border-tundra-ink-200 bg-tundra-ink-50 p-4 space-y-3">
                  <p className="text-sm font-medium text-tundra-ink">Verify host fingerprint</p>
                  <p className="text-xs text-tundra-ink-500">
                    Cross-check this fingerprint with your provider's console or a trusted prior connection.
                  </p>
                  <pre className="overflow-x-auto rounded-lg bg-tundra-ink-900 p-3 text-xs text-tundra-paper">{fingerprint}</pre>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fingerprintOk}
                      onChange={(e) => { setFingerprintOk(e.target.checked) }}
                      className="mt-0.5 rounded"
                      disabled={sshSubStep === 'installing'}
                    />
                    <span>I've verified this fingerprint matches the host. Proceed with installation.</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setSshSubStep('installing')
                        installMutation.mutate()
                      }}
                      disabled={!fingerprintOk || installMutation.isPending}
                      className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
                    >
                      {installMutation.isPending ? (
                        <span className="flex items-center gap-1.5">
                          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Installing…
                        </span>
                      ) : 'Install agent'}
                    </button>
                    <button
                      onClick={() => { setSshSubStep('idle'); setFingerprint(null); setFingerprintOk(false) }}
                      disabled={sshSubStep === 'installing'}
                      className="text-sm text-tundra-ink-400 hover:text-tundra-ink disabled:opacity-40"
                    >
                      ← Back
                    </button>
                  </div>
                </div>
              )}

              {/* Sub-step: result */}
              {(sshSubStep === 'success' || (sshSubStep === 'error' && installLog.length > 0)) && (
                <div className={`rounded-xl border p-4 space-y-3 ${installOk ? 'border-tundra-lichen-200 bg-tundra-lichen-50' : 'border-red-200 bg-red-50'}`}>
                  <p className={`text-sm font-medium ${installOk ? 'text-tundra-lichen-800' : 'text-red-700'}`}>
                    {installOk ? '✓ Agent installed successfully!' : '✗ Installation errors — check log'}
                  </p>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-tundra-ink-500 hover:text-tundra-ink">Show install log</summary>
                    <pre className="mt-2 max-h-48 overflow-y-auto rounded-lg bg-tundra-ink-900 p-3 text-tundra-paper whitespace-pre-wrap">
                      {installLog.join('\n')}
                    </pre>
                  </details>
                  {installOk && (
                    <button onClick={() => { setStep(2) }}
                      className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600">
                      Continue →
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Manual token flow */}
          {installMode === 'manual' && (
            <div className="rounded-xl border border-tundra-ink-200 bg-white p-6 space-y-4">
              <p className="text-sm text-tundra-ink-500">
                Run this one-liner on the server as <code className="font-mono">root</code>. The token is valid for <strong>1 hour</strong>.
              </p>
              <div className="relative">
                <pre className="overflow-x-auto rounded-lg bg-tundra-ink-900 p-4 pr-16 text-sm text-tundra-paper">
                  {created.enrolment_command}
                </pre>
                <button
                  onClick={copyCommand}
                  className="absolute right-3 top-3 flex items-center gap-1 rounded bg-tundra-ink-700 px-2.5 py-1.5 text-xs text-tundra-ink-300 hover:bg-tundra-ink-600 transition-colors"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeLinecap="round" />
                  </svg>
                  Copy
                </button>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-tundra-ink-200 bg-tundra-ink-50 p-3 text-xs text-tundra-ink-500">
                <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tundra-ink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" strokeLinecap="round" />
                </svg>
                Setup token (1h TTL):
                <code className="ml-1 font-mono text-tundra-ink-600">{created.setup_token}</code>
                <button onClick={copyToken} className="ml-1 text-tundra-aurora hover:underline">Copy</button>
              </div>

              <button
                onClick={() => { setStep(2) }}
                className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors"
              >
                I've run the command, continue →
              </button>
            </div>
          )}

          {/* Nav */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => { setStep(0) }}
              className="text-sm text-tundra-ink-400 hover:text-tundra-ink"
            >
              ← Back to details
            </button>
            <span className="text-tundra-ink-300">·</span>
            <button
              onClick={() => { setStep(2) }}
              className="text-sm text-tundra-ink-400 hover:text-tundra-ink"
            >
              Skip install for now
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Done ──────────────────────────────────────────────────────── */}
      {step === 2 && created && (
        <div className="rounded-xl border border-tundra-ink-200 bg-white p-6 space-y-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tundra-lichen-100">
              <svg className="h-6 w-6 text-tundra-lichen" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-semibold text-tundra-ink">{created.server.name} added</p>
              <p className="text-sm text-tundra-ink-400">
                {installOk ? 'Agent installed — should report in within 30s.' : 'Run the enrolment command to connect this server.'}
              </p>
            </div>
          </div>

          {!installOk && (
            <div className="space-y-2">
              <p className="text-sm text-tundra-ink-600 font-medium">Enrolment command (1h token):</p>
              <div className="relative">
                <pre className="overflow-x-auto rounded-lg bg-tundra-ink-900 p-4 pr-16 text-sm text-tundra-paper">
                  {created.enrolment_command}
                </pre>
                <button
                  onClick={copyCommand}
                  className="absolute right-3 top-3 flex items-center gap-1 rounded bg-tundra-ink-700 px-2.5 py-1.5 text-xs text-tundra-ink-300 hover:bg-tundra-ink-600"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeLinecap="round" />
                  </svg>
                  Copy
                </button>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-tundra-ink-200 bg-tundra-ink-50 p-3 text-xs text-tundra-ink-500">
            <p className="font-medium text-tundra-ink-700 mb-1">What happens next</p>
            <ol className="list-decimal ml-4 space-y-0.5">
              <li>Agent starts on the server and initiates an mTLS handshake with this control plane</li>
              <li>A certificate is issued; the server status changes from <em>provisioning</em> to <em>active</em></li>
              <li>Metrics begin flowing — CPU, RAM, disk visible on the server detail page</li>
            </ol>
          </div>

          <div className="flex gap-3">
            <Link
              to="/servers/$serverId"
              params={{ serverId: created.server.id }}
              className="rounded-lg bg-tundra-lichen px-5 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors"
            >
              View server
            </Link>
            <Link
              to="/servers/"
              className="rounded-lg border border-tundra-ink-200 px-5 py-2 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
            >
              All servers
            </Link>
            <button
              onClick={() => {
                setStep(0); setName(''); setHostname(''); setRegion(''); setNotes(''); setOs('ubuntu-24.04')
                setCreated(null); setSshSubStep('idle'); setFingerprint(null); setFingerprintOk(false)
                setInstallLog([]); setInstallOk(false)
              }}
              className="text-sm text-tundra-ink-400 hover:text-tundra-ink ml-auto"
            >
              + Add another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
