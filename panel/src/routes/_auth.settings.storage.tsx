import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'

interface TestResult { ok: boolean; message: string }

export const Route = createFileRoute('/_auth/settings/storage')({
  component: StoragePage,
})

interface BackupSettings {
  default_retention_days?: number | null
  s3_endpoint?: string | null
  s3_bucket?: string | null
  s3_region?: string | null
  s3_access_key?: string | null
  has_s3_secret_key: boolean
  default_schedule?: string | null
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

function StoragePage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'backups'],
    queryFn: () => api<{ data: BackupSettings }>('/settings/backups'),
  })

  const s = data?.data ?? { has_s3_secret_key: false }

  const [retentionDays, setRetentionDays] = useState('30')
  const [schedule,      setSchedule]      = useState('0 2 * * *')
  const [endpoint,      setEndpoint]      = useState('')
  const [bucket,        setBucket]        = useState('')
  const [region,        setRegion]        = useState('us-east-1')
  const [accessKey,     setAccessKey]     = useState('')
  const [secretKey,     setSecretKey]     = useState('')
  const [clearSecret,   setClearSecret]   = useState(false)

  useEffect(() => {
    if (!data) return
    setRetentionDays(String(s.default_retention_days ?? 30))
    setSchedule(s.default_schedule ?? '0 2 * * *')
    setEndpoint(s.s3_endpoint ?? '')
    setBucket(s.s3_bucket ?? '')
    setRegion(s.s3_region ?? 'us-east-1')
    setAccessKey(s.s3_access_key ?? '')
  }, [data])

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/settings/backups', { method: 'PATCH', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings', 'backups'] })
      setSecretKey('')
      setClearSecret(false)
      toast.success('Backup storage settings saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const testMut = useMutation({
    mutationFn: () => api<TestResult>('/settings/storage/test', { method: 'POST' }),
    onSuccess: (r) => { setTestResult(r) },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Test failed'),
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const body: Record<string, unknown> = {
      default_retention_days: retentionDays ? parseInt(retentionDays, 10) : 30,
      default_schedule:       schedule.trim() || null,
      s3_endpoint:            endpoint.trim() || null,
      s3_bucket:              bucket.trim() || null,
      s3_region:              region.trim() || null,
      s3_access_key:          accessKey.trim() || null,
    }
    if (clearSecret) {
      body.s3_secret_key = null
    } else if (secretKey) {
      body.s3_secret_key = secretKey
    }
    saveMut.mutate(body)
  }

  if (isLoading) {
    return <div className="h-64 rounded-xl bg-tundra-ink-100 animate-pulse" />
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <SectionCard title="Backup policy" desc="Defaults applied to all sites unless overridden per-site.">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Default retention (days)</label>
            <input
              type="number"
              value={retentionDays}
              onChange={(e) => { setRetentionDays(e.target.value) }}
              min={1}
              max={3650}
              placeholder="30"
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Default schedule (cron)</label>
            <input
              value={schedule}
              onChange={(e) => { setSchedule(e.target.value) }}
              placeholder="0 2 * * *"
              className={`${INPUT} font-mono`}
            />
            <p className="mt-1 text-xs text-tundra-ink-400">Uses the platform timezone from General settings.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="S3-compatible storage" desc="Used for off-site backup storage. Works with AWS S3, Backblaze B2, Cloudflare R2, MinIO, and any S3-compatible provider.">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={LABEL}>
              Endpoint URL
              <span className="ml-1 text-xs font-normal text-tundra-ink-400">(leave blank for AWS S3)</span>
            </label>
            <input
              value={endpoint}
              onChange={(e) => { setEndpoint(e.target.value) }}
              placeholder="https://s3.us-east-1.amazonaws.com"
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Bucket</label>
            <input
              value={bucket}
              onChange={(e) => { setBucket(e.target.value) }}
              placeholder="my-tundra-backups"
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Region</label>
            <input
              value={region}
              onChange={(e) => { setRegion(e.target.value) }}
              placeholder="us-east-1"
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Access key ID</label>
            <input
              value={accessKey}
              onChange={(e) => { setAccessKey(e.target.value) }}
              placeholder="AKIAIOSFODNN7EXAMPLE"
              autoComplete="off"
              className={`${INPUT} font-mono`}
            />
          </div>
          <div>
            <label className={LABEL}>
              Secret access key
              {s.has_s3_secret_key && !clearSecret && (
                <span className="ml-2 text-xs font-normal text-tundra-ink-400">(set — leave blank to keep)</span>
              )}
            </label>
            {clearSecret ? (
              <div className="flex items-center gap-2 h-[42px]">
                <span className="text-sm text-tundra-rust">Secret will be cleared on save.</span>
                <button type="button" onClick={() => { setClearSecret(false) }}
                  className="text-xs text-tundra-ink-400 hover:text-tundra-ink underline">undo</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="password"
                  value={secretKey}
                  onChange={(e) => { setSecretKey(e.target.value) }}
                  placeholder={s.has_s3_secret_key ? '••••••••••••••••••••' : 'Enter secret key'}
                  autoComplete="new-password"
                  className={`${INPUT} font-mono`}
                />
                {s.has_s3_secret_key && (
                  <button type="button" onClick={() => { setClearSecret(true); setSecretKey('') }}
                    className="shrink-0 rounded-lg border border-tundra-rust-200 px-3 py-2 text-xs text-tundra-rust hover:bg-tundra-rust-50 transition-colors">
                    Clear
                  </button>
                )}
              </div>
            )}
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
          {testMut.isPending ? 'Testing…' : 'Test S3 connection'}
        </button>
        <button
          type="submit"
          disabled={saveMut.isPending}
          className="rounded-lg bg-tundra-lichen px-5 py-2.5 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-40 transition-colors"
        >
          {saveMut.isPending ? 'Saving…' : 'Save storage settings'}
        </button>
      </div>
    </form>
  )
}
