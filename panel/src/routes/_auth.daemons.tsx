import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Daemon, ListResponse, Site } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/daemons')({
  component: DaemonsPage,
})

function activeBadge(active: boolean) {
  return active ? (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-lichen-100 text-tundra-lichen-800">
      active
    </span>
  ) : (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-ink-100 text-tundra-ink-600">
      inactive
    </span>
  )
}

function DaemonsPage() {
  const queryClient = useQueryClient()
  const [selectedSite, setSelectedSite] = useState<string>('')

  const { data: sitesData } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api<ListResponse<Site>>('/sites'),
  })

  const sites = sitesData?.data ?? []

  const { data, isLoading, isError } = useQuery({
    queryKey: ['daemons', selectedSite],
    queryFn: () =>
      selectedSite
        ? api<ListResponse<Daemon>>(`/sites/${selectedSite}/daemons`)
        : Promise.resolve({ data: [] as Daemon[], next_cursor: null }),
    enabled: !!selectedSite,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/daemons/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['daemons', selectedSite] })
      toast.success('Daemon deleted')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const daemons = data?.data ?? []
  const selectedSiteObj = sites.find((s) => s.id === selectedSite)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Daemons</h1>
          <p className="mt-1 text-sm text-tundra-ink-500">
            Persistent background processes managed by systemd.
          </p>
        </div>
        {selectedSite && (
          <Link
            to="/sites/$siteId"
            params={{ siteId: selectedSite }}
            className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600"
          >
            + Add daemon
          </Link>
        )}
      </div>

      {/* Site selector */}
      <div className="mb-6">
        <label className="text-sm font-medium text-tundra-ink-600">
          Select site
        </label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {sites.map((s) => (
            <button
              key={s.id}
              onClick={() => { setSelectedSite(s.id) }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${selectedSite === s.id ? 'bg-tundra-ink text-white' : 'bg-tundra-ink-100 text-tundra-ink-600 hover:bg-tundra-ink-200'}`}
            >
              {s.primary_domain}
            </button>
          ))}
          {sites.length === 0 && (
            <p className="text-sm text-tundra-ink-400">No sites found.</p>
          )}
        </div>
      </div>

      {!selectedSite && (
        <div className="rounded-lg border border-tundra-ink-200 py-12 text-center">
          <p className="text-sm text-tundra-ink-400">Select a site above to view its daemons.</p>
        </div>
      )}

      {selectedSite && isLoading && <p className="text-sm text-tundra-ink-400">Loading…</p>}
      {selectedSite && isError && <p className="text-sm text-tundra-rust">Failed to load daemons.</p>}

      {selectedSite && !isLoading && (
        <>
          {selectedSiteObj && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-sm font-medium text-tundra-ink">{selectedSiteObj.primary_domain}</span>
              <span className="text-sm text-tundra-ink-400">— {daemons.length} daemon{daemons.length !== 1 ? 's' : ''}</span>
            </div>
          )}

          {daemons.length === 0 ? (
            <div className="rounded-lg border border-tundra-ink-200 py-12 text-center">
              <p className="text-sm text-tundra-ink-400">No daemons configured for this site.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
              <table className="w-full text-sm">
                <thead className="bg-tundra-ink-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">Command</th>
                    <th className="px-4 py-3 text-left font-medium">Working dir</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Created</th>
                    <th className="px-4 py-3 text-left font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tundra-ink-100">
                  {daemons.map((d) => (
                    <tr key={d.id} className="hover:bg-tundra-ink-50">
                      <td className="px-4 py-3 font-medium">{d.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-tundra-ink-600 max-w-[16rem] truncate">
                        {d.command}
                      </td>
                      <td className="px-4 py-3 text-tundra-ink-500 font-mono text-xs max-w-[12rem] truncate">
                        {d.working_dir}
                      </td>
                      <td className="px-4 py-3">{activeBadge(d.is_active)}</td>
                      <td className="px-4 py-3 text-tundra-ink-400">
                        {new Date(d.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            if (confirm(`Delete daemon "${d.name}"?`)) {
                              deleteMutation.mutate(d.id)
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          className="text-tundra-rust hover:underline text-xs disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
