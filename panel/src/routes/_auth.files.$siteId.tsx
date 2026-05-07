import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Site } from '@/lib/api-types'
import { Dialog } from '@/components/ui/dialog'
import { fmtBytes } from '@/lib/utils'

export const Route = createFileRoute('/_auth/files/$siteId')({
  validateSearch: (s: Record<string, unknown>): { path: string } => ({
    path: typeof s.path === 'string' ? s.path : '/',
  }),
  component: FileBrowser,
})

// ── Types ─────────────────────────────────────────────────────────────────────

type FileEntry = {
  name: string
  type: 'file' | 'dir' | 'symlink'
  size?: number
  modified: string | null
  perms: string
  owner: string
}

type TreeNode = { name: string; path: string; children?: TreeNode[] }

type Modal =
  | { type: 'newFile' }
  | { type: 'newFolder' }
  | { type: 'rename'; name: string }
  | { type: 'delete'; names: string[] }
  | { type: 'chmod'; name: string; perms: string }
  | { type: 'upload' }

type SortKey = 'name' | 'size' | 'modified' | 'type'
type ViewMode = 'list' | 'grid'

// Sidebar tree is populated dynamically from API listing; no static entries needed.
const DIR_TREE: TreeNode[] = []

// ── Helpers ───────────────────────────────────────────────────────────────────


function buildBreadcrumb(path: string) {
  if (path === '/') return [{ label: '/', path: '/' }]
  const parts = path.split('/').filter(Boolean)
  const crumbs = [{ label: '/', path: '/' }]
  let acc = ''
  for (const p of parts) { acc += '/' + p; crumbs.push({ label: p, path: acc }) }
  return crumbs
}

function parentPath(path: string) {
  if (path === '/') return '/'
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  return parts.length === 0 ? '/' : '/' + parts.join('/')
}

const TEXT_EXTS = new Set(['php','js','ts','tsx','jsx','css','scss','html','htm','xml','json','txt','md','yaml','yml','env','sh','conf','ini','htaccess','sql'])

function isTextFile(name: string) {
  if (name.startsWith('.') && !name.includes('.')) return true
  return TEXT_EXTS.has(name.split('.').pop()?.toLowerCase() ?? '')
}

function permsToOctal(r: boolean[]): string {
  let n = 0
  for (let i = 0; i < 9; i++) if (r[i]) n |= (1 << (8 - i))
  return `${(n >> 6) & 7}${(n >> 3) & 7}${n & 7}`
}

function octalToPerms(s: string): boolean[] {
  const result: boolean[] = []
  for (const d of s.padStart(3, '0').split('').map(Number)) {
    result.push(!!(d & 4), !!(d & 2), !!(d & 1))
  }
  return result
}

function sortFiles(files: FileEntry[], key: SortKey, dir: 'asc' | 'desc'): FileEntry[] {
  const dirs  = files.filter((f) => f.type === 'dir')
  const rest  = files.filter((f) => f.type !== 'dir')
  const cmp = (a: FileEntry, b: FileEntry): number => {
    let v = 0
    if (key === 'name')     v = a.name.localeCompare(b.name)
    else if (key === 'size')     v = (a.size ?? 0) - (b.size ?? 0)
    else if (key === 'modified') v = (a.modified ?? '').localeCompare(b.modified ?? '')
    else if (key === 'type')     v = a.name.split('.').pop()!.localeCompare(b.name.split('.').pop()!)
    return dir === 'asc' ? v : -v
  }
  return [...dirs.sort(cmp), ...rest.sort(cmp)]
}

// ── File icon ─────────────────────────────────────────────────────────────────

const EXT_META: Record<string, { bg: string; text: string; label: string }> = {
  php:  { bg: 'bg-purple-100', text: 'text-purple-700', label: 'PHP' },
  js:   { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'JS' },
  ts:   { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'TS' },
  tsx:  { bg: 'bg-cyan-100',   text: 'text-cyan-700',   label: 'TSX' },
  jsx:  { bg: 'bg-cyan-100',   text: 'text-cyan-700',   label: 'JSX' },
  css:  { bg: 'bg-sky-100',    text: 'text-sky-700',    label: 'CSS' },
  scss: { bg: 'bg-pink-100',   text: 'text-pink-700',   label: 'SCSS' },
  html: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'HTML' },
  htm:  { bg: 'bg-orange-100', text: 'text-orange-700', label: 'HTM' },
  json: { bg: 'bg-green-100',  text: 'text-green-700',  label: 'JSON' },
  yaml: { bg: 'bg-teal-100',   text: 'text-teal-700',   label: 'YAML' },
  yml:  { bg: 'bg-teal-100',   text: 'text-teal-700',   label: 'YAML' },
  md:   { bg: 'bg-slate-100',  text: 'text-slate-600',  label: 'MD' },
  txt:  { bg: 'bg-slate-100',  text: 'text-slate-500',  label: 'TXT' },
  sql:  { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'SQL' },
  sh:   { bg: 'bg-lime-100',   text: 'text-lime-700',   label: 'SH' },
  xml:  { bg: 'bg-rose-100',   text: 'text-rose-700',   label: 'XML' },
}

