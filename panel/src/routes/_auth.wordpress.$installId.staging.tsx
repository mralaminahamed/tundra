import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  CopyIcon, FlaskIcon, ArrowUpIcon, ExternalLinkIcon,
  CheckCircleIcon, LoadingIcon, AlertIcon,
} from '@/components/icons'

export const Route = createFileRoute('/_auth/wordpress/$installId/staging')({
  component: WpStagingTab,
})

interface StagingStatus {
  has_staging: boolean
  staging_install_id: string | null
  staging_state: string | null
  staging_url: string | null
  is_staging: boolean
  source_install_id: string | null
}

interface WpInstall {
  id: string
  site_title?: string
  site_url?: string
  state: string
}

function Statebadge({ state }: { state: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    active:       { label: 'Active',       cls: 'bg-green-100 text-green-700' },
    provisioning: { label: 'Provisioning', cls: 'bg-yellow-100 text-yellow-700' },
    syncing:      { label: 'Syncing',      cls: 'bg-blue-100 text-blue-700' },
    error:        { label: 'Error',        cls: 'bg-red-100 text-red-700' },
  }
  const { label, cls } = cfg[state] ?? { label: state, cls: 'bg-tundra-ink-100 text-tundra-ink-500' }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {state === 'provisioning' || state === 'syncing'
        ? <LoadingIcon size={12} className="animate-spin" />
        : <CheckCircleIcon size={12} />}
      {label}
    </span>
  )
}

