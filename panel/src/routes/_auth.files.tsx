import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { ListResponse, Site, Server } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/files')({
  component: FilesPage,
})

type FileEntry = { name: string; type: 'dir' | 'file'; size?: number; modified?: string; perms?: string }

const MOCK_FILES: FileEntry[] = [
  { name: 'index.php',          type: 'file', size: 418,      modified: '2025-05-01', perms: '644' },
  { name: 'wp-config.php',      type: 'file', size: 3012,     modified: '2025-04-28', perms: '640' },
  { name: 'wp-content',         type: 'dir',                   modified: '2025-05-10', perms: '755' },
  { name: 'wp-includes',        type: 'dir',                   modified: '2025-04-15', perms: '755' },
  { name: 'wp-admin',           type: 'dir',                   modified: '2025-04-15', perms: '755' },
  { name: '.htaccess',          type: 'file', size: 406,       modified: '2025-04-20', perms: '644' },
  { name: 'robots.txt',         type: 'file', size: 67,        modified: '2025-04-01', perms: '644' },
  { name: 'xmlrpc.php',         type: 'file', size: 3065,      modified: '2025-04-15', perms: '644' },
  { name: 'license.txt',        type: 'file', size: 19935,     modified: '2025-03-01', perms: '644' },
  { name: '.well-known',        type: 'dir',                   modified: '2025-02-10', perms: '755' },
]

