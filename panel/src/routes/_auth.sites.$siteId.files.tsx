import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Site } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/sites/$siteId/files')({
  component: SiteFilesTab,
})

type FileEntry = { name: string; type: 'dir' | 'file'; size?: number; modified?: string; perms?: string }

// Simulated file tree — real implementation would call /api/v1/sites/:id/files?path=...
const MOCK_ROOT: FileEntry[] = [
  { name: 'index.php',          type: 'file', size: 418,     modified: '2025-05-01', perms: '644' },
  { name: 'wp-config.php',      type: 'file', size: 3012,    modified: '2025-04-28', perms: '640' },
  { name: 'wp-content',         type: 'dir',  modified: '2025-05-10', perms: '755' },
  { name: 'wp-includes',        type: 'dir',  modified: '2025-04-15', perms: '755' },
  { name: 'wp-admin',           type: 'dir',  modified: '2025-04-15', perms: '755' },
  { name: '.htaccess',          type: 'file', size: 406,     modified: '2025-04-20', perms: '644' },
  { name: 'robots.txt',         type: 'file', size: 67,      modified: '2025-04-01', perms: '644' },
  { name: 'xmlrpc.php',         type: 'file', size: 3065,    modified: '2025-04-15', perms: '644' },
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
  const color = ext === 'php' ? 'text-purple-500' : ext === 'js' ? 'text-yellow-500' : ext === 'css' ? 'text-blue-500' : 'text-tundra-ink-300'
  return (
    <svg className={`h-4 w-4 ${color}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
    </svg>
  )
}

function SiteFilesTab() {
  const { siteId } = Route.useParams()
  const [path, setPath] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const { data: site } = useQuery({
    queryKey: ['sites', siteId],
    queryFn: () => api<Site>(`/sites/${siteId}`),
  })

  const docRoot = site?.document_root ?? '/var/www/html'
  const entries = MOCK_ROOT.filter((f) => !search || f.name.toLowerCase().includes(search.toLowerCase()))
  const allSelected = entries.length > 0 && entries.every((e) => selected.has(e.name))

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(entries.map((e) => e.name)))
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Breadcrumb */}
        <nav className="flex flex-1 items-center gap-1 font-mono text-xs text-tundra-ink-500 overflow-x-auto">
          <button type="button" onClick={() => { setPath([]) }}
            className="shrink-0 hover:text-tundra-aurora transition-colors">{docRoot}</button>
          {path.map((seg, i) => (
            <span key={i} className="flex items-center gap-1 shrink-0">
              <span className="text-tundra-ink-300">/</span>
              <button type="button" onClick={() => { setPath(path.slice(0, i + 1)) }}
                className="hover:text-tundra-aurora transition-colors">{seg}</button>
            </span>
          ))}
        </nav>

        <div className="relative">
          <svg className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input type="search" placeholder="Filter files…" value={search}
            onChange={(e) => { setSearch(e.target.value) }}
            className="h-8 w-40 rounded-lg border border-tundra-ink-200 bg-white pl-8 pr-3 text-xs focus:border-tundra-lichen focus:outline-none" />
        </div>

        <div className="flex gap-1.5">
          <button type="button" onClick={() => toast.info('Upload coming soon')}
            className="flex items-center gap-1 rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
            Upload
          </button>
          <button type="button" onClick={() => toast.info('New folder coming soon')}
            className="flex items-center gap-1 rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            New folder
          </button>
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-tundra-lichen-200 bg-tundra-lichen-50 px-4 py-2">
          <span className="text-sm font-medium text-tundra-lichen-800">{selected.size} selected</span>
          <button type="button" onClick={() => toast.info('Download coming soon')}
            className="rounded border border-tundra-lichen-300 px-3 py-1 text-xs font-medium text-tundra-lichen-700 hover:bg-tundra-lichen-100 transition-colors">
            Download
          </button>
          <button type="button" onClick={() => toast.info('Move coming soon')}
            className="rounded border border-tundra-lichen-300 px-3 py-1 text-xs font-medium text-tundra-lichen-700 hover:bg-tundra-lichen-100 transition-colors">
            Move
          </button>
          <button type="button" onClick={() => { if (confirm(`Delete ${selected.size} item(s)?`)) { setSelected(new Set()); toast.info('Delete coming soon') } }}
            className="rounded border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">
            Delete
          </button>
          <button type="button" onClick={() => { setSelected(new Set()) }}
            className="ml-auto text-xs text-tundra-ink-400 hover:text-tundra-ink">
            Clear
          </button>
        </div>
      )}

      {/* File table */}
      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-tundra-ink-100 bg-tundra-ink-50 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
            <tr>
              <th className="w-10 px-4 py-3">
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  className="h-3.5 w-3.5 rounded border-tundra-ink-300 accent-tundra-lichen" />
              </th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="hidden px-4 py-3 text-left sm:table-cell">Size</th>
              <th className="hidden px-4 py-3 text-left md:table-cell">Modified</th>
              <th className="hidden px-4 py-3 text-left lg:table-cell">Permissions</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tundra-ink-100">
            {entries.map((f) => {
              const isSel = selected.has(f.name)
              return (
                <tr key={f.name}
                  className={`transition-colors ${isSel ? 'bg-tundra-lichen/5' : 'hover:bg-tundra-ink-50'}`}>
                  <td className="px-4 py-2.5">
                    <input type="checkbox" checked={isSel}
                      onChange={() => setSelected((s) => { const n = new Set(s); n.has(f.name) ? n.delete(f.name) : n.add(f.name); return n })}
                      className="h-3.5 w-3.5 rounded border-tundra-ink-300 accent-tundra-lichen" />
                  </td>
                  <td className="px-4 py-2.5">
                    <button type="button"
                      onClick={() => { if (f.type === 'dir') { setPath([...path, f.name]); setSearch('') } else toast.info('File editor coming soon') }}
                      className="flex items-center gap-2 text-left hover:text-tundra-aurora transition-colors">
                      <FileIcon type={f.type} name={f.name} />
                      <span className={`font-medium ${f.name.startsWith('.') ? 'text-tundra-ink-400' : 'text-tundra-ink'}`}>{f.name}</span>
                      {f.type === 'dir' && <svg className="h-3 w-3 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>}
                    </button>
                  </td>
                  <td className="hidden px-4 py-2.5 text-xs text-tundra-ink-400 sm:table-cell">{fmt(f.size)}</td>
                  <td className="hidden px-4 py-2.5 text-xs text-tundra-ink-400 md:table-cell">{f.modified ?? '—'}</td>
                  <td className="hidden px-4 py-2.5 lg:table-cell">
                    <code className="rounded bg-tundra-ink-50 px-1.5 py-0.5 text-[10px] font-mono text-tundra-ink-500">{f.perms ?? '—'}</code>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      {f.type === 'file' && (
                        <button type="button" onClick={() => toast.info('Editor coming soon')}
                          className="rounded border border-tundra-ink-200 px-2 py-0.5 text-xs text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">Edit</button>
                      )}
                      <button type="button" onClick={() => toast.info('Download coming soon')}
                        className="rounded border border-tundra-ink-200 px-2 py-0.5 text-xs text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                        {f.type === 'dir' ? 'Download zip' : 'Download'}
                      </button>
                      <button type="button" onClick={() => toast.info('Rename coming soon')}
                        className="rounded border border-tundra-ink-200 px-2 py-0.5 text-xs text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">Rename</button>
                      <button type="button" onClick={() => { if (confirm(`Delete ${f.name}?`)) toast.info('Delete coming soon') }}
                        className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 transition-colors">Delete</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-tundra-ink-300 text-center">
        Showing document root of <code className="font-mono">{docRoot}</code> — live file API coming soon
      </p>
    </div>
  )
}