function FileIcon({ type, name, large = false }: { type: string; name: string; large?: boolean }) {
  const sz = large ? 'h-10 w-10 text-[10px] font-bold' : 'h-8 w-8 text-[9px] font-bold'

  if (type === 'dir') return (
    <div className={`${sz} flex items-center justify-center rounded-lg bg-tundra-aurora/15`}>
      <svg className={large ? 'h-5 w-5 text-tundra-aurora' : 'h-4 w-4 text-tundra-aurora'} fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
    </div>
  )

  const ext  = name.split('.').pop()?.toLowerCase() ?? ''
  const meta = EXT_META[ext]

  if (meta) return (
    <div className={`${sz} flex items-center justify-center rounded-lg ${meta.bg}`}>
      <span className={`${meta.text} leading-none`}>{meta.label}</span>
    </div>
  )

  return (
    <div className={`${sz} flex items-center justify-center rounded-lg bg-tundra-ink-100`}>
      <svg className={large ? 'h-5 w-5 text-tundra-ink-400' : 'h-4 w-4 text-tundra-ink-400'} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    </div>
  )
}

// ── Sort header ───────────────────────────────────────────────────────────────

function SortTh({ label, sortKey, current, dir, onChange, className = '' }: {
  label: string; sortKey: SortKey; current: SortKey; dir: 'asc' | 'desc'
  onChange: (k: SortKey) => void; className?: string
}) {
  const active = current === sortKey
  return (
    <th
      className={`cursor-pointer select-none px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide transition-colors ${active ? 'text-tundra-lichen-700' : 'text-tundra-ink-400 hover:text-tundra-ink'} ${className}`}
      onClick={() => { onChange(sortKey) }}
    >
      <span className="flex items-center gap-1">
        {label}
        <span className={`transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}>
          {dir === 'asc' ? '↑' : '↓'}
        </span>
      </span>
    </th>
  )
}

// ── Directory tree ────────────────────────────────────────────────────────────

function TreeNodeRow({ node, depth, currentPath, expanded, onToggle, onNavigate }: {
  node: TreeNode; depth: number; currentPath: string
  expanded: Set<string>; onToggle: (p: string) => void; onNavigate: (p: string) => void
}) {
  const isExpanded = expanded.has(node.path)
  const isActive   = currentPath === node.path
  const hasKids    = !!node.children?.length

  return (
    <>
      <div
        style={{ paddingLeft: `${10 + depth * 14}px` }}
        onClick={() => { onNavigate(node.path); if (hasKids && !isExpanded) onToggle(node.path) }}
        className={[
          'group flex cursor-pointer select-none items-center gap-1.5 rounded-md mx-1 pr-2 py-1 transition-colors',
          isActive ? 'bg-tundra-lichen/10 text-tundra-lichen-700' : 'text-tundra-ink-600 hover:bg-tundra-ink-100 hover:text-tundra-ink',
        ].join(' ')}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (hasKids) onToggle(node.path) }}
          className={`h-4 w-4 shrink-0 flex items-center justify-center rounded transition-transform ${!hasKids ? 'invisible' : ''}`}
          style={{ transform: isExpanded ? 'rotate(90deg)' : undefined }}
        >
          <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path d="M9 18l6-6-6-6" strokeLinecap="round" />
          </svg>
        </button>
        <svg className="h-3.5 w-3.5 shrink-0 text-tundra-aurora" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
        <span className="truncate text-xs">{node.name}</span>
      </div>
      {isExpanded && hasKids && node.children!.map((child) => (
        <TreeNodeRow key={child.path} node={child} depth={depth + 1}
          currentPath={currentPath} expanded={expanded} onToggle={onToggle} onNavigate={onNavigate} />
      ))}
    </>
  )
}

// ── Modal shell ───────────────────────────────────────────────────────────────

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Dialog open onClose={onClose} className="overflow-hidden rounded-2xl border border-tundra-ink-200 shadow-2xl p-0">
      <div className="flex items-center justify-between border-b border-tundra-ink-100 px-5 py-4">
        <p className="text-sm font-semibold text-tundra-ink">{title}</p>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-tundra-ink-400 hover:bg-tundra-ink-100 hover:text-tundra-ink transition-colors">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-5">{children}</div>
    </Dialog>
  )
}

// ── Chmod modal ───────────────────────────────────────────────────────────────

function ChmodModal({ name, perms, filePath, onApply, isPending, onClose }: {
  name: string; perms: string; filePath: string
  onApply: (filePath: string, mode: string) => void
  isPending: boolean; onClose: () => void
}) {
  const [bits, setBits] = useState<boolean[]>(octalToPerms(perms))
  const octal = permsToOctal(bits)
  function toggle(i: number) { setBits((b) => { const n = [...b]; n[i] = !n[i]; return n }) }
  const rows = [{ label: 'Owner', offset: 0 }, { label: 'Group', offset: 3 }, { label: 'Public', offset: 6 }] as const

  return (
    <ModalShell title={`Permissions — ${name}`} onClose={onClose}>
      <table className="mb-4 w-full text-sm">
        <thead>
          <tr className="text-xs text-tundra-ink-400">
            <th className="w-20 pb-2 text-left font-medium" />
            {['Read', 'Write', 'Execute'].map((h) => (
              <th key={h} className="pb-2 text-center font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-tundra-ink-100">
          {rows.map(({ label, offset }) => (
            <tr key={label}>
              <td className="py-2.5 text-xs font-medium text-tundra-ink-600">{label}</td>
              {[0, 1, 2].map((j) => (
                <td key={j} className="py-2.5 text-center">
                  <input type="checkbox" checked={bits[offset + j]} onChange={() => { toggle(offset + j) }}
                    className="h-4 w-4 rounded border-tundra-ink-300 accent-tundra-lichen" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mb-4 flex items-center gap-3 rounded-xl bg-tundra-ink-50 px-4 py-3">
        <span className="text-xs text-tundra-ink-500">Octal value</span>
        <code className="font-mono text-lg font-bold tracking-wider text-tundra-ink">{octal}</code>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose}
          className="rounded-xl border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
          Cancel
        </button>
        <button type="button" disabled={isPending} onClick={() => { onApply(filePath, octal) }}
          className="rounded-xl bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
          {isPending ? 'Applying…' : 'Apply'}
        </button>
      </div>
    </ModalShell>
  )
}

// ── Upload modal ──────────────────────────────────────────────────────────────

function UploadModal({ path, onClose }: {
  path: string; siteId?: string; onClose: () => void; onSuccess?: () => void
}) {
  const [dragging, setDragging] = useState(false)

  async function uploadFiles(_fileList: FileList) {
    void _fileList
    toast.info('File upload coming soon')
    onClose()
  }

  return (
    <ModalShell title="Upload files" onClose={onClose}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => { setDragging(false) }}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false)
          if (e.dataTransfer.files.length) void uploadFiles(e.dataTransfer.files)
        }}
        className={[
          'mb-4 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-12 transition-colors',
          dragging ? 'border-tundra-lichen bg-tundra-lichen/5' : 'border-tundra-ink-200 bg-tundra-ink-50',
        ].join(' ')}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
          <svg className="h-7 w-7 text-tundra-ink-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 5.75 5.75 0 011.508 11.095" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-tundra-ink">Drop files here</p>
          <p className="mt-0.5 text-xs text-tundra-ink-400">or click to browse</p>
        </div>
        <label className="cursor-pointer rounded-xl border border-tundra-ink-200 bg-white px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors shadow-sm">
          Browse files
          <input type="file" multiple className="sr-only" onChange={(e) => {
            if (e.target.files?.length) void uploadFiles(e.target.files)
          }} />
        </label>
      </div>
      <p className="text-center text-xs text-tundra-ink-400">
        Destination: <code className="font-mono text-tundra-ink-600">{path}</code>
      </p>
    </ModalShell>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

function FileBrowser() {
  const { siteId } = Route.useParams()
  const { path }   = Route.useSearch()
  const navigate   = useNavigate()
  const queryClient = useQueryClient()

  const { data: site } = useQuery({
    queryKey: ['sites', siteId],
    queryFn: () => api<Site>(`/sites/${siteId}`),
  })

  const { data: filesData, isLoading: filesLoading, isError: filesError } = useQuery({
    queryKey: ['site-files', siteId, path],
    queryFn: () => api<{ data: FileEntry[] }>(`/sites/${siteId}/files`, { query: { path } }),
  })

  const [showTree,     setShowTree]     = useState(true)
  const [treeExpanded, setTreeExpanded] = useState<Set<string>>(new Set())
  const [selected,     setSelected]     = useState<Set<string>>(new Set())
  const [filterText,   setFilterText]   = useState('')
  const [modal,        setModal]        = useState<Modal | null>(null)
  const [newName,      setNewName]      = useState('')
  const [viewMode,     setViewMode]     = useState<ViewMode>('list')
  const [sortKey,      setSortKey]      = useState<SortKey>('name')
  const [sortDir,      setSortDir]      = useState<'asc' | 'desc'>('asc')

  const invalidateDir = () => queryClient.invalidateQueries({ queryKey: ['site-files', siteId, path] })

  const touchMutation = useMutation({
    mutationFn: (name: string) => api(`/sites/${siteId}/files/touch`, {
      method: 'POST',
      body: { path: path === '/' ? `/${name}` : `${path}/${name}` },
    }),
    onSuccess: (_data, name) => { toast.success(`Created ${name}`); void invalidateDir(); setModal(null) },
    onError: (e) => { toast.error(e instanceof Error ? e.message : 'Failed to create file') },
  })

  const mkdirMutation = useMutation({
    mutationFn: (name: string) => api(`/sites/${siteId}/files/mkdir`, {
      method: 'POST',
      body: { path: path === '/' ? `/${name}` : `${path}/${name}` },
    }),
    onSuccess: (_data, name) => { toast.success(`Created ${name}/`); void invalidateDir(); setModal(null) },
    onError: (e) => { toast.error(e instanceof Error ? e.message : 'Failed to create folder') },
  })

  const renameMutation = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => api(`/sites/${siteId}/files/rename`, {
      method: 'POST',
      body: { from, to },
    }),
    onSuccess: (_data, { to }) => { toast.success(`Renamed to ${to.split('/').pop()}`); void invalidateDir(); setModal(null) },
    onError: (e) => { toast.error(e instanceof Error ? e.message : 'Failed to rename') },
  })

  const deleteMutation = useMutation({
    mutationFn: (names: string[]) => Promise.all(
      names.map((name) => api(`/sites/${siteId}/files`, {
        method: 'DELETE',
        query: { path: path === '/' ? `/${name}` : `${path}/${name}` },
      }))
    ),
    onSuccess: (_data, names) => {
      toast.success(`Deleted ${names.length} item(s)`)
      void invalidateDir()
      setSelected(new Set())
      setModal(null)
    },
    onError: (e) => { toast.error(e instanceof Error ? e.message : 'Failed to delete') },
  })

  const chmodMutation = useMutation({
    mutationFn: ({ filePath, mode }: { filePath: string; mode: string }) => api(`/sites/${siteId}/files/chmod`, {
      method: 'POST',
      body: { path: filePath, mode },
    }),
    onSuccess: () => { void invalidateDir(); setModal(null) },
    onError: (e) => { toast.error(e instanceof Error ? e.message : 'Failed to change permissions') },
  })

  const allFiles = filesData?.data ?? []
  const filtered = useMemo(
    () => filterText ? allFiles.filter((f) => f.name.toLowerCase().includes(filterText.toLowerCase())) : allFiles,
    [allFiles, filterText],
  )
  const files     = useMemo(() => sortFiles(filtered, sortKey, sortDir), [filtered, sortKey, sortDir])
  const breadcrumb = buildBreadcrumb(path)
  const allChecked = files.length > 0 && files.every((f) => selected.has(f.name))
  const docRoot    = site?.document_root ?? '/var/www/html'

  function goToPath(p: string) {
    void navigate({ to: '/files/$siteId', params: { siteId }, search: { path: p } })
    setSelected(new Set())
    setFilterText('')
  }

  function toggleTree(p: string) {
    setTreeExpanded((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n })
  }

  function toggleSelect(name: string) {
    setSelected((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n })
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function openEdit(name: string) {
    if (!isTextFile(name)) { toast.error('Binary file — cannot open in editor'); return }
    const fp = path === '/' ? `/${name}` : `${path}/${name}`
    window.open(`/editor/${siteId}?active=${encodeURIComponent(fp)}&files=${encodeURIComponent(fp)}`, '_blank')
  }

  function enterDir(name: string) {
    goToPath(path === '/' ? `/${name}` : `${path}/${name}`)
  }

  return (
    <div className="flex h-full overflow-hidden bg-white">

      {/* ── Sidebar ── */}
      {showTree && (
        <div className="flex w-52 shrink-0 flex-col border-r border-tundra-ink-100 bg-tundra-ink-50/60">
          <div className="border-b border-tundra-ink-100 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-tundra-ink-400">Explorer</p>
          </div>
          <div className="flex-1 overflow-y-auto py-1.5">
            {/* Root */}
            <div
              onClick={() => { goToPath('/') }}
              className={[
                'mx-1 flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors',
                path === '/' ? 'bg-tundra-lichen/10 text-tundra-lichen-700' : 'text-tundra-ink-600 hover:bg-tundra-ink-100 hover:text-tundra-ink',
              ].join(' ')}
            >
              <svg className="h-3.5 w-3.5 shrink-0 text-tundra-aurora" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              <span className="text-xs font-medium">/ root</span>
            </div>
            {DIR_TREE.map((node) => (
              <TreeNodeRow key={node.path} node={node} depth={0} currentPath={path}
                expanded={treeExpanded} onToggle={toggleTree} onNavigate={goToPath} />
            ))}
          </div>
        </div>
      )}

      {/* ── Main area ── */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">

        {/* ── Top bar ── */}
        <div className="flex shrink-0 items-center gap-2 border-b border-tundra-ink-100 bg-white px-3 py-2.5">
          {/* Tree toggle */}
          <button
            type="button"
            onClick={() => { setShowTree(!showTree) }}
            className={[
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors',
              showTree
                ? 'border-tundra-lichen/30 bg-tundra-lichen/10 text-tundra-lichen-700'
                : 'border-tundra-ink-200 text-tundra-ink-400 hover:bg-tundra-ink-50',
            ].join(' ')}
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M3 7h18M3 12h12M3 17h8" strokeLinecap="round" />
            </svg>
          </button>

          {/* Site domain */}
          {site && (
            <span className="shrink-0 rounded-md border border-tundra-ink-200 bg-tundra-ink-50 px-2 py-0.5 font-mono text-xs font-medium text-tundra-ink">
              {site.primary_domain}
            </span>
          )}

          {/* Breadcrumb */}
          <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            <span className="shrink-0 font-mono text-[11px] text-tundra-ink-300">{docRoot}</span>
            {breadcrumb.map((crumb, i) => (
              <span key={crumb.path} className="flex shrink-0 items-center gap-0.5">
                <span className="text-tundra-ink-200 text-xs">/</span>
                <button
                  type="button"
                  onClick={() => { goToPath(crumb.path) }}
                  className={[
                    'rounded px-1 py-0.5 font-mono text-xs transition-colors hover:bg-tundra-ink-100',
                    i === breadcrumb.length - 1 ? 'font-semibold text-tundra-ink' : 'text-tundra-ink-400',
                  ].join(' ')}
                >
                  {crumb.label === '/' ? '' : crumb.label}
                </button>
              </span>
            ))}
          </nav>

          {/* Filter */}
          <div className="relative shrink-0">
            <svg className="pointer-events-none absolute left-2.5 top-1.5 h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input type="search" placeholder="Filter…" value={filterText}
              onChange={(e) => { setFilterText(e.target.value) }}
              className="h-7 w-36 rounded-lg border border-tundra-ink-200 bg-tundra-ink-50 pl-7 pr-3 text-xs focus:border-tundra-lichen focus:outline-none focus:bg-white transition-colors" />
          </div>

          {/* View toggle */}
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-tundra-ink-200">
            {(['list', 'grid'] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setViewMode(m) }}
                className={[
                  'flex h-7 w-7 items-center justify-center transition-colors',
                  viewMode === m ? 'bg-tundra-lichen text-white' : 'bg-white text-tundra-ink-400 hover:bg-tundra-ink-50',
                ].join(' ')}>
                {m === 'list'
                  ? <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 5h11M9 12h11M9 19h11M5 5h.01M5 12h.01M5 19h.01" strokeLinecap="round" /></svg>
                  : <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                }
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={() => { setModal({ type: 'upload' }) }}
              className="flex items-center gap-1 rounded-lg border border-tundra-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Upload
            </button>
            <button type="button" onClick={() => { setNewName(''); setModal({ type: 'newFile' }) }}
              className="flex items-center gap-1 rounded-lg border border-tundra-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
              + File
            </button>
            <button type="button" onClick={() => { setNewName(''); setModal({ type: 'newFolder' }) }}
              className="flex items-center gap-1.5 rounded-lg bg-tundra-lichen px-2.5 py-1 text-xs font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              + Folder
            </button>
          </div>
        </div>

        {/* ── Bulk bar ── */}
        {selected.size > 0 && (
          <div className="flex shrink-0 items-center gap-2 border-b border-tundra-lichen-200 bg-tundra-lichen-50 px-4 py-2">
            <span className="text-xs font-semibold text-tundra-lichen-800">{selected.size} selected</span>
            <div className="h-3 w-px bg-tundra-lichen-200" />
            {[
              { label: 'Download', action: () => toast.info('Download zip — coming soon') },
              { label: 'Copy',     action: () => toast.info('Copy — coming soon') },
              { label: 'Move',     action: () => toast.info('Move — coming soon') },
            ].map(({ label, action }) => (
              <button key={label} type="button" onClick={action}
                className="rounded-lg border border-tundra-lichen-200 bg-white px-2.5 py-1 text-xs font-medium text-tundra-lichen-700 hover:bg-tundra-lichen-100 transition-colors">
                {label}
              </button>
            ))}
            <button type="button" onClick={() => { setModal({ type: 'delete', names: [...selected] }) }}
              className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">
              Delete
            </button>
            <button type="button" onClick={() => { setSelected(new Set()) }}
              className="ml-auto text-xs text-tundra-ink-400 hover:text-tundra-ink transition-colors">
              Clear
            </button>
          </div>
        )}

        {/* ── Content ── */}
        <div className="flex-1 overflow-auto">

          {/* LIST VIEW */}
          {viewMode === 'list' && (
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-tundra-ink-50/90 backdrop-blur-sm border-b border-tundra-ink-100">
                <tr>
                  <th className="w-10 px-3 py-2.5">
                    <input type="checkbox" checked={allChecked}
                      onChange={() => { allChecked ? setSelected(new Set()) : setSelected(new Set(files.map((f) => f.name))) }}
                      className="h-3.5 w-3.5 rounded border-tundra-ink-300 accent-tundra-lichen" />
                  </th>
                  <SortTh label="Name"     sortKey="name"     current={sortKey} dir={sortDir} onChange={handleSort} />
                  <SortTh label="Size"     sortKey="size"     current={sortKey} dir={sortDir} onChange={handleSort} className="hidden text-right sm:table-cell" />
                  <SortTh label="Modified" sortKey="modified" current={sortKey} dir={sortDir} onChange={handleSort} className="hidden md:table-cell" />
                  <th className="hidden px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-tundra-ink-400 lg:table-cell">Perms</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-tundra-ink-400 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-tundra-ink-50">
                {/* Go up */}
                {path !== '/' && (
                  <tr className="hover:bg-tundra-ink-50/60 transition-colors">
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5" colSpan={5}>
                      <button type="button" onClick={() => { goToPath(parentPath(path)) }}
                        className="flex items-center gap-2 text-xs text-tundra-ink-400 hover:text-tundra-lichen-700 transition-colors">
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path d="M11 17l-5-5m0 0l5-5m-5 5h12" strokeLinecap="round" />
                        </svg>
                        <span className="font-mono">..</span>
                        <span className="text-tundra-ink-300">Go up</span>
                      </button>
                    </td>
                  </tr>
                )}

                {/* Loading skeleton */}
                {filesLoading && Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-3 py-2.5"><div className="h-3.5 w-3.5 rounded bg-tundra-ink-100" /></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-tundra-ink-100" />
                        <div className="h-3 rounded bg-tundra-ink-100" style={{ width: `${80 + (i * 23) % 80}px` }} />
                      </div>
                    </td>
                    <td className="hidden px-3 py-2.5 sm:table-cell"><div className="ml-auto h-3 w-12 rounded bg-tundra-ink-100" /></td>
                    <td className="hidden px-3 py-2.5 md:table-cell"><div className="h-3 w-28 rounded bg-tundra-ink-100" /></td>
                    <td className="hidden px-3 py-2.5 lg:table-cell"><div className="mx-auto h-3 w-8 rounded bg-tundra-ink-100" /></td>
                    <td className="px-2 py-2.5" />
                  </tr>
                ))}

                {/* Error state */}
                {filesError && !filesLoading && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-sm text-red-500">
                      Failed to load directory contents.
                    </td>
                  </tr>
                )}

                {!filesLoading && !filesError && files.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-sm text-tundra-ink-400">
                      {filterText ? 'No files match that filter.' : 'This directory is empty.'}
                    </td>
                  </tr>
                )}

                {files.map((f) => {
                  const isSel  = selected.has(f.name)
                  const canEdit = f.type === 'file' && isTextFile(f.name)
                  return (
                    <tr key={f.name}
                      className={`group transition-colors ${isSel ? 'bg-tundra-lichen/5' : 'hover:bg-tundra-ink-50/60'}`}
                    >
                      {/* Checkbox — visible on hover or when checked */}
                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={isSel} onChange={() => { toggleSelect(f.name) }}
                          className={`h-3.5 w-3.5 rounded border-tundra-ink-300 accent-tundra-lichen transition-opacity ${isSel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                      </td>

                      {/* Name */}
                      <td className="px-3 py-2.5">
                        <button type="button"
                          onClick={() => { if (f.type === 'dir') enterDir(f.name) }}
                          onDoubleClick={() => { if (f.type !== 'dir' && canEdit) openEdit(f.name) }}
                          className="flex items-center gap-2.5 text-left"
                        >
                          <FileIcon type={f.type} name={f.name} />
                          <span className={`text-sm font-medium transition-colors group-hover:text-tundra-lichen-700 ${f.name.startsWith('.') ? 'text-tundra-ink-400' : 'text-tundra-ink'}`}>
                            {f.name}
                          </span>
                          {f.type === 'symlink' && (
                            <span className="rounded bg-tundra-ink-100 px-1 py-0.5 text-[9px] font-medium text-tundra-ink-400">symlink</span>
                          )}
                        </button>
                      </td>

                      {/* Size */}
                      <td className="hidden px-3 py-2.5 text-right font-mono text-xs text-tundra-ink-400 tabular-nums sm:table-cell">
                        {fmtBytes(f.size)}
                      </td>

                      {/* Modified */}
                      <td className="hidden px-3 py-2.5 text-xs text-tundra-ink-400 md:table-cell">
                        {f.modified}
                      </td>

                      {/* Perms */}
                      <td className="hidden px-3 py-2.5 text-center lg:table-cell">
                        <button type="button" onClick={() => { setModal({ type: 'chmod', name: f.name, perms: f.perms }) }}
                          className="rounded-md bg-tundra-ink-100 px-2 py-0.5 font-mono text-[11px] text-tundra-ink-500 hover:bg-tundra-ink-200 transition-colors">
                          {f.perms}
                        </button>
                      </td>

                      {/* Hover actions */}
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {canEdit && (
                            <button type="button" onClick={() => { openEdit(f.name) }} title="Edit"
                              className="flex h-6 w-6 items-center justify-center rounded-md text-tundra-ink-400 hover:bg-tundra-ink-100 hover:text-tundra-lichen-700 transition-colors">
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                          <button type="button"
                            onClick={() => { setNewName(f.name); setModal({ type: 'rename', name: f.name }) }}
                            title="Rename"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-tundra-ink-400 hover:bg-tundra-ink-100 hover:text-tundra-ink transition-colors">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path d="M4 6h16M4 12h16M4 18h7" strokeLinecap="round" />
                            </svg>
                          </button>
                          <button type="button" onClick={() => toast.info(`Downloading ${f.name}…`)} title={f.type === 'dir' ? 'Zip & download' : 'Download'}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-tundra-ink-400 hover:bg-tundra-ink-100 hover:text-tundra-ink transition-colors">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                          <button type="button" onClick={() => { setModal({ type: 'delete', names: [f.name] }) }} title="Delete"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-tundra-ink-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {/* GRID VIEW */}
          {viewMode === 'grid' && (
            <div className="p-4">
              {/* Go up */}
              {path !== '/' && (
                <button type="button" onClick={() => { goToPath(parentPath(path)) }}
                  className="mb-4 flex items-center gap-1.5 text-xs text-tundra-ink-400 hover:text-tundra-lichen-700 transition-colors">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M11 17l-5-5m0 0l5-5m-5 5h12" strokeLinecap="round" />
                  </svg>
                  <span className="font-mono">..</span>
                  <span className="text-tundra-ink-300">Go up</span>
                </button>
              )}
              {/* Loading skeleton grid */}
              {filesLoading && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="animate-pulse flex flex-col items-center gap-1.5 rounded-xl p-3">
                      <div className="h-10 w-10 rounded-lg bg-tundra-ink-100" />
                      <div className="h-2.5 w-14 rounded bg-tundra-ink-100" />
                    </div>
                  ))}
                </div>
              )}
              {filesError && !filesLoading && (
                <p className="py-16 text-center text-sm text-red-500">Failed to load directory contents.</p>
              )}
              {!filesLoading && !filesError && files.length === 0 && (
                <p className="py-16 text-center text-sm text-tundra-ink-400">
                  {filterText ? 'No files match that filter.' : 'This directory is empty.'}
                </p>
              )}
              {!filesLoading && !filesError && files.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                  {files.map((f) => {
                    const isSel  = selected.has(f.name)
                    const canEdit = f.type === 'file' && isTextFile(f.name)
                    return (
                      <div key={f.name}
                        onClick={() => { toggleSelect(f.name) }}
                        onDoubleClick={() => {
                          if (f.type === 'dir') enterDir(f.name)
                          else if (canEdit) openEdit(f.name)
                        }}
                        className={[
                          'group relative flex cursor-pointer flex-col items-center gap-1.5 rounded-xl p-3 transition-colors select-none',
                          isSel ? 'bg-tundra-lichen/10 ring-2 ring-tundra-lichen/30' : 'hover:bg-tundra-ink-100/60',
                        ].join(' ')}
                      >
                        <FileIcon type={f.type} name={f.name} large />
                        <span className={`w-full truncate text-center text-[11px] font-medium leading-tight ${f.name.startsWith('.') ? 'text-tundra-ink-400' : 'text-tundra-ink'}`}>
                          {f.name}
                        </span>
                        {f.size && (
                          <span className="text-[10px] text-tundra-ink-300 tabular-nums">{fmtBytes(f.size)}</span>
                        )}
                        {/* Quick action on hover */}
                        {f.type !== 'dir' && (
                          <div className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button type="button" onClick={(e) => { e.stopPropagation(); setModal({ type: 'delete', names: [f.name] }) }}
                              className="flex h-5 w-5 items-center justify-center rounded-md bg-white shadow text-tundra-ink-400 hover:text-red-600 transition-colors">
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Status bar ── */}
        <div className="flex shrink-0 items-center justify-between border-t border-tundra-ink-100 bg-tundra-ink-50/60 px-4 py-1.5">
          <span className="text-xs text-tundra-ink-400">
            {files.length} item{files.length !== 1 ? 's' : ''}
            {selected.size > 0 && <span className="ml-2 font-medium text-tundra-lichen-700">· {selected.size} selected</span>}
          </span>
          <span className="font-mono text-[11px] text-tundra-ink-300">{docRoot}{path === '/' ? '' : path}</span>
        </div>
      </div>

      {/* ── Modals ── */}
      {modal?.type === 'newFile' && (
        <ModalShell title="New file" onClose={() => { setModal(null) }}>
          <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Filename</label>
          <input autoFocus type="text" placeholder="e.g. config.php" value={newName}
            onChange={(e) => { setNewName(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter' && newName) touchMutation.mutate(newName) }}
            className="mb-4 w-full rounded-xl border border-tundra-ink-200 px-3 py-2.5 font-mono text-sm focus:border-tundra-lichen focus:outline-none" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setModal(null) }}
              className="rounded-xl border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">Cancel</button>
            <button type="button" disabled={!newName || touchMutation.isPending}
              onClick={() => { if (newName) touchMutation.mutate(newName) }}
              className="rounded-xl bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
              {touchMutation.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </ModalShell>
      )}

      {modal?.type === 'newFolder' && (
        <ModalShell title="New folder" onClose={() => { setModal(null) }}>
          <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Folder name</label>
          <input autoFocus type="text" placeholder="e.g. assets" value={newName}
            onChange={(e) => { setNewName(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter' && newName) mkdirMutation.mutate(newName) }}
            className="mb-4 w-full rounded-xl border border-tundra-ink-200 px-3 py-2.5 font-mono text-sm focus:border-tundra-lichen focus:outline-none" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setModal(null) }}
              className="rounded-xl border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">Cancel</button>
            <button type="button" disabled={!newName || mkdirMutation.isPending}
              onClick={() => { if (newName) mkdirMutation.mutate(newName) }}
              className="rounded-xl bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
              {mkdirMutation.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </ModalShell>
      )}

      {modal?.type === 'rename' && (
        <ModalShell title={`Rename — ${modal.name}`} onClose={() => { setModal(null) }}>
          <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">New name</label>
          <input autoFocus type="text" value={newName}
            onChange={(e) => { setNewName(e.target.value) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName && modal.type === 'rename') {
                const from = path === '/' ? `/${modal.name}` : `${path}/${modal.name}`
                const to   = path === '/' ? `/${newName}` : `${path}/${newName}`
                renameMutation.mutate({ from, to })
              }
            }}
            className="mb-4 w-full rounded-xl border border-tundra-ink-200 px-3 py-2.5 font-mono text-sm focus:border-tundra-lichen focus:outline-none" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setModal(null) }}
              className="rounded-xl border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">Cancel</button>
            <button type="button" disabled={!newName || renameMutation.isPending}
              onClick={() => {
                if (newName && modal.type === 'rename') {
                  const from = path === '/' ? `/${modal.name}` : `${path}/${modal.name}`
                  const to   = path === '/' ? `/${newName}` : `${path}/${newName}`
                  renameMutation.mutate({ from, to })
                }
              }}
              className="rounded-xl bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
              {renameMutation.isPending ? 'Renaming…' : 'Rename'}
            </button>
          </div>
        </ModalShell>
      )}

      {modal?.type === 'delete' && (
        <ModalShell title="Delete" onClose={() => { setModal(null) }}>
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Permanently delete <strong>{modal.names.length === 1 ? modal.names[0] : `${modal.names.length} items`}</strong>? This cannot be undone.
          </div>
          {modal.names.length > 1 && (
            <ul className="mb-4 max-h-32 overflow-y-auto rounded-xl border border-tundra-ink-100 p-2 text-xs font-mono text-tundra-ink-600">
              {modal.names.map((n) => <li key={n} className="py-0.5">{n}</li>)}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setModal(null) }}
              className="rounded-xl border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">Cancel</button>
            <button type="button" disabled={deleteMutation.isPending}
              onClick={() => { if (modal.type === 'delete') deleteMutation.mutate(modal.names) }}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </ModalShell>
      )}

      {modal?.type === 'chmod' && (
        <ChmodModal
          name={modal.name}
          perms={modal.perms}
          filePath={path === '/' ? `/${modal.name}` : `${path}/${modal.name}`}
          onApply={(filePath, mode) => { chmodMutation.mutate({ filePath, mode }) }}
          isPending={chmodMutation.isPending}
          onClose={() => { setModal(null) }}
        />
      )}
      {modal?.type === 'upload' && (
        <UploadModal path={path} siteId={siteId} onClose={() => { setModal(null) }} onSuccess={() => { void invalidateDir() }} />
      )}
    </div>
  )
}