function fmt(bytes?: number) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function FileIcon({ type, name }: { type: 'dir' | 'file'; name: string }) {
  if (type === 'dir') return (
    <svg className="h-4 w-4 text-tundra-aurora" fill="currentColor" viewBox="0 0 20 20">
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
    </svg>
  )
  const ext = name.split('.').pop()?.toLowerCase()
  const color = ext === 'php' ? 'text-purple-500' : ext === 'js' ? 'text-yellow-500' : ext === 'css' ? 'text-blue-500' : ext === 'txt' || ext === 'md' ? 'text-tundra-ink-400' : 'text-tundra-ink-300'
  return (
    <svg className={`h-4 w-4 ${color}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
    </svg>
  )
}

function FilesPage() {
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [path, setPath] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

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
  const selectedSite = sites.find((s) => s.id === selectedSiteId)

  const [siteSearch, setSiteSearch] = useState('')
  const filteredSites = useMemo(() =>
    sites.filter((s) => !siteSearch || s.primary_domain.toLowerCase().includes(siteSearch.toLowerCase()) || s.name.toLowerCase().includes(siteSearch.toLowerCase())),
    [sites, siteSearch],
  )

  const entries = MOCK_FILES.filter((f) => !search || f.name.toLowerCase().includes(search.toLowerCase()))
  const allSel = entries.length > 0 && entries.every((e) => selected.has(e.name))

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-tundra-ink">File Manager</h1>
          <p className="mt-0.5 text-sm text-tundra-ink-400">Browse and manage files across all your sites</p>
        </div>
      </div>

      <div className="flex gap-4 overflow-hidden rounded-xl border border-tundra-ink-200 bg-white" style={{ minHeight: 520 }}>
        {/* Site list sidebar */}
        <div className="w-60 shrink-0 border-r border-tundra-ink-100 flex flex-col">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 p-3">
            <div className="relative">
              <svg className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input type="search" placeholder="Find site…" value={siteSearch}
                onChange={(e) => { setSiteSearch(e.target.value) }}
                className="w-full rounded-lg border border-tundra-ink-200 bg-white py-1.5 pl-8 pr-3 text-xs focus:border-tundra-lichen focus:outline-none" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-3 space-y-2">{[1,2,3,4,5].map((i)=><div key={i} className="h-9 animate-pulse rounded bg-tundra-ink-100"/>)}</div>
            ) : filteredSites.length === 0 ? (
              <p className="p-4 text-xs text-tundra-ink-400">No sites found.</p>
            ) : (
              filteredSites.map((s) => {
                const server = serverMap.get(s.server_id)
                const active = selectedSiteId === s.id
                return (
                  <button key={s.id} type="button"
                    onClick={() => { setSelectedSiteId(s.id); setPath([]); setSearch(''); setSelected(new Set()) }}
                    className={`flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors ${active ? 'bg-tundra-lichen/8 border-r-2 border-tundra-lichen' : 'hover:bg-tundra-ink-50'}`}>
                    <span className={`text-sm font-medium truncate ${active ? 'text-tundra-lichen-700' : 'text-tundra-ink'}`}>
                      {s.primary_domain}
                    </span>
                    {server && <span className="text-[10px] text-tundra-ink-400 truncate">{server.name}</span>}
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* File browser */}
        <div className="flex flex-1 flex-col min-w-0">
          {!selectedSite ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center p-8">
              <svg className="h-12 w-12 text-tundra-ink-200" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              </svg>
              <p className="text-sm font-semibold text-tundra-ink">Select a site</p>
              <p className="text-xs text-tundra-ink-400">Choose a site from the left panel to browse its files.</p>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2 border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
                {/* Breadcrumb */}
                <nav className="flex flex-1 items-center gap-1 overflow-x-auto font-mono text-xs text-tundra-ink-500">
                  <button type="button" onClick={() => { setPath([]) }}
                    className="shrink-0 hover:text-tundra-aurora transition-colors">{selectedSite.document_root}</button>
                  {path.map((seg, i) => (
                    <span key={i} className="flex items-center gap-1 shrink-0">
                      <span className="text-tundra-ink-300">/</span>
                      <button type="button" onClick={() => { setPath(path.slice(0, i + 1)) }}
                        className="hover:text-tundra-aurora transition-colors">{seg}</button>
                    </span>
                  ))}
                </nav>
                <div className="relative">
                  <svg className="pointer-events-none absolute left-2.5 top-2 h-3 w-3 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                  </svg>
                  <input type="search" placeholder="Filter…" value={search}
                    onChange={(e) => { setSearch(e.target.value) }}
                    className="h-7 w-36 rounded-lg border border-tundra-ink-200 bg-white pl-7 pr-2 text-xs focus:border-tundra-lichen focus:outline-none" />
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => toast.info('Upload coming soon')}
                    className="rounded-lg border border-tundra-ink-200 px-2.5 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-100 transition-colors">Upload</button>
                  <button type="button" onClick={() => toast.info('New folder coming soon')}
                    className="rounded-lg border border-tundra-ink-200 px-2.5 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-100 transition-colors">+ Folder</button>
                  <Link to="/sites/$siteId/files" params={{ siteId: selectedSite.id }}
                    className="rounded-lg border border-tundra-lichen-300 bg-tundra-lichen/5 px-2.5 py-1.5 text-xs font-medium text-tundra-lichen-700 hover:bg-tundra-lichen-50 transition-colors">
                    Full manager ↗
                  </Link>
                </div>
              </div>

              {/* Bulk bar */}
              {selected.size > 0 && (
                <div className="flex items-center gap-3 border-b border-tundra-ink-100 bg-tundra-lichen-50 px-4 py-2">
                  <span className="text-sm font-medium text-tundra-lichen-800">{selected.size} selected</span>
                  <button type="button" onClick={() => toast.info('Download coming soon')}
                    className="rounded border border-tundra-lichen-300 px-2.5 py-1 text-xs font-medium text-tundra-lichen-700 hover:bg-tundra-lichen-100 transition-colors">Download</button>
                  <button type="button" onClick={() => { setSelected(new Set()) }}
                    className="ml-auto text-xs text-tundra-ink-400 hover:text-tundra-ink">Clear</button>
                </div>
              )}

              {/* File table */}
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 border-b border-tundra-ink-100 bg-tundra-ink-50 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
                    <tr>
                      <th className="w-10 px-4 py-2.5">
                        <input type="checkbox" checked={allSel}
                          onChange={() => { allSel ? setSelected(new Set()) : setSelected(new Set(entries.map((e) => e.name))) }}
                          className="h-3.5 w-3.5 rounded border-tundra-ink-300 accent-tundra-lichen" />
                      </th>
                      <th className="px-4 py-2.5 text-left">Name</th>
                      <th className="hidden px-4 py-2.5 text-left sm:table-cell">Size</th>
                      <th className="hidden px-4 py-2.5 text-left md:table-cell">Modified</th>
                      <th className="hidden px-4 py-2.5 text-left lg:table-cell">Perms</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tundra-ink-100">
                    {path.length > 0 && (
                      <tr className="hover:bg-tundra-ink-50 transition-colors">
                        <td className="px-4 py-2" colSpan={6}>
                          <button type="button" onClick={() => { setPath(path.slice(0, -1)) }}
                            className="flex items-center gap-2 text-xs text-tundra-ink-400 hover:text-tundra-ink transition-colors">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path d="M11 17l-5-5m0 0l5-5m-5 5h12"/>
                            </svg>
                            ..
                          </button>
                        </td>
                      </tr>
                    )}
                    {entries.map((f) => {
                      const isSel = selected.has(f.name)
                      return (
                        <tr key={f.name} className={`transition-colors ${isSel ? 'bg-tundra-lichen/5' : 'hover:bg-tundra-ink-50'}`}>
                          <td className="px-4 py-2">
                            <input type="checkbox" checked={isSel}
                              onChange={() => setSelected((s) => { const n = new Set(s); n.has(f.name) ? n.delete(f.name) : n.add(f.name); return n })}
                              className="h-3.5 w-3.5 rounded border-tundra-ink-300 accent-tundra-lichen" />
                          </td>
                          <td className="px-4 py-2">
                            <button type="button"
                              onClick={() => { if (f.type === 'dir') { setPath([...path, f.name]); setSearch('') } else toast.info('File editor coming soon') }}
                              className="flex items-center gap-2 text-left hover:text-tundra-aurora transition-colors">
                              <FileIcon type={f.type} name={f.name} />
                              <span className={`text-sm font-medium ${f.name.startsWith('.') ? 'text-tundra-ink-400' : 'text-tundra-ink'}`}>{f.name}</span>
                            </button>
                          </td>
                          <td className="hidden px-4 py-2 text-xs text-tundra-ink-400 sm:table-cell">{fmt(f.size)}</td>
                          <td className="hidden px-4 py-2 text-xs text-tundra-ink-400 md:table-cell">{f.modified ?? '—'}</td>
                          <td className="hidden px-4 py-2 lg:table-cell">
                            <code className="rounded bg-tundra-ink-50 px-1 py-0.5 text-[10px] font-mono text-tundra-ink-500">{f.perms ?? '—'}</code>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex justify-end gap-1">
                              {f.type === 'file' && (
                                <button type="button" onClick={() => toast.info('Edit coming soon')}
                                  className="rounded border border-tundra-ink-200 px-2 py-0.5 text-xs text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">Edit</button>
                              )}
                              <button type="button" onClick={() => toast.info('Download coming soon')}
                                className="rounded border border-tundra-ink-200 px-2 py-0.5 text-xs text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                                {f.type === 'dir' ? 'Zip' : 'DL'}
                              </button>
                              <button type="button" onClick={() => { if (confirm(`Delete ${f.name}?`)) toast.info('Delete coming soon') }}
                                className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 transition-colors">Del</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-tundra-ink-100 px-4 py-2 text-xs text-tundra-ink-300">
                {entries.length} items · {selectedSite.document_root}{path.length > 0 ? '/' + path.join('/') : ''} · Live file API coming soon
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
