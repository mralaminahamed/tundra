import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { api } from '@/lib/api'
import type { ListResponse, Site, Server } from '@/lib/api-types'
import { SiteStatusPill } from '@/components/site-shared'

export const Route = createFileRoute('/_auth/files/')({
  component: FilesIndex,
})

function FilesIndex() {
  const [search, setSearch] = useState('')

  const { data: sitesData, isLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api<ListResponse<Site>>('/sites'),
  })
  const { data: serversData } = useQuery({
    queryKey: ['servers'],
    queryFn: () => api<ListResponse<Server>>('/servers'),
  })

  const sites = sitesData?.data ?? []
  const serverMap = new Map<string, Server>((serversData?.data ?? []).map((s) => [s.id, s]))

  const filtered = useMemo(
    () => sites.filter((s) =>
      !search ||
      s.primary_domain.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase()),
    ),
    [sites, search],
  )

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-tundra-ink">File Manager</h1>
        <p className="mt-0.5 text-sm text-tundra-ink-400">
          Select a site to browse and manage its files
        </p>
      </div>

      {/* Search + table */}
      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
        <div className="flex items-center justify-between border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">
            Sites — {filtered.length}
          </span>
          <div className="relative">
            <svg className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="search"
              placeholder="Search sites…"
              value={search}
              onChange={(e) => { setSearch(e.target.value) }}
              className="h-7 w-56 rounded-lg border border-tundra-ink-200 bg-white pl-8 pr-3 text-xs focus:border-tundra-lichen focus:outline-none"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-px">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <div className="h-4 w-48 animate-pulse rounded bg-tundra-ink-100" />
                <div className="h-4 w-16 animate-pulse rounded bg-tundra-ink-100" />
                <div className="ml-auto h-7 w-24 animate-pulse rounded bg-tundra-ink-100" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <svg className="h-10 w-10 text-tundra-ink-200" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            <p className="text-sm font-medium text-tundra-ink-400">No sites found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
              <tr>
                <th className="px-4 py-2.5 text-left">Domain</th>
                <th className="hidden px-4 py-2.5 text-left sm:table-cell">Status</th>
                <th className="hidden px-4 py-2.5 text-left md:table-cell">Server</th>
                <th className="hidden px-4 py-2.5 text-left lg:table-cell">Document root</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {filtered.map((s) => {
                const server = serverMap.get(s.server_id)
                return (
                  <tr key={s.id} className="hover:bg-tundra-ink-50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <Link
                          to="/files/$siteId"
                          params={{ siteId: s.id }}
                          search={{ path: '/' }}
                          className="text-sm font-semibold text-tundra-ink hover:text-tundra-aurora transition-colors"
                        >
                          {s.primary_domain}
                        </Link>
                        {s.name !== s.primary_domain && (
                          <p className="text-xs text-tundra-ink-400">{s.name}</p>
                        )}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <SiteStatusPill status={s.status} />
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-tundra-ink-500 md:table-cell">
                      {server?.name ?? <span className="text-tundra-ink-300">—</span>}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <code className="rounded bg-tundra-ink-50 px-1.5 py-0.5 font-mono text-[11px] text-tundra-ink-500">
                        {s.document_root}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          to="/files/$siteId"
                          params={{ siteId: s.id }}
                          search={{ path: '/' }}
                          className="flex items-center gap-1.5 rounded-lg bg-tundra-lichen px-3 py-1.5 text-xs font-medium text-white hover:bg-tundra-lichen-600 transition-colors"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                          </svg>
                          Manage files
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