function WpStagingTab() {
  const { installId } = Route.useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [stagingDomain, setStagingDomain] = useState('')
  const [cloneDomain, setCloneDomain] = useState('')
  const [showCloneForm, setShowCloneForm] = useState(false)

  const { data: status, isLoading } = useQuery<StagingStatus>({
    queryKey: ['wp-staging', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/staging`).then((r) => r.json()),
    refetchInterval: (q) => {
      const s = q.state.data?.staging_state
      return s === 'provisioning' || s === 'syncing' ? 5000 : false
    },
  })

  const { data: install } = useQuery<WpInstall>({
    queryKey: ['wp-installation', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}`).then((r) => r.json()),
  })

  const createStaging = useMutation({
    mutationFn: (domain: string) =>
      fetch(`/api/v1/wordpress/installations/${installId}/staging`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staging_domain: domain || undefined }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error?.message ?? 'Failed')
        return r.json()
      }),
    onSuccess: () => {
      toast.success('Staging environment is being created…')
      qc.invalidateQueries({ queryKey: ['wp-staging', installId] })
      setStagingDomain('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const pushToLive = useMutation({
    mutationFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/staging/push-to-live`, {
        method: 'POST',
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error?.message ?? 'Failed')
        return r.json()
      }),
    onSuccess: () => {
      toast.success('Pushing staging to live…')
      qc.invalidateQueries({ queryKey: ['wp-staging', installId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const cloneInstall = useMutation({
    mutationFn: (domain: string) =>
      fetch(`/api/v1/wordpress/installations/${installId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_domain: domain || undefined }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error?.message ?? 'Failed')
        return r.json() as Promise<{ installation_id: string }>
      }),
    onSuccess: (data) => {
      toast.success('Clone created')
      setShowCloneForm(false)
      setCloneDomain('')
      navigate({ to: '/wordpress/$installId', params: { installId: data.installation_id } })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-tundra-ink-400">
        <LoadingIcon size={16} className="animate-spin" /> Loading…
      </div>
    )
  }

  // If this IS a staging env, show the "push to live" view
  if (status?.is_staging) {
    return (
      <div className="max-w-2xl space-y-6">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-start gap-3">
            <FlaskIcon size={20} className="mt-0.5 shrink-0 text-blue-600" />
            <div>
              <p className="font-semibold text-blue-900">This is a staging environment</p>
              <p className="mt-0.5 text-sm text-blue-700">
                Changes here are isolated. Push to live when ready.
              </p>
              {install?.site_url && (
                <a
                  href={install.site_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                >
                  {install.site_url}
                  <ExternalLinkIcon size={12} />
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">
          <h3 className="font-semibold text-tundra-ink-900">Push Staging to Live</h3>
          <p className="mt-1 text-sm text-tundra-ink-500">
            Copies the staging database and files to the production environment, then rewrites all URLs.
            <strong className="text-tundra-ink-700"> This overwrites the production database.</strong>
          </p>
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-start gap-2">
            <AlertIcon size={16} className="mt-0.5 shrink-0" />
            <span>Take a backup of production before proceeding. This cannot be undone.</span>
          </div>
          <button
            onClick={() => {
              if (confirm('Push staging to live? This will overwrite the production database and files.')) {
                pushToLive.mutate()
              }
            }}
            disabled={pushToLive.isPending || install?.state === 'syncing'}
            className="mt-4 flex items-center gap-2 rounded-lg bg-tundra-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-tundra-ink-700 disabled:opacity-50 transition-colors"
          >
            {pushToLive.isPending ? <LoadingIcon size={14} className="animate-spin" /> : <ArrowUpIcon size={14} />}
            Push to Live
          </button>
        </div>

        {status.source_install_id && (
          <p className="text-xs text-tundra-ink-400">
            Source installation:{' '}
            <button
              onClick={() => navigate({ to: '/wordpress/$installId', params: { installId: status.source_install_id! } })}
              className="text-tundra-blue-600 hover:underline"
            >
              View production
            </button>
          </p>
        )}
      </div>
    )
  }

  // Production view: show staging card + clone card
  return (
    <div className="max-w-2xl space-y-6">

      {/* ── Staging section ─────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-tundra-ink-400">
          Staging Environment
        </h2>

        {status?.has_staging ? (
          <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FlaskIcon size={20} className="text-tundra-blue-600" />
                <div>
                  <p className="font-medium text-tundra-ink-900">Staging</p>
                  {status.staging_url && (
                    <a
                      href={status.staging_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-tundra-ink-500 hover:underline"
                    >
                      {status.staging_url}
                      <ExternalLinkIcon size={10} />
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {status.staging_state && <Statebadge state={status.staging_state} />}
                {status.staging_install_id && (
                  <button
                    onClick={() => navigate({ to: '/wordpress/$installId', params: { installId: status.staging_install_id! } })}
                    className="rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs font-medium hover:bg-tundra-ink-50 transition-colors"
                  >
                    Manage
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">
            <p className="text-sm text-tundra-ink-600">
              Create an isolated staging copy of this installation. Files and database are cloned to a separate environment.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-tundra-ink-700">
                  Staging domain <span className="text-tundra-ink-400">(optional — auto-derived from production domain)</span>
                </label>
                <input
                  type="text"
                  value={stagingDomain}
                  onChange={(e) => setStagingDomain(e.target.value)}
                  placeholder={`staging.${install?.site_url?.replace(/^https?:\/\//, '') ?? 'example.com'}`}
                  className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-blue-500 focus:outline-none"
                />
              </div>
              <button
                onClick={() => createStaging.mutate(stagingDomain)}
                disabled={createStaging.isPending}
                className="flex items-center gap-2 rounded-lg bg-tundra-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-tundra-blue-700 disabled:opacity-50 transition-colors"
              >
                {createStaging.isPending ? <LoadingIcon size={14} className="animate-spin" /> : <FlaskIcon size={14} />}
                Create Staging Environment
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Clone section ────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-tundra-ink-400">
          Clone Installation
        </h2>
        <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">
          <p className="text-sm text-tundra-ink-600">
            Create a full independent copy of this installation (files + database) under a new domain.
          </p>
          {!showCloneForm ? (
            <button
              onClick={() => setShowCloneForm(true)}
              className="mt-4 flex items-center gap-2 rounded-lg border border-tundra-ink-300 px-4 py-2 text-sm font-medium text-tundra-ink-700 hover:bg-tundra-ink-50 transition-colors"
            >
              <CopyIcon size={14} />
              Clone this installation
            </button>
          ) : (
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-tundra-ink-700">
                  New domain <span className="text-tundra-ink-400">(required)</span>
                </label>
                <input
                  type="text"
                  value={cloneDomain}
                  onChange={(e) => setCloneDomain(e.target.value)}
                  placeholder="copy.example.com"
                  className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => cloneInstall.mutate(cloneDomain)}
                  disabled={cloneInstall.isPending || !cloneDomain.trim()}
                  className="flex items-center gap-2 rounded-lg bg-tundra-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-tundra-ink-700 disabled:opacity-50 transition-colors"
                >
                  {cloneInstall.isPending ? <LoadingIcon size={14} className="animate-spin" /> : <CopyIcon size={14} />}
                  Clone
                </button>
                <button
                  onClick={() => { setShowCloneForm(false); setCloneDomain('') }}
                  className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
