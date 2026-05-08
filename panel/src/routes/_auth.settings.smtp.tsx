import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'

interface TestResult { ok: boolean; message: string }

export const Route = createFileRoute('/_auth/settings/smtp')({
  component: SmtpPage,
})

interface SmtpSettings {
  host?: string | null
  port?: number | null
  username?: string | null
  from_email?: string | null
  from_name?: string | null
  encryption?: string
  has_password: boolean
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

function SmtpPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'smtp'],
    queryFn: () => api<{ data: SmtpSettings }>('/settings/smtp'),
  })

  const s = data?.data ?? { has_password: false }

  const [host,       setHost]       = useState('')
  const [port,       setPort]       = useState('587')
  const [username,   setUsername]   = useState('')
  const [password,   setPassword]   = useState('')
  const [fromEmail,  setFromEmail]  = useState('')
  const [fromName,   setFromName]   = useState('')
  const [encryption, setEncryption] = useState('starttls')
  const [clearPw,    setClearPw]    = useState(false)

  useEffect(() => {
    if (!data) return
    setHost(s.host ?? '')
    setPort(String(s.port ?? 587))
    setUsername(s.username ?? '')
    setFromEmail(s.from_email ?? '')
    setFromName(s.from_name ?? '')
    setEncryption(s.encryption ?? 'starttls')
  }, [data])

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/settings/smtp', { method: 'PATCH', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings', 'smtp'] })
      setPassword('')
      setClearPw(false)
      toast.success('SMTP settings saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const testMut = useMutation({
    mutationFn: () => api<TestResult>('/settings/smtp/test', { method: 'POST' }),
    onSuccess: (r) => { setTestResult(r) },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Test failed'),
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const body: Record<string, unknown> = {
      host:       host.trim() || null,
      port:       port ? parseInt(port, 10) : null,
      username:   username.trim() || null,
      from_email: fromEmail.trim() || null,
      from_name:  fromName.trim() || null,
      encryption,
    }
    if (clearPw) {
      body.password = null
    } else if (password) {
      body.password = password
    }
    saveMut.mutate(body)
  }

  if (isLoading) {
    return <div className="h-64 rounded-xl bg-tundra-ink-100 animate-pulse" />
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <SectionCard title="SMTP server" desc="Used to send platform emails: alerts, invitations, password resets.">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Host</label>
            <input value={host} onChange={(e) => { setHost(e.target.value) }}
              placeholder="smtp.example.com" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Port</label>
            <input type="number" value={port} onChange={(e) => { setPort(e.target.value) }}
              placeholder="587" min={1} max={65535} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Encryption</label>
            <select value={encryption} onChange={(e) => { setEncryption(e.target.value) }} className={INPUT}>
              <option value="tls">TLS (port 465)</option>
              <option value="starttls">STARTTLS (port 587)</option>
              <option value="none">None (port 25)</option>
            </select>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Authentication">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Username</label>
            <input value={username} onChange={(e) => { setUsername(e.target.value) }}
              placeholder="you@example.com" autoComplete="off" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>
              Password
              {s.has_password && !clearPw && (
                <span className="ml-2 text-xs font-normal text-tundra-ink-400">
                  (set — leave blank to keep)
                </span>
              )}
            </label>
            {clearPw ? (
              <div className="flex items-center gap-2 h-[42px]">
                <span className="text-sm text-tundra-rust">Password will be cleared on save.</span>
                <button type="button" onClick={() => { setClearPw(false) }}
                  className="text-xs text-tundra-ink-400 hover:text-tundra-ink underline">undo</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input type="password" value={password}
                  onChange={(e) => { setPassword(e.target.value) }}
                  placeholder={s.has_password ? '••••••••' : 'Enter password'}
                  autoComplete="new-password"
                  className={INPUT} />
                {s.has_password && (
                  <button type="button" onClick={() => { setClearPw(true); setPassword('') }}
                    className="shrink-0 rounded-lg border border-tundra-rust-200 px-3 py-2 text-xs text-tundra-rust hover:bg-tundra-rust-50 transition-colors">
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Sender identity">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>From email</label>
            <input type="email" value={fromEmail} onChange={(e) => { setFromEmail(e.target.value) }}
              placeholder="noreply@example.com" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>From name</label>
            <input value={fromName} onChange={(e) => { setFromName(e.target.value) }}
              placeholder="Tundra" className={INPUT} />
          </div>
        </div>
      </SectionCard>

      {testResult && (
        <div className={`rounded-lg border px-4 py-3 text-sm flex items-start gap-2.5 ${
          testResult.ok
            ? 'border-tundra-lichen-200 bg-tundra-lichen-50 text-tundra-lichen-800'
            : 'border-tundra-rust-200 bg-tundra-rust-50 text-tundra-rust-800'
        }`}>
          <span className="text-base leading-tight">{testResult.ok ? '✓' : '✗'}</span>
          <span>{testResult.message}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={testMut.isPending}
          onClick={() => { setTestResult(null); testMut.mutate() }}
          className="rounded-lg border border-tundra-ink-200 px-4 py-2.5 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-40 transition-colors"
        >
          {testMut.isPending ? 'Testing…' : 'Test connection'}
        </button>
        <button
          type="submit"
          disabled={saveMut.isPending}
          className="rounded-lg bg-tundra-lichen px-5 py-2.5 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-40 transition-colors"
        >
          {saveMut.isPending ? 'Saving…' : 'Save SMTP settings'}
        </button>
      </div>
    </form>
  )
}
