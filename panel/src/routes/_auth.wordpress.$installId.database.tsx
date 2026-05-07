import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { type WpInstallation } from '@/components/wp-shared'
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { LoadingIcon } from '@/components/icons'

export const Route = createFileRoute('/_auth/wordpress/$installId/database')({
  component: WpDatabaseTab,
})

function WpDatabaseTab() {
  const { installId } = Route.useParams()
  const [searchFrom, setSearchFrom] = useState('')
  const [searchTo, setSearchTo] = useState('')
  const [previewResult, setPreviewResult] = useState<string | null>(null)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [changePwOpen, setChangePwOpen] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [showNewPw, setShowNewPw] = useState(false)

  const { data: install } = useQuery<WpInstallation>({
    queryKey: ['wp-installation', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}`).then((r) => r.json()),
  })

  const { data: dbPwData, isFetching: pwLoading } = useQuery<{ password: string }>({
    queryKey: ['wp-db-password', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/database/password`, { credentials: 'include' })
        .then((r) => r.json()),
    enabled: passwordVisible,
    staleTime: 30_000,
  })

  const optimizeMut = useMutation({
    mutationFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/database/optimize`, {
        method: 'POST', credentials: 'include',
      }).then((r) => r.json() as Promise<{ message: string }>),
    onSuccess: (d) => toast.success(d.message || 'Tables optimized'),
    onError:   () => toast.error('Optimize failed'),
  })

  const repairMut = useMutation({
    mutationFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/database/repair`, {
        method: 'POST', credentials: 'include',
      }).then((r) => r.json() as Promise<{ message: string }>),
    onSuccess: (d) => toast.success(d.message || 'Tables repaired'),
    onError:   () => toast.error('Repair failed'),
  })

  const searchReplaceMut = useMutation({
    mutationFn: ({ from, to, dry_run }: { from: string; to: string; dry_run?: boolean }) =>
      fetch(`/api/v1/wordpress/installations/${installId}/database/search-replace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, dry_run }),
        credentials: 'include',
      }).then((r) => r.json() as Promise<{ message: string }>),
    onSuccess: (d, vars) => {
      if (vars.dry_run) {
        setPreviewResult(d.message || 'No changes would be made')
      } else {
        toast.success(d.message || 'Search & replace complete')
        setPreviewResult(null)
      }
    },
    onError: () => toast.error('Search & replace failed'),
  })

  const changePwMut = useMutation({
    mutationFn: (pw: string) =>
      fetch(`/api/v1/wordpress/installations/${installId}/database/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: pw }),
        credentials: 'include',
      }).then(async (r) => {
        if (!r.ok) {
          const err = await r.json() as { error?: { message?: string } }
          throw new Error(err.error?.message ?? 'Failed')
        }
        return r.json() as Promise<{ ok: boolean }>
      }),
    onSuccess: () => {
      toast.success('DB password rotated — wp-config.php updated')
      setChangePwOpen(false)
      setNewPw('')
      setPasswordVisible(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Password change failed'),
  })

  if (!install) return null

  const phpMyAdminUrl = `/tools/phpmyadmin?installId=${installId}`

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Credentials */}
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Database Credentials</span>
          </div>
          <div className="divide-y divide-tundra-ink-100">
            {[
              { label: 'Database Name', value: install.db_name ?? '—' },
              { label: 'DB Username',   value: install.db_user ?? '—' },
              { label: 'DB Host',       value: install.db_host ?? 'localhost' },
              { label: 'Table Prefix',  value: install.db_prefix ?? 'wp_' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                <span className="w-32 shrink-0 text-tundra-ink-400">{label}</span>
                <span className="flex-1 font-mono text-tundra-ink">{value}</span>
                <button type="button"
                  onClick={() => { void navigator.clipboard.writeText(value); toast.success('Copied') }}
                  className="text-tundra-ink-300 hover:text-tundra-ink-500 transition-colors">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                  </svg>
                </button>
              </div>
            ))}

            {/* DB Password row */}
            <div className="flex items-center gap-4 px-4 py-2.5 text-sm">
              <span className="w-32 shrink-0 text-tundra-ink-400">DB Password</span>
              <span className="flex-1 font-mono text-tundra-ink">
                {pwLoading
                  ? <span className="text-tundra-ink-300"><LoadingIcon size={12} className="inline animate-spin mr-1" />Loading…</span>
                  : passwordVisible && dbPwData?.password
                    ? dbPwData.password
                    : '••••••••'}
              </span>
              <div className="flex items-center gap-2">
                <button type="button"
                  onClick={() => setPasswordVisible((v) => !v)}
                  className="text-xs text-tundra-aurora hover:underline transition-colors">
                  {passwordVisible ? 'Hide' : 'Reveal'}
                </button>
                {passwordVisible && dbPwData?.password && (
                  <button type="button"
                    onClick={() => { void navigator.clipboard.writeText(dbPwData.password); toast.success('Password copied') }}
                    className="text-tundra-ink-300 hover:text-tundra-ink-500 transition-colors">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <a href={phpMyAdminUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-tundra-ink-200 bg-white px-4 py-3 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M3 5v14c0 1.657 4.03 3 9 3s9-1.343 9-3V5"/>
            <path d="M3 12c0 1.657 4.03 3 9 3s9-1.343 9-3"/>
          </svg>
          Open phpMyAdmin
          <svg className="h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
          </svg>
        </a>
      </div>

      {/* Search & Replace + Actions */}
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Search &amp; Replace in Database</span>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-tundra-ink-400">
              Safely find and replace text across all database tables. Useful for URL migration or domain changes.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Search for</label>
              <input type="text" placeholder="https://old-domain.com" value={searchFrom}
                onChange={(e) => setSearchFrom(e.target.value)}
                className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Replace with</label>
              <input type="text" placeholder="https://new-domain.com" value={searchTo}
                onChange={(e) => setSearchTo(e.target.value)}
                className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none" />
            </div>
            <div className="flex gap-2">
              <button type="button"
                disabled={!searchFrom || !searchTo || searchReplaceMut.isPending}
                onClick={() => { setPreviewResult(null); searchReplaceMut.mutate({ from: searchFrom, to: searchTo, dry_run: true }) }}
                className="flex-1 rounded-lg border border-tundra-ink-200 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors disabled:opacity-50">
                {searchReplaceMut.isPending && searchReplaceMut.variables?.dry_run ? 'Previewing…' : 'Preview Changes'}
              </button>
              <button type="button"
                disabled={!searchFrom || !searchTo || searchReplaceMut.isPending}
                onClick={() => { setPreviewResult(null); searchReplaceMut.mutate({ from: searchFrom, to: searchTo }) }}
                className="flex-1 rounded-lg bg-tundra-lichen py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
                {searchReplaceMut.isPending && !searchReplaceMut.variables?.dry_run ? 'Running…' : 'Run Replace'}
              </button>
            </div>
            {previewResult && (
              <pre className="mt-2 max-h-36 overflow-auto rounded-xl border border-tundra-ink-100 bg-tundra-ink-50 p-3 text-[11px] font-mono text-tundra-ink whitespace-pre-wrap">
                {previewResult}
              </pre>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Actions</span>
          </div>
          <div className="divide-y divide-tundra-ink-100">
            <DbActionRow label="Optimize Tables"    desc="Reclaim space and improve performance"   action="Optimize" isPending={optimizeMut.isPending} onClick={() => optimizeMut.mutate()} />
            <DbActionRow label="Repair Tables"      desc="Fix corrupted or crashed tables"          action="Repair"   isPending={repairMut.isPending}   onClick={() => repairMut.mutate()} />
            <DbActionRow label="Export Database"    desc="Download a full SQL dump"                 action="Export"
              onClick={() => { window.location.href = `/api/v1/wordpress/installations/${installId}/database/export` }} />
            <DbActionRow label="Change DB Password" desc="Rotate the database user password and update wp-config.php" action="Change"
              onClick={() => { setChangePwOpen(true); setNewPw(''); setShowNewPw(false) }} />
          </div>
        </div>
      </div>

      {/* Change DB Password modal */}
      <Dialog open={changePwOpen} onClose={() => setChangePwOpen(false)} maxWidth="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change DB Password</DialogTitle>
          <DialogDescription>
            Rotates <span className="font-mono">{install.db_user}</span>'s MySQL password and updates wp-config.php automatically.
          </DialogDescription>
        </DialogHeader>

        <div>
          <label className="mb-1 block text-xs font-medium text-tundra-ink-500">New password</label>
          <div className="relative">
            <input
              type={showNewPw ? 'text' : 'password'}
              placeholder="Min. 8 characters"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              autoFocus
              className="h-9 w-full rounded-lg border border-tundra-ink-200 pl-3 pr-9 font-mono text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
            />
            <button type="button" onClick={() => setShowNewPw((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tundra-ink-400 hover:text-tundra-ink transition-colors">
              {showNewPw
                ? <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>
                : <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              }
            </button>
          </div>
        </div>

        <DialogFooter>
          <button type="button" onClick={() => setChangePwOpen(false)}
            className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
            Cancel
          </button>
          <button type="button"
            disabled={newPw.length < 8 || changePwMut.isPending}
            onClick={() => changePwMut.mutate(newPw)}
            className="flex items-center gap-1.5 rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
            {changePwMut.isPending && <LoadingIcon size={13} className="animate-spin" />}
            {changePwMut.isPending ? 'Rotating…' : 'Rotate Password'}
          </button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

function DbActionRow({ label, desc, action, onClick, isPending = false }: {
  label: string; desc: string; action: string
  onClick: () => void; isPending?: boolean
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <p className="text-sm font-medium text-tundra-ink">{label}</p>
        <p className="text-xs text-tundra-ink-400">{desc}</p>
      </div>
      <button type="button" onClick={onClick} disabled={isPending}
        className="rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors disabled:opacity-50">
        {isPending ? '…' : action}
      </button>
    </div>
  )
}
