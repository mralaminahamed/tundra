import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'

export const Route = createFileRoute('/_auth/settings/defaults')({
  component: DefaultsPage,
})

interface DefaultsSettings {
  php_version?: string | null
  php_memory_limit_mb?: number | null
  php_max_execution_sec?: number | null
  php_upload_max_mb?: number | null
  php_post_max_mb?: number | null
  default_disk_quota_mb?: number | null
  default_db_charset?: string | null
  max_sites_per_server?: number | null
  max_dbs_per_site?: number | null
  stats_retention_days?: number | null
  log_retention_days?: number | null
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

const PHP_VERSIONS = ['8.4', '8.3', '8.2', '8.1', '8.0', '7.4']
const DB_CHARSETS = ['utf8mb4', 'utf8', 'latin1', 'ascii']

function DefaultsPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'defaults'],
    queryFn: () => api<{ data: DefaultsSettings }>('/settings/defaults'),
  })
  const s = data?.data ?? {}

  const [phpVersion,     setPhpVersion]     = useState('8.3')
  const [memLimit,       setMemLimit]       = useState('256')
  const [maxExec,        setMaxExec]        = useState('60')
  const [uploadMax,      setUploadMax]      = useState('64')
  const [postMax,        setPostMax]        = useState('64')
  const [diskQuota,      setDiskQuota]      = useState('10240')
  const [dbCharset,      setDbCharset]      = useState('utf8mb4')
  const [maxSites,       setMaxSites]       = useState('')
  const [maxDbs,         setMaxDbs]         = useState('20')
  const [statsRetention, setStatsRetention] = useState('90')
  const [logRetention,   setLogRetention]   = useState('30')

  useEffect(() => {
    if (!data) return
    setPhpVersion(s.php_version ?? '8.3')
    setMemLimit(String(s.php_memory_limit_mb ?? 256))
    setMaxExec(String(s.php_max_execution_sec ?? 60))
    setUploadMax(String(s.php_upload_max_mb ?? 64))
    setPostMax(String(s.php_post_max_mb ?? 64))
    setDiskQuota(String(s.default_disk_quota_mb ?? 10240))
    setDbCharset(s.default_db_charset ?? 'utf8mb4')
    setMaxSites(s.max_sites_per_server != null ? String(s.max_sites_per_server) : '')
    setMaxDbs(String(s.max_dbs_per_site ?? 20))
    setStatsRetention(String(s.stats_retention_days ?? 90))
    setLogRetention(String(s.log_retention_days ?? 30))
  }, [data])

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api('/settings/defaults', { method: 'PATCH', body }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['settings', 'defaults'] }); toast.success('Defaults saved') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  function num(v: string, fallback?: number) {
    const n = parseInt(v, 10)
    return isNaN(n) ? fallback : n
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    saveMut.mutate({
      php_version: phpVersion,
      php_memory_limit_mb: num(memLimit, 256),
      php_max_execution_sec: num(maxExec, 60),
      php_upload_max_mb: num(uploadMax, 64),
      php_post_max_mb: num(postMax, 64),
      default_disk_quota_mb: num(diskQuota, 10240),
      default_db_charset: dbCharset,
      max_sites_per_server: maxSites ? num(maxSites) : null,
      max_dbs_per_site: num(maxDbs, 20),
      stats_retention_days: num(statsRetention, 90),
      log_retention_days: num(logRetention, 30),
    })
  }

  if (isLoading) return <div className="h-48 rounded-xl bg-tundra-ink-100 animate-pulse" />

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <SectionCard title="PHP defaults" desc="Applied when creating new sites. Operators can override per-site.">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={LABEL}>Default PHP version</label>
            <select value={phpVersion} onChange={(e) => { setPhpVersion(e.target.value) }} className={INPUT}>
              {PHP_VERSIONS.map((v) => (
                <option key={v} value={v}>PHP {v}</option>
              ))}
            </select>
          </div>
          {[
            { label: 'Memory limit (MB)', value: memLimit, set: setMemLimit, placeholder: '256', hint: 'memory_limit' },
            { label: 'Max execution time (sec)', value: maxExec, set: setMaxExec, placeholder: '60', hint: 'max_execution_time' },
            { label: 'Upload max filesize (MB)', value: uploadMax, set: setUploadMax, placeholder: '64', hint: 'upload_max_filesize' },
            { label: 'Post max size (MB)', value: postMax, set: setPostMax, placeholder: '64', hint: 'post_max_size' },
          ].map(({ label, value, set, placeholder, hint }) => (
            <div key={hint}>
              <label className={LABEL}>{label}</label>
              <input type="number" value={value} onChange={(e) => { set(e.target.value) }}
                min={1} placeholder={placeholder} className={INPUT} />
              <p className="mt-0.5 text-[10px] text-tundra-ink-300 font-mono">{hint}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Sites &amp; databases" desc="Applied to new sites and databases at creation time.">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Default disk quota (MB)</label>
            <input type="number" value={diskQuota} onChange={(e) => { setDiskQuota(e.target.value) }}
              min={100} placeholder="10240" className={INPUT} />
            <p className="mt-1 text-xs text-tundra-ink-400">0 = unlimited. Default: 10 240 MB (10 GB).</p>
          </div>
          <div>
            <label className={LABEL}>Default database charset</label>
            <select value={dbCharset} onChange={(e) => { setDbCharset(e.target.value) }} className={INPUT}>
              {DB_CHARSETS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>
              Max sites per server
              <span className="ml-1 text-xs font-normal text-tundra-ink-400">(optional)</span>
            </label>
            <input type="number" value={maxSites} onChange={(e) => { setMaxSites(e.target.value) }}
              min={1} placeholder="Unlimited" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Max databases per site</label>
            <input type="number" value={maxDbs} onChange={(e) => { setMaxDbs(e.target.value) }}
              min={1} placeholder="20" className={INPUT} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Data retention" desc="Log and statistics data older than these limits is pruned automatically.">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Statistics retention (days)</label>
            <input type="number" value={statsRetention} onChange={(e) => { setStatsRetention(e.target.value) }}
              min={1} placeholder="90" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Log retention (days)</label>
            <input type="number" value={logRetention} onChange={(e) => { setLogRetention(e.target.value) }}
              min={1} placeholder="30" className={INPUT} />
          </div>
        </div>
      </SectionCard>

      <div className="flex justify-end gap-3">
        <button type="submit" disabled={saveMut.isPending}
          className="rounded-lg bg-tundra-lichen px-5 py-2.5 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-40 transition-colors">
          {saveMut.isPending ? 'Saving…' : 'Save defaults'}
        </button>
      </div>
    </form>
  )
}
