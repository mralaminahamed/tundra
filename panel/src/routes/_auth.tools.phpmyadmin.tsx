import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import CodeMirror from '@uiw/react-codemirror'
import { sql as sqlLang, MySQL } from '@codemirror/lang-sql'
import { EditorView, keymap, Prec } from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { api, TundraApiError } from '@/lib/api'
import { fmtBytes } from '@/lib/utils'
import type { WpInstallation } from '@/components/wp-shared'

export const Route = createFileRoute('/_auth/tools/phpmyadmin')({
  validateSearch: (s: Record<string, unknown>) => ({
    installId: typeof s.installId === 'string' ? s.installId : '',
  }),
  component: PhpMyAdmin,
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface QueryResult { columns: string[]; rows: string[][]; row_count: number }
interface DbInfo { version: string; version_comment: string; charset: string; collation: string }
interface TableMeta { name: string; rows: number | null; size_bytes: number | null; engine: string | null; collation: string | null }
interface ColumnInfo { name: string; col_type: string; nullable: boolean; default: string | null; key: string; extra: string; comment: string }
interface IndexInfo { name: string; non_unique: boolean; column_name: string; index_type: string }
interface TableStructure { columns: ColumnInfo[]; indexes: IndexInfo[] }
type ActiveTab = 'browse' | 'structure' | 'search'

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_SQL = "SELECT * FROM wp_options WHERE option_name IN ('siteurl', 'blogname', 'admin_email') LIMIT 20;"

function isDestructiveSql(sql: string): boolean {
  const u = sql.trim().toUpperCase()
  return u.startsWith('DROP TABLE') || u.startsWith('TRUNCATE') || u.startsWith('ALTER TABLE') || (u.startsWith('DELETE') && !u.includes('WHERE'))
}

function downloadCsv(result: QueryResult, filename: string) {
  const header = result.columns.join(',')
  const rows = result.rows.map(row => row.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(','))
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename })
  a.click(); URL.revokeObjectURL(a.href)
}

function KeyBadge({ k }: { k: string }) {
  if (!k) return null
  const cls = k === 'PRI' ? 'bg-yellow-100 text-yellow-700' : k === 'UNI' ? 'bg-blue-100 text-blue-700' : 'bg-tundra-ink-100 text-tundra-ink-500'
  return <span className={`rounded px-1 py-0.5 text-[10px] font-bold ${cls}`}>{k}</span>
}

// ── Sub-components ────────────────────────────────────────────────────────────

