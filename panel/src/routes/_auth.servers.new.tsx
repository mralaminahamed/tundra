import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CreateServerResponse, WizardFingerprintResponse, WizardInstallResponse } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/servers/new')({
  component: AddServerPage,
})

const OS_OPTIONS = [
  { value: 'ubuntu-24.04', label: 'Ubuntu 24.04 LTS' },
  { value: 'ubuntu-22.04', label: 'Ubuntu 22.04 LTS' },
  { value: 'debian-12', label: 'Debian 12 Bookworm' },
  { value: 'debian-11', label: 'Debian 11 Bullseye' },
  { value: 'almalinux-9', label: 'AlmaLinux 9' },
  { value: 'rocky-9', label: 'Rocky Linux 9' },
]

const STEPS = [
  { id: 0, label: 'Server details', sub: 'Name, hostname, OS' },
  { id: 1, label: 'Connect', sub: 'SSH install or manual token' },
  { id: 2, label: 'Done', sub: 'Agent enrolling' },
] as const

type SshSubStep = 'idle' | 'fingerprint_pending' | 'confirm' | 'installing' | 'done'

function AddServerPage() {
  // Step 0 form state
  const [name, setName] = useState('')
  const [hostname, setHostname] = useState('')
  const [region, setRegion] = useState('')
  const [os, setOs] = useState('ubuntu-24.04')

  // Wizard state
  const [step, setStep] = useState(0)
  const [created, setCreated] = useState<CreateServerResponse | null>(null)
  const [installMode, setInstallMode] = useState<'ssh' | 'manual'>('ssh')

  // SSH sub-step state
  const [sshUser, setSshUser] = useState('root')
  const [sshHost, setSshHost] = useState('')
  const [sshSubStep, setSshSubStep] = useState<SshSubStep>('idle')
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [fingerprintOk, setFingerprintOk] = useState(false)
  const [installLog, setInstallLog] = useState<string[]>([])

  const createMutation = useMutation({
    mutationFn: () => api<CreateServerResponse>('/servers', {
      method: 'POST',
      body: { name, hostname, region: region || null, os },
    }),
    onSuccess: (res) => {
      setCreated(res)
      setSshHost(hostname)
      setStep(1)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to add server'),
  })

  const fingerprintMutation = useMutation({
    mutationFn: () => api<WizardFingerprintResponse>('/servers/wizard/fingerprint', {
      method: 'POST',
      body: { user: sshUser, host: sshHost },
    }),
    onSuccess: (res) => {
      setFingerprint(res.fingerprint)
      setSshSubStep('confirm')
    },
    onError: (e) => {
      setSshSubStep('idle')
      toast.error(e instanceof Error ? e.message : 'Could not reach host')
    },
  })

  const installMutation = useMutation({
    mutationFn: () => api<WizardInstallResponse>('/servers/wizard/install', {
      method: 'POST',
      body: {
        server_id: created?.server.id,
        user: sshUser,
        host: sshHost,
        confirmed_fingerprint: fingerprint ?? '',
      },
    }),
    onSuccess: (res) => {
      setInstallLog(res.log)
      setSshSubStep('done')
      if (res.ok) toast.success('Agent installed — server is provisioning')
      else toast.error('Installer exited with error — check the log below')
    },
    onError: (e) => {
      setSshSubStep('confirm')
      toast.error(e instanceof Error ? e.message : 'SSH install failed')
    },
  })

  const step0Valid = name.trim() && hostname.trim()

  return (
    <div className="max-w-2xl">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-tundra-ink-400">
        <Link to="/servers" className="hover:text-tundra-ink">Servers</Link>
        <span>/</span>
        <span className="text-tundra-ink">Add server</span>
      </nav>

      <h1 className="mb-8 text-2xl font-semibold">Add server</h1>

      {/* Step indicator */}
      <ol className="mb-8 flex items-start gap-0">
        {STEPS.map(({ id, label, sub }) => (
          <li key={id} className="flex flex-1 items-start gap-3">
            <div className="flex flex-col items-center">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                step > id ? 'bg-tundra-lichen text-white' :
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
                <div className={`mt-2 h-8 w-0.5 ${step > id ? 'bg-tundra-lichen' : 'bg-tundra-ink-100'}`} />
              )}
            </div>
            <div className="pt-1">
              <p className={`text-sm font-medium ${step === id ? 'text-tundra-ink' : step > id ? 'text-tundra-lichen-700' : 'text-tundra-ink-400'}`}>
                {label}
              </p>
              <p className="text-xs text-tundra-ink-400">{sub}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* ── Step 0: Details ─────────────────────────────────────────── */}
      {step === 0 && (
        <div className="rounded-xl border border-tundra-ink-200 bg-white p-6 space-y-5">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-tundra-ink-700">Display name <span className="text-tundra-rust">*</span></span>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value) }}
              placeholder="web-01"
              className="rounded border border-tundra-ink-200 px-3 py-2 focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
              autoFocus
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-tundra-ink-700">Hostname <span className="text-tundra-rust">*</span></span>
            <input
              value={hostname}
              onChange={(e) => { setHostname(e.target.value) }}
              placeholder="vps-01.example.com or 1.2.3.4"
              className="rounded border border-tundra-ink-200 px-3 py-2 focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-tundra-ink-700">Region <span className="text-tundra-ink-400 font-normal">(optional)</span></span>
            <input
              value={region}
              onChange={(e) => { setRegion(e.target.value) }}
              placeholder="eu-central, us-east, …"
              className="rounded border border-tundra-ink-200 px-3 py-2 focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-tundra-ink-700">Operating system</span>
            <select
              value={os}
              onChange={(e) => { setOs(e.target.value) }}
              className="rounded border border-tundra-ink-200 px-3 py-2 focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
            >
              {OS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { createMutation.mutate() }}
              disabled={!step0Valid || createMutation.isPending}
              className="rounded bg-tundra-lichen px-5 py-2 text-sm text-white hover:bg-tundra-lichen-600 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating…' : 'Next →'}
            </button>
            <Link to="/servers" className="rounded border border-tundra-ink-200 px-5 py-2 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50">
              Cancel
            </Link>
          </div>
        </div>
      )}

      {/* ── Step 1: Connect ─────────────────────────────────────────── */}
      {step === 1 && created && (
        <div className="space-y-4">
          {/* Mode selector */}
          <div className="flex gap-2">
            {(['ssh', 'manual'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setInstallMode(m) }}
                className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  installMode === m
                    ? 'border-tundra-lichen bg-tundra-lichen-50 text-tundra-lichen-800'
                    : 'border-tundra-ink-200 text-tundra-ink-600 hover:bg-tundra-ink-50'
                }`}
              >
                {m === 'ssh' ? '🔑 SSH install (automatic)' : '📋 Manual token'}
              </button>
            ))}
          </div>

          {/* SSH install */}
          {installMode === 'ssh' && (
            <div className="rounded-xl border border-tundra-ink-200 bg-white p-6 space-y-4">
              <p className="text-sm text-tundra-ink-500">
                Tundra will SSH into your host, upload the agent binary, and start it as a systemd service.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-tundra-ink-700">SSH user</span>
                  <input
                    value={sshUser}
                    onChange={(e) => { setSshUser(e.target.value) }}
                    className="rounded border border-tundra-ink-200 px-3 py-2 focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
                    placeholder="root"
                    disabled={sshSubStep !== 'idle'}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-tundra-ink-700">SSH host</span>
                  <input
                    value={sshHost}
                    onChange={(e) => { setSshHost(e.target.value) }}
                    className="rounded border border-tundra-ink-200 px-3 py-2 focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
                    placeholder="1.2.3.4"
                    disabled={sshSubStep !== 'idle'}
                  />
                </label>
              </div>

              {sshSubStep === 'idle' && (
                <button
                  onClick={() => {
                    if (!sshUser.trim() || !sshHost.trim()) {
                      toast.error('SSH user and host are required')
                      return
                    }
                    setSshSubStep('fingerprint_pending')
                    fingerprintMutation.mutate()
                  }}
                  disabled={fingerprintMutation.isPending}
                  className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600 disabled:opacity-50"
                >
                  {fingerprintMutation.isPending ? 'Connecting…' : 'Check host fingerprint →'}
                </button>
              )}

              {(sshSubStep === 'confirm' || sshSubStep === 'installing') && fingerprint && (
                <div className="rounded-lg border border-tundra-ink-200 p-4 space-y-3">
                  <p className="text-sm font-medium text-tundra-ink">Verify host fingerprint</p>
                  <pre className="overflow-x-auto rounded bg-tundra-ink-900 p-3 text-xs text-tundra-paper">{fingerprint}</pre>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fingerprintOk}
                      onChange={(e) => { setFingerprintOk(e.target.checked) }}
                      className="rounded"
                      disabled={sshSubStep === 'installing'}
                    />
                    I verified this fingerprint matches my provider's console
                  </label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setSshSubStep('installing')
                        installMutation.mutate()
                      }}
                      disabled={!fingerprintOk || installMutation.isPending}
                      className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600 disabled:opacity-50"
                    >
                      {installMutation.isPending ? 'Installing…' : 'Install agent'}
                    </button>
                    <button
                      onClick={() => { setSshSubStep('idle'); setFingerprint(null); setFingerprintOk(false) }}
                      disabled={installMutation.isPending}
                      className="rounded border border-tundra-ink-200 px-4 py-2 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50"
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}

              {sshSubStep === 'done' && installLog.length > 0 && (
                <div className="rounded-lg border border-tundra-ink-200 p-4 space-y-2">
                  <p className="text-sm font-medium text-tundra-ink">Install log</p>
                  <pre className="max-h-48 overflow-y-auto rounded bg-tundra-ink-900 p-3 text-xs text-tundra-paper whitespace-pre-wrap">
                    {installLog.join('\n')}
                  </pre>
                  <button
                    onClick={() => { setStep(2) }}
                    className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600"
                  >
                    Continue →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Manual token */}
          {installMode === 'manual' && (
            <div className="rounded-xl border border-tundra-ink-200 bg-white p-6 space-y-4">
              <p className="text-sm text-tundra-ink-500">
                Run this command on your server as root. The token expires in 1 hour.
              </p>
              <div className="relative">
                <pre className="overflow-x-auto rounded bg-tundra-ink-900 p-4 text-sm text-tundra-paper">
                  {created.enrolment_command}
                </pre>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(created.enrolment_command)
                    toast.success('Copied to clipboard')
                  }}
                  className="absolute right-3 top-3 rounded bg-tundra-ink-700 px-2 py-1 text-xs text-tundra-ink-300 hover:bg-tundra-ink-600"
                >
                  Copy
                </button>
              </div>
              <p className="text-xs text-tundra-ink-400">
                Setup token: <code className="font-mono">{created.setup_token}</code>
              </p>
              <button
                onClick={() => { setStep(2) }}
                className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600"
              >
                I've run the command →
              </button>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => { setStep(0) }}
              className="rounded border border-tundra-ink-200 px-4 py-2 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50"
            >
              ← Back
            </button>
            <button
              onClick={() => { setStep(2) }}
              className="text-sm text-tundra-ink-400 hover:text-tundra-ink"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Done ─────────────────────────────────────────────── */}
      {step === 2 && created && (
        <div className="rounded-xl border border-tundra-ink-200 bg-white p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tundra-lichen-100">
              <svg className="h-5 w-5 text-tundra-lichen" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-tundra-ink">{created.server.name} added</p>
              <p className="text-sm text-tundra-ink-400">The agent will connect shortly.</p>
            </div>
          </div>

          <p className="text-sm text-tundra-ink-500">
            If needed, you can always enrol manually with:
          </p>
          <div className="relative">
            <pre className="overflow-x-auto rounded bg-tundra-ink-900 p-4 text-sm text-tundra-paper">
              {created.enrolment_command}
            </pre>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(created.enrolment_command)
                toast.success('Copied')
              }}
              className="absolute right-3 top-3 rounded bg-tundra-ink-700 px-2 py-1 text-xs text-tundra-ink-300 hover:bg-tundra-ink-600"
            >
              Copy
            </button>
          </div>

          <div className="flex gap-3">
            <Link to="/servers/$serverId" params={{ serverId: created.server.id }}
              className="rounded bg-tundra-lichen px-5 py-2 text-sm text-white hover:bg-tundra-lichen-600">
              View server
            </Link>
            <Link to="/servers" className="rounded border border-tundra-ink-200 px-5 py-2 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50">
              All servers
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
