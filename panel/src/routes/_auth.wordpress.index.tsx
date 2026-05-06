import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

export const Route = createFileRoute('/_auth/wordpress/')({
  component: WordPressPage,
})

interface WpInstallation {
  id: string
  site_id: string
  wp_version: string | null
  wp_path: string
  site_title: string | null
  site_url: string | null
  admin_email: string | null
  state: 'provisioning' | 'active' | 'error' | 'removing'
  error_message: string | null
  created_at: string
}

interface Site {
  id: string
  name: string
  primary_domain: string
}

function StatePill({ state }: { state: WpInstallation['state'] }) {
  const map: Record<string, string> = {
    provisioning: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    active: 'bg-green-100 text-green-800 border-green-300',
    error: 'bg-red-100 text-red-800 border-red-300',
    removing: 'bg-gray-100 text-gray-500 border-gray-300',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${map[state] ?? ''}`}
    >
      {state === 'provisioning' && (
        <span className="size-1.5 animate-pulse rounded-full bg-yellow-500" />
      )}
      {state}
    </span>
  )
}

function InstallModal({
  sites,
  onClose,
  onInstall,
}: {
  sites: Site[]
  onClose: () => void
  onInstall: (siteId: string, siteTitle: string, adminEmail: string) => void
}) {
  const [siteId, setSiteId] = useState('')
  const [siteTitle, setSiteTitle] = useState('')
  const [adminEmail, setAdminEmail] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg border border-stone-200 bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">Install WordPress</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              Site
            </label>
            <select
              value={siteId}
              onChange={(e) => { setSiteId(e.target.value); }}
              className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            >
              <option value="">Select a site…</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.primary_domain} — {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              Site Title
            </label>
            <input
              type="text"
              placeholder="My WordPress Site"
              value={siteTitle}
              onChange={(e) => { setSiteTitle(e.target.value); }}
              className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              Admin Email
            </label>
            <input
              type="email"
              placeholder="admin@example.com"
              value={adminEmail}
              onChange={(e) => { setAdminEmail(e.target.value); }}
              className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            disabled={!siteId}
            onClick={() => { onInstall(siteId, siteTitle, adminEmail); }}
            className="rounded bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-700 disabled:opacity-40"
          >
            Install WordPress
          </button>
        </div>
      </div>
    </div>
  )
}

function WordPressPage() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)

  const { data: installs = [], isLoading } = useQuery<WpInstallation[]>({
    queryKey: ['wp-installations'],
    queryFn: () =>
      fetch('/api/v1/wordpress/installations')
        .then((r) => r.json())
        .then((r: { data: WpInstallation[] }) => r.data),
  })

  const { data: sites = [] } = useQuery<Site[]>({
    queryKey: ['sites-list'],
    queryFn: () =>
      fetch('/api/v1/sites')
        .then((r) => r.json())
        .then((r: { data: Site[] }) => r.data),
    enabled: showModal,
  })

  const installMutation = useMutation({
    mutationFn: (body: {
      site_id: string
      site_title: string
      admin_email: string
    }) =>
      fetch('/api/v1/wordpress/installations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-installations'] })
      setShowModal(false)
    },
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/v1/wordpress/installations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-installations'] })
    },
  })

  return (
    <div className="p-6">
      {showModal && (
        <InstallModal
          sites={sites}
          onClose={() => { setShowModal(false); }}
          onInstall={(siteId, siteTitle, adminEmail) =>
            { installMutation.mutate({
              site_id: siteId,
              site_title: siteTitle,
              admin_email: adminEmail,
            }); }
          }
        />
      )}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">WordPress</h1>
          <p className="mt-1 text-sm text-stone-500">
            {String(installs.length)} installation{installs.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => { setShowModal(true); }}
          className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
        >
          + Install WordPress
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-stone-100" />
          ))}
        </div>
      ) : installs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 p-12 text-center">
          <p className="text-stone-500">No WordPress installations yet.</p>
          <button
            onClick={() => { setShowModal(true); }}
            className="mt-3 text-sm text-stone-700 underline"
          >
            Install your first WordPress site →
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs font-medium uppercase text-stone-500">
              <tr>
                <th className="px-4 py-3 text-left">Site / URL</th>
                <th className="px-4 py-3 text-left">WP Version</th>
                <th className="px-4 py-3 text-left">Path</th>
                <th className="px-4 py-3 text-left">State</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {installs.map((inst) => (
                <tr key={inst.id} className="group hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-stone-900">
                      {inst.site_title ?? inst.site_id}
                    </div>
                    {inst.site_url && (
                      <div className="text-xs text-stone-400">{inst.site_url}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {inst.wp_version ?? '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-stone-500">
                    {inst.wp_path}
                  </td>
                  <td className="px-4 py-3">
                    <StatePill state={inst.state} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        to="/wordpress/$installId"
                        params={{ installId: inst.id }}
                        className="rounded border border-stone-200 px-2 py-1 text-xs hover:bg-stone-100"
                      >
                        Manage →
                      </Link>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              'Mark this WordPress installation for removal? Files will be deleted on next agent sync.',
                            )
                          ) {
                            removeMutation.mutate(inst.id)
                          }
                        }}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