function OverviewPanel({ structure, onBrowse }: { structure: TableMeta[]; onBrowse: (t: string) => void }) {
  if (structure.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-tundra-ink-400">
        Select a table from the sidebar or run a query.
      </div>
    )
  }
  return (
    <div className="p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-tundra-ink-400">{structure.length} Tables</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {structure.map(t => (
          <button key={t.name} type="button" onClick={() => onBrowse(t.name)}
            className="rounded-xl border border-tundra-ink-200 bg-white p-3 text-left hover:border-tundra-lichen hover:shadow-sm transition-all">
            <div className="flex items-center gap-2 mb-2">
              <svg className="h-3.5 w-3.5 shrink-0 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M3 10h18M3 6h18M3 14h18M3 18h18" strokeLinecap="round"/>
              </svg>
              <span className="text-xs font-semibold text-tundra-ink truncate">{t.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-tundra-ink-400">
              <span>Rows</span><span className="text-tundra-ink font-mono">{t.rows?.toLocaleString() ?? '~'}</span>
              <span>Size</span><span className="text-tundra-ink font-mono">{t.size_bytes != null ? fmtBytes(t.size_bytes) : '—'}</span>
              <span>Engine</span><span className="text-tundra-ink">{t.engine ?? '—'}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function StructurePanel({ tableStructure, loading }: { tableStructure?: TableStructure; loading: boolean }) {
  if (loading) return (
    <div className="p-4 space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-8 animate-pulse rounded bg-tundra-ink-100"/>)}</div>
  )
  if (!tableStructure) return null
  const { columns, indexes } = tableStructure
  return (
    <div className="p-4 space-y-6">
      {/* Columns */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-tundra-ink-400">Columns ({columns.length})</p>
        <div className="overflow-auto rounded-xl border border-tundra-ink-200">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-tundra-ink-50">
              <tr>
                {['#', 'Column', 'Type', 'Null', 'Default', 'Key', 'Extra'].map(h => (
                  <th key={h} className="border-b border-tundra-ink-200 px-3 py-2 text-left font-semibold text-tundra-ink-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {columns.map((col, i) => (
                <tr key={col.name} className="hover:bg-tundra-ink-50/50">
                  <td className="px-3 py-2 text-tundra-ink-300 font-mono text-[10px]">{i + 1}</td>
                  <td className="px-3 py-2 font-semibold text-tundra-ink">{col.name}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-tundra-ink-600">{col.col_type}</td>
                  <td className="px-3 py-2">{col.nullable ? <span className="text-tundra-ink-400">YES</span> : <span className="font-semibold">NO</span>}</td>
                  <td className="px-3 py-2 font-mono text-[10px]">{col.default ?? <span className="italic text-tundra-ink-300">NULL</span>}</td>
                  <td className="px-3 py-2"><KeyBadge k={col.key} /></td>
                  <td className="px-3 py-2 font-mono text-[10px] text-tundra-ink-500">{col.extra}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Indexes */}
      {indexes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-tundra-ink-400">Indexes ({indexes.length})</p>
          <div className="overflow-auto rounded-xl border border-tundra-ink-200">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-tundra-ink-50">
                <tr>
                  {['Name', 'Column', 'Type', 'Unique'].map(h => (
                    <th key={h} className="border-b border-tundra-ink-200 px-3 py-2 text-left font-semibold text-tundra-ink-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-tundra-ink-100">
                {indexes.map((idx, i) => (
                  <tr key={i} className="hover:bg-tundra-ink-50/50">
                    <td className="px-3 py-2 font-mono text-[10px] text-tundra-ink">{idx.name}</td>
                    <td className="px-3 py-2 font-mono text-[10px]">{idx.column_name}</td>
                    <td className="px-3 py-2">{idx.index_type}</td>
                    <td className="px-3 py-2">{!idx.non_unique ? <span className="text-tundra-lichen-700 font-semibold">YES</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function SearchPanel({ columns, tableName, onSearch }: { columns: ColumnInfo[]; tableName: string; onSearch: (sql: string) => void }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const topCols = columns.slice(0, 6)
  function buildQuery() {
    const clauses = topCols.filter(c => values[c.name]?.trim()).map(c => `\`${c.name}\` LIKE '%${values[c.name]}%'`)
    return clauses.length > 0 ? `SELECT * FROM \`${tableName}\` WHERE ${clauses.join(' AND ')} LIMIT 100;` : ''
  }
  return (
    <div className="p-4 max-w-lg">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-tundra-ink-400">Search rows (LIKE match)</p>
      <div className="space-y-2">
        {topCols.map(col => (
          <div key={col.name} className="flex items-center gap-3">
            <label className="w-32 shrink-0 text-xs font-mono text-tundra-ink-500 truncate">{col.name}</label>
            <input type="text" placeholder={col.col_type}
              value={values[col.name] ?? ''}
              onChange={e => setValues(v => ({ ...v, [col.name]: e.target.value }))}
              className="flex-1 rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs focus:border-tundra-lichen focus:outline-none"/>
          </div>
        ))}
      </div>
      <button type="button"
        onClick={() => { const q = buildQuery(); if (q) onSearch(q) }}
        className="mt-4 rounded-lg bg-[#21759B] px-4 py-2 text-xs font-medium text-white hover:bg-[#1a6284] transition-colors">
        Search
      </button>
    </div>
  )
}

function BrowsePanel({
  result, loading, currentPage, pageSize,
  onPageChange, onPageSizeChange, onExport,
}: {
  result: QueryResult | null; loading: boolean; currentPage: number; pageSize: number
  onPageChange: (p: number) => void; onPageSizeChange: (s: number) => void; onExport: () => void
}) {
  const hasNextPage = result ? result.rows.length === pageSize : false
  return (
    <div className="flex flex-col h-full">
      {/* Pagination bar */}
      <div className="shrink-0 flex items-center gap-2 border-b border-tundra-ink-200 bg-white px-3 py-2">
        <div className="flex items-center gap-1">
          <button type="button" disabled={currentPage === 0} onClick={() => onPageChange(currentPage - 1)}
            className="flex items-center gap-1 rounded-md border border-tundra-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" strokeLinecap="round"/></svg>
            Prev
          </button>
          <span className="px-2 text-xs font-medium text-tundra-ink-600">Page {currentPage + 1}</span>
          <button type="button" disabled={!hasNextPage} onClick={() => onPageChange(currentPage + 1)}
            className="flex items-center gap-1 rounded-md border border-tundra-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            Next
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="h-4 w-px bg-tundra-ink-200"/>
        <div className="flex items-center gap-1">
          <span className="text-xs text-tundra-ink-400">Per page:</span>
          {[25, 50, 100, 250].map(n => (
            <button key={n} type="button" onClick={() => onPageSizeChange(n)}
              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${pageSize === n ? 'bg-[#21759B] text-white' : 'text-tundra-ink-500 hover:bg-tundra-ink-100'}`}>
              {n}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {result && (
            <span className="text-xs font-medium text-tundra-ink-500">
              <span className="text-tundra-ink font-semibold">{result.row_count}</span> row{result.row_count !== 1 ? 's' : ''} &nbsp;·&nbsp; <span className="text-tundra-ink font-semibold">{result.columns.length}</span> col{result.columns.length !== 1 ? 's' : ''}
            </span>
          )}
          {result && (
            <button type="button" onClick={onExport}
              className="flex items-center gap-1.5 rounded-md border border-tundra-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round"/>
              </svg>
              Export CSV
            </button>
          )}
        </div>
      </div>
      {/* Results */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex h-32 items-center justify-center">
            <svg className="h-6 w-6 animate-spin text-[#21759B]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
        )}
        {!loading && result && (
          <div className="min-w-max">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-tundra-ink-100">
                  <th className="border-b-2 border-r border-tundra-ink-200 px-3 py-2 text-center font-mono text-[10px] text-tundra-ink-400 w-10 select-none">#</th>
                  {result.columns.map(col => (
                    <th key={col} className="border-b-2 border-r border-tundra-ink-200 px-3 py-2 text-left text-xs font-bold text-tundra-ink whitespace-nowrap tracking-tight">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, ri) => (
                  <tr key={ri} className={`border-b border-tundra-ink-100 hover:bg-blue-50/40 transition-colors ${ri % 2 === 0 ? 'bg-white' : 'bg-tundra-ink-50/40'}`}>
                    <td className="border-r border-tundra-ink-100 px-3 py-2 text-center font-mono text-[10px] text-tundra-ink-300 select-none">{currentPage * pageSize + ri + 1}</td>
                    {row.map((cell, ci) => (
                      <td key={ci} title={cell}
                        className="border-r border-tundra-ink-100 px-3 py-2 font-mono text-[11px] text-tundra-ink whitespace-nowrap max-w-xs overflow-hidden text-ellipsis">
                        {cell === 'NULL' ? <span className="italic text-tundra-ink-300 text-[10px]">NULL</span>
                         : cell === '' ? <span className="italic text-tundra-ink-300 text-[10px]">(empty)</span>
                         : cell}
                      </td>
                    ))}
                  </tr>
                ))}
                {result.rows.length === 0 && (
                  <tr><td colSpan={result.columns.length + 1} className="py-12 text-center text-sm text-tundra-ink-400">No rows returned</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !result && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <svg className="h-10 w-10 text-tundra-ink-200" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path d="M3 10h18M3 6h18M3 14h18M3 18h18" strokeLinecap="round"/>
            </svg>
            <p className="text-sm text-tundra-ink-400">Run a query or click a table to browse</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Confirmation Modal ────────────────────────────────────────────────────────

function ConfirmModal({ title, message, confirmLabel, confirmClass = 'bg-red-600 text-white hover:bg-red-700', onConfirm, onCancel, children }: {
  title: string; message: string; confirmLabel: string; confirmClass?: string
  onConfirm: () => void; onCancel: () => void; children?: React.ReactNode
}) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-tundra-ink-200 bg-white p-6 shadow-xl">
        <h3 className="text-sm font-semibold text-tundra-ink">{title}</h3>
        <p className="mt-1.5 text-xs text-tundra-ink-400">{message}</p>
        {children}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-xs font-medium transition-colors ${confirmClass}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

function PhpMyAdmin() {
  const { installId } = Route.useSearch()
  useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)
  const resizeHandleRef = useRef<HTMLDivElement>(null)

  // Core query state
  const [sql, setSql] = useState(DEFAULT_SQL)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [activeTable, setActiveTable] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // View/tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>('browse')
  const [mainView, setMainView] = useState<'overview' | 'table'>('overview')

  // Write mode
  const [writeMode, setWriteMode] = useState(false)
  const [showWriteModeConfirm, setShowWriteModeConfirm] = useState(false)
  const [pendingDestructive, setPendingDestructive] = useState<string | null>(null)

  // Table actions
  const [tableFilter, setTableFilter] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; table: string } | null>(null)
  const [truncateTarget, setTruncateTarget] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [confirmInput, setConfirmInput] = useState('')

  // Pagination
  const [pageSize, setPageSize] = useState(25)
  const [currentPage, setCurrentPage] = useState(0)

  // Editor theme
  const [editorTheme, setEditorTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('pma-editor-theme') as 'dark' | 'light') ?? 'dark'
  )

  // Resizable editor
  const [editorHeight, setEditorHeight] = useState(100)
  const isDragging = useRef(false)
  const dragStartY = useRef(0)
  const dragStartH = useRef(0)

  // Fullscreen
  const [isFullscreen, setIsFullscreen] = useState(false)

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: install } = useQuery<WpInstallation>({
    queryKey: ['wp-installation', installId],
    queryFn: () => api<WpInstallation>(`/wordpress/installations/${installId}`),
    enabled: !!installId,
  })
  const { data: dbInfo } = useQuery<DbInfo>({
    queryKey: ['wp-db-info', installId],
    queryFn: () => api<DbInfo>(`/wordpress/installations/${installId}/database/info`),
    enabled: !!installId,
  })
  const { data: dbStructure = [], refetch: refetchStructure } = useQuery<TableMeta[]>({
    queryKey: ['wp-db-structure', installId],
    queryFn: () => api<{ data: TableMeta[] }>(`/wordpress/installations/${installId}/database/structure`).then(r => r.data),
    enabled: !!installId,
  })
  const { data: tables = [], isLoading: tablesLoading, isError: tablesError, refetch: refetchTables } = useQuery<string[]>({
    queryKey: ['wp-db-tables', installId],
    queryFn: () => api<{ data: string[] }>(`/wordpress/installations/${installId}/database/tables`).then(r => r.data),
    enabled: !!installId,
    retry: 1,
  })
  const { data: tableStructure, isFetching: structureFetching } = useQuery<TableStructure>({
    queryKey: ['wp-table-columns', installId, activeTable],
    queryFn: () => api<TableStructure>(`/wordpress/installations/${installId}/database/tables/${activeTable}/columns`),
    enabled: !!installId && !!activeTable && activeTab === 'structure',
  })

  // ── Mutations ────────────────────────────────────────────────────────────

  const queryMut = useMutation({
    mutationFn: ({ q, write }: { q: string; write?: boolean }) =>
      api<QueryResult>(`/wordpress/installations/${installId}/database/query`, {
        method: 'POST', body: { sql: q, write_mode: write ?? writeMode },
      }),
    onSuccess: (data, vars) => {
      setResult(data); setQueryError(null)
      setHistory(h => [vars.q, ...h.filter(x => x !== vars.q)].slice(0, 30))
    },
    onError: (e) => {
      const msg = e instanceof TundraApiError ? e.message : e instanceof Error ? e.message : 'Query failed'
      setQueryError(msg); setResult(null); toast.error(msg)
    },
  })

  const truncateMut = useMutation({
    mutationFn: (table: string) =>
      api(`/wordpress/installations/${installId}/database/query`, {
        method: 'POST', body: { sql: `TRUNCATE TABLE \`${table}\``, write_mode: true },
      }),
    onSuccess: () => {
      toast.success(`Table truncated`)
      setTruncateTarget(null); setConfirmInput('')
      void refetchStructure()
      if (activeTable === truncateTarget) { setResult(null) }
    },
    onError: e => toast.error(e instanceof Error ? e.message : 'Truncate failed'),
  })

  const dropMut = useMutation({
    mutationFn: (table: string) =>
      api(`/wordpress/installations/${installId}/database/query`, {
        method: 'POST', body: { sql: `DROP TABLE \`${table}\``, write_mode: true },
      }),
    onSuccess: () => {
      toast.success('Table dropped')
      setDropTarget(null); setConfirmInput('')
      void refetchTables(); void refetchStructure()
      if (activeTable === dropTarget) { setActiveTable(null); setMainView('overview'); setResult(null) }
    },
    onError: e => toast.error(e instanceof Error ? e.message : 'Drop failed'),
  })

  // ── Helpers ──────────────────────────────────────────────────────────────

  const runSql = useCallback((overrideSql?: string) => {
    const q = (overrideSql ?? sql).trim()
    if (!q) return
    if (writeMode && isDestructiveSql(q)) { setPendingDestructive(q); return }
    setResult(null); setQueryError(null); setCurrentPage(0)
    // Always switch to table/browse view so results are visible
    setMainView('table'); setActiveTab('browse')
    queryMut.mutate({ q })
  }, [sql, queryMut, writeMode])

  function browseTable(table: string, page = 0, size = pageSize) {
    const q = `SELECT * FROM \`${table}\` LIMIT ${size} OFFSET ${page * size};`
    setSql(q); setActiveTable(table); setActiveTab('browse'); setMainView('table')
    setCurrentPage(page); setResult(null); setQueryError(null)
    queryMut.mutate({ q })
  }

  function describeTable(table: string) {
    const q = `DESCRIBE \`${table}\`;`
    setSql(q); setActiveTable(table); setActiveTab('browse'); setMainView('table')
    setResult(null); setQueryError(null)
    queryMut.mutate({ q })
  }

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true) }
  }, [contextMenu])

  useEffect(() => {
    const handle = resizeHandleRef.current
    if (!handle) return
    const onDown = (e: PointerEvent) => {
      isDragging.current = true; dragStartY.current = e.clientY; dragStartH.current = editorHeight
      handle.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!isDragging.current) return
      setEditorHeight(Math.max(60, Math.min(480, dragStartH.current + e.clientY - dragStartY.current)))
    }
    const onUp = () => { isDragging.current = false }
    handle.addEventListener('pointerdown', onDown)
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    return () => {
      handle.removeEventListener('pointerdown', onDown)
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
    }
  }, [editorHeight])

  function toggleFullscreen() {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen()
    else document.exitFullscreen()
  }

  const filteredTables = tables.filter(t => t.toLowerCase().includes(tableFilter.toLowerCase()))
  const tableMetaMap = Object.fromEntries(dbStructure.map(t => [t.name, t]))

  // Use a stable ref for runSql so extensions don't change on every keystroke
  const runSqlRef = useRef(runSql)
  useEffect(() => { runSqlRef.current = runSql }, [runSql])

  // Build SQL schema for autocomplete — tables from sidebar, columns from active table structure
  const sqlExtensions = useMemo(() => {
    const schema: Record<string, string[]> = {}
    for (const t of tables) schema[t] = []
    if (activeTable && tableStructure) {
      schema[activeTable] = tableStructure.columns.map(c => c.name)
    }
    const runKey = Prec.highest(keymap.of([{
      key: 'Mod-Enter',
      run: () => { runSqlRef.current(); return true },
    }]))

    const darkTheme = EditorView.theme({
      '&': { background: '#1e1e2e !important', fontSize: '12px' },
      '.cm-content': { fontFamily: 'ui-monospace, monospace', padding: '8px 0', color: '#cdd6f4' },
      '.cm-line': { padding: '0 16px' },
      '.cm-gutters': { background: '#1e1e2e', border: 'none', color: '#45475a', minWidth: '32px' },
      '.cm-activeLineGutter': { background: '#313244' },
      '.cm-activeLine': { background: '#313244 !important' },
      '.cm-cursor': { borderLeftColor: '#cdd6f4' },
      '.cm-selectionBackground': { background: '#45475a !important' },
      '.cm-tooltip': { background: '#313244', border: '1px solid #45475a', borderRadius: '8px', overflow: 'hidden' },
      '.cm-tooltip-autocomplete ul': { background: '#313244', maxHeight: '200px' },
      '.cm-tooltip-autocomplete ul li': { padding: '4px 12px', color: '#cdd6f4', fontSize: '11px' },
      '.cm-tooltip-autocomplete ul li[aria-selected]': { background: '#45475a' },
      '.cm-completionIcon': { display: 'none' },
      '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: 'bold', color: '#89b4fa' },
      '.cm-placeholder': { color: '#6c7086' },
    })

    const lightTheme = EditorView.theme({
      '&': { background: '#ffffff !important', fontSize: '12px' },
      '.cm-content': { fontFamily: 'ui-monospace, monospace', padding: '8px 0', color: '#1e293b' },
      '.cm-line': { padding: '0 16px' },
      '.cm-gutters': { background: '#f8fafc', border: 'none', borderRight: '1px solid #e2e8f0', color: '#94a3b8', minWidth: '32px' },
      '.cm-activeLineGutter': { background: '#f1f5f9' },
      '.cm-activeLine': { background: '#f1f5f9 !important' },
      '.cm-cursor': { borderLeftColor: '#334155' },
      '.cm-selectionBackground': { background: '#bfdbfe !important' },
      '.cm-tooltip': { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' },
      '.cm-tooltip-autocomplete ul': { background: '#fff', maxHeight: '200px' },
      '.cm-tooltip-autocomplete ul li': { padding: '4px 12px', color: '#334155', fontSize: '11px' },
      '.cm-tooltip-autocomplete ul li[aria-selected]': { background: '#eff6ff' },
      '.cm-completionIcon': { display: 'none' },
      '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: 'bold', color: '#2563eb' },
      '.cm-placeholder': { color: '#94a3b8' },
    })

    return [
      sqlLang({ dialect: MySQL, schema, upperCaseKeywords: false }),
      editorTheme === 'dark' ? [oneDark, darkTheme] : lightTheme,
      runKey,
    ]
  }, [tables, activeTable, tableStructure, editorTheme]) // runSqlRef is stable — no dep needed

  // ── No installId state ───────────────────────────────────────────────────

  if (!installId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-tundra-ink-100">
          <svg className="h-7 w-7 text-tundra-ink-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.657 4.03 3 9 3s9-1.343 9-3V5"/>
            <path d="M3 12c0 1.657 4.03 3 9 3s9-1.343 9-3"/>
          </svg>
        </div>
        <p className="text-base font-semibold text-tundra-ink">No installation selected</p>
        <p className="text-sm text-tundra-ink-400">Open phpMyAdmin from a WordPress installation's Database tab.</p>
        <Link to="/wordpress" className="rounded-lg bg-[#21759B] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a6284] transition-colors">
          Browse WordPress
        </Link>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex h-full overflow-hidden bg-white [&:fullscreen]:h-screen [&:fullscreen]:w-screen">

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      {showWriteModeConfirm && (
        <ConfirmModal
          title="Enable Write Mode?"
          message="Write mode allows INSERT, UPDATE, DELETE, ALTER TABLE, DROP TABLE, and TRUNCATE queries. Mistakes can permanently destroy data."
          confirmLabel="Enable Write Mode"
          confirmClass="bg-amber-500 text-white hover:bg-amber-600"
          onConfirm={() => { setWriteMode(true); setShowWriteModeConfirm(false); toast.warning('Write mode enabled') }}
          onCancel={() => setShowWriteModeConfirm(false)}
        />
      )}

      {pendingDestructive && (
        <ConfirmModal
          title="Execute Destructive Query?"
          message="This query may permanently modify or delete data."
          confirmLabel="Execute Anyway"
          onConfirm={() => {
            const q = pendingDestructive; setPendingDestructive(null)
            setResult(null); setQueryError(null)
            queryMut.mutate({ q, write: true })
          }}
          onCancel={() => setPendingDestructive(null)}
        >
          <pre className="mt-3 max-h-24 overflow-auto rounded-lg bg-tundra-ink-900 p-3 text-[11px] font-mono text-red-300 whitespace-pre-wrap">
            {pendingDestructive}
          </pre>
        </ConfirmModal>
      )}

      {truncateTarget && (
        <ConfirmModal
          title={`Truncate \`${truncateTarget}\`?`}
          message={`All rows in \`${truncateTarget}\` will be permanently deleted. This cannot be undone.`}
          confirmLabel={truncateMut.isPending ? 'Truncating…' : 'Truncate Table'}
          onConfirm={() => { if (confirmInput === 'TRUNCATE') truncateMut.mutate(truncateTarget) }}
          onCancel={() => { setTruncateTarget(null); setConfirmInput('') }}
        >
          <p className="mt-3 text-xs text-tundra-ink-400">Type <code className="font-mono font-bold text-tundra-ink">TRUNCATE</code> to confirm:</p>
          <input type="text" value={confirmInput} onChange={e => setConfirmInput(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm font-mono focus:border-red-400 focus:outline-none"/>
        </ConfirmModal>
      )}

      {dropTarget && (
        <ConfirmModal
          title={`Drop \`${dropTarget}\`?`}
          message={`Table \`${dropTarget}\` and all its data will be permanently destroyed.`}
          confirmLabel={dropMut.isPending ? 'Dropping…' : 'Drop Table'}
          onConfirm={() => { if (confirmInput === dropTarget) dropMut.mutate(dropTarget) }}
          onCancel={() => { setDropTarget(null); setConfirmInput('') }}
        >
          <p className="mt-3 text-xs text-tundra-ink-400">Type the table name <code className="font-mono font-bold text-tundra-ink">{dropTarget}</code> to confirm:</p>
          <input type="text" value={confirmInput} onChange={e => setConfirmInput(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm font-mono focus:border-red-400 focus:outline-none"/>
        </ConfirmModal>
      )}

      {/* ── Context Menu ───────────────────────────────────────────────────── */}

      {contextMenu && createPortal(
        <div
          className="fixed z-50 w-44 rounded-xl border border-tundra-ink-200 bg-white py-1 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          {[
            { label: 'Browse', icon: '▶', action: () => browseTable(contextMenu.table) },
            { label: 'Structure', icon: '⊞', action: () => { setActiveTable(contextMenu.table); setActiveTab('structure'); setMainView('table') } },
            { label: 'Search', icon: '⌕', action: () => { setActiveTable(contextMenu.table); setActiveTab('search'); setMainView('table') } },
          ].map(item => (
            <button key={item.label} type="button"
              onClick={() => { item.action(); setContextMenu(null) }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
              <span className="w-4 text-tundra-ink-300">{item.icon}</span>{item.label}
            </button>
          ))}
          <div className="mx-3 my-1 border-t border-tundra-ink-100"/>
          <button type="button"
            disabled={!writeMode}
            onClick={() => { setTruncateTarget(contextMenu.table); setConfirmInput(''); setContextMenu(null) }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-amber-600 hover:bg-amber-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <span className="w-4">⊘</span>Truncate
          </button>
          <button type="button"
            disabled={!writeMode}
            onClick={() => { setDropTarget(contextMenu.table); setConfirmInput(''); setContextMenu(null) }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <span className="w-4">✕</span>Drop
          </button>
          {!writeMode && <p className="px-3 pb-1.5 text-[10px] text-tundra-ink-300">Enable write mode to modify</p>}
        </div>,
        document.body
      )}

      {/* ── Left sidebar ───────────────────────────────────────────────────── */}

      <div className="flex w-56 shrink-0 flex-col border-r border-tundra-ink-100 bg-tundra-ink-50/60 overflow-hidden">
        {/* DB header */}
        <div className="border-b border-tundra-ink-100 px-3 py-3 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <svg className="h-3.5 w-3.5 shrink-0 text-tundra-aurora" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.657 4.03 3 9 3s9-1.343 9-3V5"/>
              <path d="M3 12c0 1.657 4.03 3 9 3s9-1.343 9-3"/>
            </svg>
            <span className="text-xs font-semibold text-tundra-ink truncate">{install?.db_name ?? 'Loading…'}</span>
          </div>
          <p className="text-[10px] text-tundra-ink-400 truncate">{install?.site_url}</p>
        </div>

        {/* Search */}
        <div className="border-b border-tundra-ink-100 px-2 py-1.5 shrink-0">
          <div className="flex items-center gap-1.5 rounded-lg border border-tundra-ink-200 bg-white px-2 py-1">
            <svg className="h-3 w-3 shrink-0 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input type="text" placeholder="Filter tables…" value={tableFilter}
              onChange={e => setTableFilter(e.target.value)}
              className="flex-1 bg-transparent text-xs text-tundra-ink placeholder:text-tundra-ink-300 focus:outline-none"/>
            {tableFilter && (
              <button type="button" onClick={() => setTableFilter('')} className="text-tundra-ink-300 hover:text-tundra-ink">
                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            )}
          </div>
        </div>

        {/* Table count header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-tundra-ink-100 shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-tundra-ink-400">
            Tables {tables.length > 0 && `(${filteredTables.length}${filteredTables.length < tables.length ? `/${tables.length}` : ''})`}
          </p>
        </div>

        {/* Table list */}
        <div className="flex-1 overflow-y-auto py-1 px-1.5">
          {tablesLoading ? (
            <div className="space-y-1 py-1">{[1,2,3,4,5,6].map(i => <div key={i} className="h-6 animate-pulse rounded bg-tundra-ink-100"/>)}</div>
          ) : tablesError ? (
            <p className="px-2 py-3 text-xs text-red-500">Could not connect to database.</p>
          ) : filteredTables.length === 0 ? (
            <p className="px-2 py-3 text-xs text-tundra-ink-400">{tableFilter ? 'No matches.' : 'No tables found.'}</p>
          ) : (
            filteredTables.map(t => {
              const meta = tableMetaMap[t]
              return (
                <div key={t} className="group relative">
                  <button type="button"
                    onClick={() => browseTable(t)}
                    onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, table: t }) }}
                    className={[
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                      activeTable === t
                        ? 'bg-[#21759B]/10 font-semibold text-[#21759B]'
                        : 'text-tundra-ink-700 hover:bg-tundra-ink-100 hover:text-tundra-ink',
                    ].join(' ')}
                  >
                    <svg className={`h-3.5 w-3.5 shrink-0 ${activeTable === t ? 'text-[#21759B]' : 'text-tundra-ink-400'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path d="M3 10h18M3 6h18M3 14h18M3 18h18" strokeLinecap="round"/>
                    </svg>
                    <span className="flex-1 truncate">{t}</span>
                    {meta?.rows != null && (
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
                        activeTable === t ? 'bg-[#21759B]/20 text-[#21759B]' : 'bg-tundra-ink-100 text-tundra-ink-500'
                      }`}>
                        {meta.rows > 9999 ? `${(meta.rows / 1000).toFixed(1)}k` : meta.rows}
                      </span>
                    )}
                  </button>
                  {/* Quick action buttons on hover */}
                  <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                    <button type="button" title="Structure" onClick={e => { e.stopPropagation(); setActiveTable(t); setActiveTab('structure'); setMainView('table') }}
                      className="rounded p-0.5 text-tundra-ink-300 hover:bg-tundra-ink-200 hover:text-tundra-ink">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="17" width="18" height="4" rx="1"/>
                      </svg>
                    </button>
                    <button type="button" title="Describe" onClick={e => { e.stopPropagation(); describeTable(t) }}
                      className="rounded p-0.5 text-tundra-ink-300 hover:bg-tundra-ink-200 hover:text-tundra-ink">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* DB Info footer */}
        {dbInfo && (
          <div className="border-t border-tundra-ink-100 bg-tundra-ink-50 px-3 py-2 shrink-0">
            <p className="text-[11px] font-medium text-tundra-ink-600 font-mono truncate">MySQL {dbInfo.version}</p>
            <p className="text-[10px] text-tundra-ink-400 truncate mt-0.5">{dbInfo.charset} / {dbInfo.collation}</p>
          </div>
        )}

        {/* Back link */}
        {install && (
          <div className="border-t border-tundra-ink-100 p-2 shrink-0">
            <Link to="/wordpress/$installId/database" params={{ installId }}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-tundra-ink-400 hover:bg-tundra-ink-100 hover:text-tundra-ink transition-colors">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back to {install.site_title ?? 'site'}
            </Link>
          </div>
        )}
      </div>

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">

        {/* Toolbar */}
        <div className="relative flex shrink-0 items-center gap-2 border-b border-tundra-ink-200 bg-white px-3 py-2 min-h-[44px]">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-xs min-w-0">
            <span className="font-mono font-semibold text-tundra-ink shrink-0">{install?.db_host ?? 'localhost'}</span>
            <svg className="h-3 w-3 shrink-0 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
            <span className="font-mono font-semibold text-[#21759B] shrink-0">{install?.db_name ?? '—'}</span>
            {activeTable && <>
              <svg className="h-3 w-3 shrink-0 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
              <span className="font-mono font-medium text-tundra-ink-700 truncate">{activeTable}</span>
            </>}
          </div>

          {/* Tab strip */}
          {activeTable && mainView === 'table' && (
            <div className="ml-3 flex items-center rounded-lg border border-tundra-ink-200 bg-tundra-ink-50 p-0.5 gap-0.5">
              {(['browse', 'structure', 'search'] as ActiveTab[]).map(tab => (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                  className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-all ${
                    activeTab === tab ? 'bg-white text-tundra-ink shadow-sm' : 'text-tundra-ink-500 hover:text-tundra-ink'
                  }`}>
                  {tab}
                </button>
              ))}
            </div>
          )}

          {/* Overview button */}
          {mainView === 'table' && (
            <button type="button" onClick={() => { setMainView('overview'); setActiveTable(null) }}
              className="ml-1 flex items-center gap-1.5 rounded-lg border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
              </svg>
              Overview
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* Write mode */}
            <button type="button"
              onClick={() => writeMode ? setWriteMode(false) : setShowWriteModeConfirm(true)}
              title={writeMode ? 'Write mode ON — click to disable' : 'Read-only — click to enable writes'}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                writeMode ? 'border-red-300 bg-red-50 text-red-600' : 'border-tundra-ink-200 bg-white text-tundra-ink-600 hover:bg-tundra-ink-50'
              }`}>
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                {writeMode
                  ? <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 019.9-1"/></>
                  : <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></>}
              </svg>
              {writeMode ? 'Write mode' : 'Read only'}
            </button>

            {/* Theme toggle */}
            <button type="button"
              onClick={() => {
                const next = editorTheme === 'dark' ? 'light' : 'dark'
                setEditorTheme(next)
                localStorage.setItem('pma-editor-theme', next)
              }}
              title={editorTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="flex items-center rounded-lg border border-tundra-ink-200 bg-white p-1.5 text-tundra-ink-500 hover:bg-tundra-ink-50 transition-colors">
              {editorTheme === 'dark'
                ? <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                : <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>}
            </button>

            {/* Fullscreen */}
            <button type="button" onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              className="flex items-center rounded-lg border border-tundra-ink-200 bg-white p-1.5 text-tundra-ink-500 hover:bg-tundra-ink-50 transition-colors">
              {isFullscreen
                ? <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg>
                : <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>}
            </button>

            {/* History */}
            <button type="button" onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                showHistory ? 'border-[#21759B] bg-[#21759B]/5 text-[#21759B]' : 'border-tundra-ink-200 bg-white text-tundra-ink-600 hover:bg-tundra-ink-50'
              }`}>
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
              </svg>
              History {history.length > 0 && <span className="rounded-full bg-tundra-ink-200 px-1 text-[10px] text-tundra-ink-600">{history.length}</span>}
            </button>

            {/* Run */}
            <button type="button" disabled={!sql.trim() || queryMut.isPending} onClick={() => runSql()}
              className="flex items-center gap-2 rounded-lg bg-[#21759B] px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#1a6284] disabled:opacity-40 transition-colors">
              {queryMut.isPending
                ? <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                : <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
              Run <span className="text-[10px] opacity-60 ml-0.5">⌘↵</span>
            </button>
          </div>

          {/* History dropdown */}
          {showHistory && (
            <div className="absolute right-0 top-full z-50 mt-1 w-96 rounded-xl border border-tundra-ink-200 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-tundra-ink-100 px-3 py-2">
                <p className="text-xs font-semibold text-tundra-ink">{history.length > 0 ? `${history.length} recent queries` : 'No history yet'}</p>
                <button type="button" onClick={() => setShowHistory(false)} className="text-tundra-ink-300 hover:text-tundra-ink">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              {history.length > 0 && (
                <div className="max-h-64 overflow-y-auto py-1">
                  {history.map((q, i) => (
                    <button key={i} type="button" onClick={() => { setSql(q); setShowHistory(false) }}
                      className="w-full px-3 py-1.5 text-left text-xs font-mono text-tundra-ink-600 hover:bg-tundra-ink-50 truncate">
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* SQL Editor — CodeMirror with SQL autocomplete */}
        <div className="shrink-0 border-b border-tundra-ink-100 overflow-hidden" style={{ height: editorHeight }}>
          <CodeMirror
            value={sql}
            height={`${editorHeight}px`}
            extensions={sqlExtensions}
            onChange={setSql}
            placeholder="SELECT * FROM wp_options LIMIT 10;"
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              highlightActiveLine: true,
              autocompletion: true,
              closeBrackets: true,
              indentOnInput: true,
            }}
          />
        </div>

        {/* Status bar — adapts to editor theme */}
        <div className={`shrink-0 flex items-center gap-3 px-3 py-1.5 text-[11px] border-t ${
          editorTheme === 'dark'
            ? 'bg-[#181825] border-[#313244]'
            : 'bg-slate-50 border-slate-200'
        }`}>
          {writeMode ? (
            <span className={`flex items-center gap-1.5 font-medium ${editorTheme === 'dark' ? 'text-amber-400' : 'text-amber-600'}`}>
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Write mode active
            </span>
          ) : (
            <span className={`font-mono ${editorTheme === 'dark' ? 'text-[#585b70]' : 'text-slate-400'}`}>SELECT · SHOW · DESCRIBE · EXPLAIN</span>
          )}
          <span className={`ml-auto ${editorTheme === 'dark' ? 'text-[#585b70]' : 'text-slate-400'}`}>⌘↵ to run</span>
        </div>

        {/* Resize handle */}
        <div ref={resizeHandleRef}
          className="shrink-0 h-2 cursor-row-resize bg-tundra-ink-100 hover:bg-[#21759B]/20 transition-colors flex items-center justify-center border-y border-tundra-ink-200 group">
          <div className="w-10 h-0.5 rounded-full bg-tundra-ink-300 group-hover:bg-[#21759B]/60 transition-colors"/>
        </div>

        {/* Results area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {queryError && !queryMut.isPending && (
            <div className="m-3 shrink-0 rounded-xl border border-red-200 bg-red-50 p-3">
              <div className="flex items-start gap-2">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                <div>
                  <p className="text-xs font-semibold text-red-700">Query error</p>
                  <p className="mt-0.5 font-mono text-xs text-red-600 whitespace-pre-wrap">{queryError}</p>
                </div>
              </div>
            </div>
          )}

          {mainView === 'overview' && !queryMut.isPending && !queryError && (
            <div className="flex-1 overflow-auto">
              <OverviewPanel structure={dbStructure} onBrowse={browseTable} />
            </div>
          )}

          {mainView === 'table' && activeTab === 'browse' && (
            <BrowsePanel
              result={result} loading={queryMut.isPending}
              currentPage={currentPage} pageSize={pageSize}
              onPageChange={p => browseTable(activeTable ?? '', p, pageSize)}
              onPageSizeChange={s => { setPageSize(s); browseTable(activeTable ?? '', 0, s) }}
              onExport={() => result && downloadCsv(result, `${activeTable}-p${currentPage + 1}.csv`)}
            />
          )}

          {mainView === 'table' && activeTab === 'structure' && (
            <div className="flex-1 overflow-auto">
              <StructurePanel tableStructure={tableStructure} loading={structureFetching} />
            </div>
          )}

          {mainView === 'table' && activeTab === 'search' && tableStructure && activeTable && (
            <div className="flex-1 overflow-auto">
              <SearchPanel columns={tableStructure.columns} tableName={activeTable} onSearch={q => { setSql(q); setActiveTab('browse'); runSql(q) }} />
            </div>
          )}
        </div>

        {/* Bottom status bar */}
        <div className="shrink-0 flex items-center gap-3 border-t border-tundra-ink-200 bg-tundra-ink-50 px-3 py-1.5 text-xs">
          {queryError
            ? <span className="flex items-center gap-1 text-red-600 font-medium"><svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>Error</span>
            : result
              ? <span className="flex items-center gap-1 text-tundra-lichen-700 font-medium"><svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Query OK · {result.row_count} row{result.row_count !== 1 ? 's' : ''}</span>
              : <span className="text-tundra-ink-400">Ready</span>}
          <span className="ml-auto font-mono text-[10px] text-tundra-ink-400 truncate">{install?.install_path ?? ''}</span>
        </div>
      </div>
    </div>
  )
}
