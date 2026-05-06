import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { php } from '@codemirror/lang-php'
import { javascript } from '@codemirror/lang-javascript'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { json } from '@codemirror/lang-json'

import { api } from '@/lib/api'
import type { Site } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/editor/$siteId')({
  validateSearch: (s: Record<string, unknown>): { files: string[]; active: string } => {
    const raw = s.files
    const files = Array.isArray(raw)
      ? (raw as string[]).filter(Boolean)
      : typeof raw === 'string'
      ? raw.split(',').map((f) => f.trim()).filter(Boolean)
      : []
    return {
      files,
      active: typeof s.active === 'string' ? s.active : (files[0] ?? ''),
    }
  },
  component: FileEditor,
})

// ── Language detection ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getLang(filepath: string): any[] {
  const ext = filepath.split('.').pop()?.toLowerCase() ?? ''
  const name = filepath.split('/').pop() ?? ''

  if (name === '.htaccess' || ext === 'conf' || ext === 'ini') return []
  if (ext === 'php' || ext === 'phtml') return [php()]
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return [javascript()]
  if (ext === 'ts') return [javascript({ typescript: true })]
  if (ext === 'tsx') return [javascript({ typescript: true, jsx: true })]
  if (ext === 'jsx') return [javascript({ jsx: true })]
  if (ext === 'css' || ext === 'scss' || ext === 'sass') return [css()]
  if (ext === 'html' || ext === 'htm') return [html()]
  if (ext === 'json') return [json()]
  return []
}

function getLanguageLabel(filepath: string): string {
  const ext = filepath.split('.').pop()?.toLowerCase() ?? ''
  const name = filepath.split('/').pop() ?? ''
  if (name === '.htaccess') return 'Apache Config'
  const map: Record<string, string> = {
    php: 'PHP', js: 'JavaScript', ts: 'TypeScript', tsx: 'TSX', jsx: 'JSX',
    css: 'CSS', scss: 'SCSS', html: 'HTML', htm: 'HTML', json: 'JSON',
    txt: 'Text', md: 'Markdown', sh: 'Shell', conf: 'Config', ini: 'INI',
    yaml: 'YAML', yml: 'YAML', sql: 'SQL', xml: 'XML',
  }
  return map[ext] ?? 'Plain text'
}

// ── Dir tree (for explorer sidebar) ──────────────────────────────────────────

type TreeNode = { name: string; path: string; children?: TreeNode[] }

const DIR_TREE: TreeNode[] = [
  {
    name: 'wp-content', path: '/wp-content', children: [
      {
        name: 'themes', path: '/wp-content/themes', children: [
          {
            name: 'custom-theme', path: '/wp-content/themes/custom-theme', children: [
              { name: 'style.css', path: '/wp-content/themes/custom-theme/style.css' },
              { name: 'functions.php', path: '/wp-content/themes/custom-theme/functions.php' },
              { name: 'index.php', path: '/wp-content/themes/custom-theme/index.php' },
              { name: 'header.php', path: '/wp-content/themes/custom-theme/header.php' },
              { name: 'footer.php', path: '/wp-content/themes/custom-theme/footer.php' },
            ],
          },
          { name: 'twentytwentyfour', path: '/wp-content/themes/twentytwentyfour' },
        ],
      },
      {
        name: 'plugins', path: '/wp-content/plugins', children: [
          { name: 'akismet', path: '/wp-content/plugins/akismet' },
          { name: 'woocommerce', path: '/wp-content/plugins/woocommerce' },
        ],
      },
    ],
  },
  { name: 'wp-admin', path: '/wp-admin' },
  { name: 'wp-includes', path: '/wp-includes' },
  { name: 'wp-config.php', path: '/wp-config.php' },
  { name: '.htaccess', path: '/.htaccess' },
  { name: 'robots.txt', path: '/robots.txt' },
  { name: 'index.php', path: '/index.php' },
]

const TEXT_EXTS = new Set(['php','js','ts','tsx','jsx','css','scss','html','htm','xml','json','txt','md','yaml','yml','env','sh','conf','ini','htaccess','sql'])

function isTextFile(fp: string) {
  const name = fp.split('/').pop() ?? ''
  if (name.startsWith('.') && !name.includes('.')) return true
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return TEXT_EXTS.has(ext)
}

// ── File icon (same ext-color logic as file browser) ─────────────────────────

function FileIcon({ path: fp, isDir }: { path: string; isDir?: boolean }) {
  if (isDir) return (
    <svg className="h-3.5 w-3.5 shrink-0 text-tundra-aurora" fill="currentColor" viewBox="0 0 20 20">
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
    </svg>
  )
  const ext = fp.split('.').pop()?.toLowerCase() ?? ''
  const color =
    ext === 'php'                                       ? 'text-purple-400' :
    ext === 'js' || ext === 'ts'                        ? 'text-yellow-400' :
    ext === 'tsx' || ext === 'jsx'                      ? 'text-cyan-400'   :
    ext === 'css' || ext === 'scss'                     ? 'text-blue-400'   :
    ext === 'html' || ext === 'htm'                     ? 'text-orange-400' :
    ext === 'json' || ext === 'yaml' || ext === 'yml'   ? 'text-green-400'  :
    'text-slate-400'
  return (
    <svg className={`h-3.5 w-3.5 shrink-0 ${color}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  )
}

// ── Explorer tree node ────────────────────────────────────────────────────────

function ExplorerNode({
  node, depth, openFiles, activeFile, expandedDirs, onToggleDir, onOpenFile,
}: {
  node: TreeNode; depth: number; openFiles: Set<string>; activeFile: string
  expandedDirs: Set<string>; onToggleDir: (p: string) => void; onOpenFile: (p: string) => Promise<void>
}) {
  const isDir = !!node.children
  const isExpanded = expandedDirs.has(node.path)
  const isActive = activeFile === node.path
  const isOpen = openFiles.has(node.path)

  return (
    <>
      <div
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        className={[
          'group flex cursor-pointer select-none items-center gap-1.5 py-0.5 pr-2',
          isActive ? 'bg-[#264f78] text-white' : 'text-[#cccccc] hover:bg-[#2a2d2e]',
        ].join(' ')}
        onClick={() => {
          if (isDir) onToggleDir(node.path)
          else if (isTextFile(node.path)) void onOpenFile(node.path)
          else toast.error('Binary file cannot be edited')
        }}
      >
        {isDir ? (
          <svg
            className="h-3 w-3 shrink-0 text-[#cccccc] transition-transform"
            style={{ transform: isExpanded ? 'rotate(90deg)' : undefined }}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <FileIcon path={node.path} isDir={isDir} />
        <span className="truncate text-[12px]">{node.name}</span>
        {isOpen && !isActive && (
          <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[#4d9375]" />
        )}
      </div>
      {isDir && isExpanded && node.children?.map((child) => (
        <ExplorerNode
          key={child.path}
          node={child}
          depth={depth + 1}
          openFiles={openFiles}
          activeFile={activeFile}
          expandedDirs={expandedDirs}
          onToggleDir={onToggleDir}
          onOpenFile={onOpenFile}
        />
      ))}
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

function FileEditor() {
  const { siteId } = Route.useParams()
  const { files: initialFiles, active: initialActive } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: site } = useQuery({
    queryKey: ['sites', siteId],
    queryFn: () => api<Site>(`/sites/${siteId}`),
  })

  // file contents (path → content)
  const [contents, setContents] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [activeFile, setActiveFile] = useState(initialActive || initialFiles[0] || '')
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['/wp-content', '/wp-content/themes', '/wp-content/themes/custom-theme']))
  const [showExplorer, setShowExplorer] = useState(true)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [fontSize, setFontSize] = useState(13)
  const [cursorInfo, setCursorInfo] = useState({ line: 1, col: 1 })
  const editorRef = useRef<HTMLDivElement>(null)

  const openFilePaths = Array.from(contents.keys())

  async function fetchFileContent(fp: string): Promise<string> {
    // Use react-query cache if available, otherwise fetch
    const cached = queryClient.getQueryData<{ content: string }>(['site-file-content', siteId, fp])
    if (cached) return cached.content
    const data = await queryClient.fetchQuery({
      queryKey: ['site-file-content', siteId, fp],
      queryFn: () => api<{ content: string }>(`/sites/${siteId}/files/content`, { query: { path: fp } }),
    })
    return data.content
  }

  async function openFile(fp: string) {
    if (!contents.has(fp)) {
      setLoading((s) => new Set(s).add(fp))
      try {
        const content = await fetchFileContent(fp)
        setContents((m) => new Map(m).set(fp, content))
      } catch {
        toast.error(`Failed to load ${fp.split('/').pop()}`)
        setLoading((s) => { const n = new Set(s); n.delete(fp); return n })
        return
      } finally {
        setLoading((s) => { const n = new Set(s); n.delete(fp); return n })
      }
    }
    setActiveFile(fp)
  }

  // Fetch initial files on mount
  useEffect(() => {
    for (const fp of initialFiles) {
      void openFile(fp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function closeFile(fp: string) {
    if (dirty.has(fp)) {
      if (!confirm(`Discard unsaved changes to ${fp.split('/').pop()}?`)) return
    }
    const newContents = new Map(contents)
    newContents.delete(fp)
    const newDirty = new Set(dirty)
    newDirty.delete(fp)
    setContents(newContents)
    setDirty(newDirty)
    if (activeFile === fp) {
      const remaining = Array.from(newContents.keys())
      setActiveFile(remaining[remaining.length - 1] ?? '')
    }
  }

  async function saveFile(fp: string) {
    const content = contents.get(fp)
    if (content === undefined) return
    setSaving((s) => new Set(s).add(fp))
    try {
      await api(`/sites/${siteId}/files/content`, { method: 'PUT', body: { path: fp, content } })
      // update the query cache too
      queryClient.setQueryData(['site-file-content', siteId, fp], { content })
      toast.success(`Saved ${fp.split('/').pop()}`)
      setDirty((d) => { const n = new Set(d); n.delete(fp); return n })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to save ${fp.split('/').pop()}`)
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete(fp); return n })
    }
  }

  async function saveAll() {
    for (const fp of dirty) {
      await saveFile(fp)
    }
  }

  const handleChange = useCallback((value: string) => {
    setContents((m) => new Map(m).set(activeFile, value))
    setDirty((d) => new Set(d).add(activeFile))
  }, [activeFile])

  function toggleDir(p: string) {
    setExpandedDirs((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n })
  }

  const activeContent = contents.get(activeFile) ?? ''
  const lang = getLang(activeFile)
  const langLabel = activeFile ? getLanguageLabel(activeFile) : ''
  const docRoot = site?.document_root ?? '/var/www/html'
  return (
    <div
      className="flex flex-col h-full"
      style={{ background: theme === 'dark' ? '#1e1e1e' : '#ffffff', color: theme === 'dark' ? '#d4d4d4' : '#1e1e1e' }}
    >
      {/* ── Header bar ── */}
      <div
        className="flex shrink-0 items-center justify-between gap-2 px-3 py-2"
        style={{ background: theme === 'dark' ? '#323233' : '#f3f3f3', borderBottom: `1px solid ${theme === 'dark' ? '#1e1e1e' : '#e5e7eb'}` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => { setShowExplorer(!showExplorer) }}
            title="Toggle explorer"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors hover:bg-white/10"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M3 7h18M3 12h12M3 17h8" strokeLinecap="round" />
            </svg>
          </button>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold" style={{ color: theme === 'dark' ? '#cccccc' : '#444' }}>
              {site?.primary_domain ?? siteId}
            </p>
            <p className="truncate text-[10px]" style={{ color: theme === 'dark' ? '#858585' : '#777' }}>
              {docRoot}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Save current */}
          {activeFile && (
            <button
              type="button"
              onClick={() => { void saveFile(activeFile) }}
              disabled={!dirty.has(activeFile) || saving.has(activeFile)}
              className="flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors"
              style={{
                background: dirty.has(activeFile) ? '#3b82f6' : theme === 'dark' ? '#2d2d2d' : '#e5e7eb',
                color: dirty.has(activeFile) ? '#fff' : theme === 'dark' ? '#858585' : '#999',
                cursor: dirty.has(activeFile) && !saving.has(activeFile) ? 'pointer' : 'default',
                opacity: saving.has(activeFile) ? 0.6 : 1,
              }}
            >
              {saving.has(activeFile) ? 'Saving…' : 'Save'}
            </button>
          )}
          {/* Save all */}
          {dirty.size > 0 && (
            <button
              type="button"
              onClick={() => { void saveAll() }}
              disabled={saving.size > 0}
              className="flex items-center gap-1 rounded bg-[#3b82f6] px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-[#2563eb] disabled:opacity-60"
            >
              {saving.size > 0 ? 'Saving…' : `Save all (${dirty.size})`}
            </button>
          )}

          {/* Font size */}
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={() => { setFontSize((n) => Math.max(10, n - 1)) }}
              className="flex h-6 w-6 items-center justify-center rounded text-xs transition-colors hover:bg-white/10">−</button>
            <span className="w-6 text-center text-[10px]" style={{ color: theme === 'dark' ? '#858585' : '#777' }}>{fontSize}</span>
            <button type="button" onClick={() => { setFontSize((n) => Math.min(22, n + 1)) }}
              className="flex h-6 w-6 items-center justify-center rounded text-xs transition-colors hover:bg-white/10">+</button>
          </div>

          {/* Theme toggle */}
          <button
            type="button"
            onClick={() => { setTheme(theme === 'dark' ? 'light' : 'dark') }}
            className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-white/10"
            title="Toggle theme"
          >
            {theme === 'dark' ? (
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            )}
          </button>

          {/* Back to file browser */}
          <a
            href={`/files/${siteId}?path=/`}
            className="flex h-7 items-center gap-1 rounded px-2 text-xs transition-colors hover:bg-white/10"
            style={{ color: theme === 'dark' ? '#858585' : '#777' }}
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            Files
          </a>
        </div>
      </div>

      {/* ── Body (explorer + tabs + editor) ── */}
      <div className="flex flex-1 min-h-0">
        {/* Explorer sidebar */}
        {showExplorer && (
          <div
            className="flex w-52 shrink-0 flex-col overflow-hidden"
            style={{ background: theme === 'dark' ? '#252526' : '#f8f8f8', borderRight: `1px solid ${theme === 'dark' ? '#1e1e1e' : '#e5e7eb'}` }}
          >
            <div
              className="px-3 py-1.5"
              style={{ borderBottom: `1px solid ${theme === 'dark' ? '#1e1e1e' : '#e5e7eb'}` }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: theme === 'dark' ? '#bbb' : '#666' }}>
                Explorer
              </p>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {/* Root node */}
              <div
                className="flex cursor-pointer items-center gap-1.5 px-2 py-0.5 text-[12px]"
                style={{ color: theme === 'dark' ? '#cccccc' : '#333' }}
                onClick={() => {
                  void navigate({ to: '/files/$siteId', params: { siteId }, search: { path: '/' } })
                }}
              >
                <svg className="h-3.5 w-3.5 shrink-0 text-tundra-aurora" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                <span className="font-medium">/ (document root)</span>
              </div>
              {DIR_TREE.map((node) => (
                <ExplorerNode
                  key={node.path}
                  node={node}
                  depth={0}
                  openFiles={new Set(openFilePaths)}
                  activeFile={activeFile}
                  expandedDirs={expandedDirs}
                  onToggleDir={toggleDir}
                  onOpenFile={openFile}
                />
              ))}
            </div>
          </div>
        )}

        {/* Editor area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* ── Tab bar ── */}
          <div
            className="flex shrink-0 items-end overflow-x-auto"
            style={{ background: theme === 'dark' ? '#252526' : '#f3f3f3', borderBottom: `1px solid ${theme === 'dark' ? '#1e1e1e' : '#e5e7eb'}` }}
          >
            {openFilePaths.length === 0 ? (
              <div className="px-4 py-2 text-xs" style={{ color: theme === 'dark' ? '#666' : '#999' }}>
                No files open — click a file in the explorer
              </div>
            ) : openFilePaths.map((fp) => {
              const name = fp.split('/').pop() ?? fp
              const isActive = fp === activeFile
              const isDirty = dirty.has(fp)
              return (
                <div
                  key={fp}
                  onClick={() => { setActiveFile(fp) }}
                  className="group flex shrink-0 cursor-pointer items-center gap-2 border-r px-4 py-2 text-xs"
                  style={{
                    background: isActive
                      ? theme === 'dark' ? '#1e1e1e' : '#ffffff'
                      : theme === 'dark' ? '#2d2d2d' : '#ececec',
                    color: isActive
                      ? theme === 'dark' ? '#ffffff' : '#1e1e1e'
                      : theme === 'dark' ? '#969696' : '#666',
                    borderColor: theme === 'dark' ? '#252526' : '#d1d5db',
                    borderTop: isActive ? `1px solid #3b82f6` : `1px solid transparent`,
                  }}
                >
                  <FileIcon path={fp} />
                  <span className={isDirty ? 'italic' : ''}>{name}</span>
                  {isDirty && <span className="text-[#e5c07b]">●</span>}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); closeFile(fp) }}
                    className="ml-0.5 flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/20"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}

            {/* Open file button */}
            <button
              type="button"
              title="Open file from file manager"
              onClick={() => {
                void navigate({ to: '/files/$siteId', params: { siteId }, search: { path: '/' } })
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center transition-colors"
              style={{ color: theme === 'dark' ? '#858585' : '#777' }}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M12 4v16m8-8H4" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* ── CodeMirror editor ── */}
          <div ref={editorRef} className="flex-1 min-h-0 overflow-hidden">
            {activeFile && loading.has(activeFile) ? (
              <div className="flex h-full items-center justify-center" style={{ background: theme === 'dark' ? '#1e1e1e' : '#fff' }}>
                <div className="text-center">
                  <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#3b82f6] border-t-transparent" />
                  <p className="text-sm" style={{ color: theme === 'dark' ? '#4d4d4d' : '#ccc' }}>Loading…</p>
                </div>
              </div>
            ) : activeFile && contents.has(activeFile) ? (
              <CodeMirror
                key={activeFile}
                value={activeContent}
                height="100%"
                extensions={lang}
                theme={theme === 'dark' ? oneDark : undefined}
                onChange={handleChange}
                onStatistics={(data) => {
                  setCursorInfo({ line: data.line.number, col: data.line.from })
                }}
                style={{ fontSize: `${fontSize}px`, height: '100%' }}
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLineGutter: true,
                  highlightSpecialChars: true,
                  history: true,
                  foldGutter: true,
                  drawSelection: true,
                  dropCursor: true,
                  allowMultipleSelections: true,
                  indentOnInput: true,
                  syntaxHighlighting: true,
                  bracketMatching: true,
                  closeBrackets: true,
                  autocompletion: true,
                  rectangularSelection: true,
                  crosshairCursor: false,
                  highlightActiveLine: true,
                  highlightSelectionMatches: true,
                  closeBracketsKeymap: true,
                  defaultKeymap: true,
                  searchKeymap: true,
                  historyKeymap: true,
                  foldKeymap: true,
                  completionKeymap: true,
                  lintKeymap: true,
                }}
              />
            ) : (
              <div
                className="flex h-full items-center justify-center"
                style={{ background: theme === 'dark' ? '#1e1e1e' : '#fff' }}
              >
                <div className="text-center">
                  <svg className="mx-auto mb-3 h-12 w-12 opacity-20" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                    <path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm" style={{ color: theme === 'dark' ? '#4d4d4d' : '#ccc' }}>
                    Open a file from the explorer
                  </p>
                  <p className="mt-1 text-xs" style={{ color: theme === 'dark' ? '#3d3d3d' : '#ddd' }}>
                    Click a file in the left panel or use Ctrl+P
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Status bar ── */}
          <div
            className="flex shrink-0 items-center justify-between px-3 py-1 text-[11px]"
            style={{
              background: theme === 'dark' ? '#007acc' : '#3b82f6',
              color: '#fff',
            }}
          >
            <div className="flex items-center gap-4">
              {activeFile && (
                <>
                  <span>{langLabel}</span>
                  <span>Ln {cursorInfo.line}, Col {cursorInfo.col}</span>
                </>
              )}
              {dirty.size > 0 && (
                <span className="opacity-80">● {dirty.size} unsaved</span>
              )}
            </div>
            <div className="flex items-center gap-4">
              {activeFile && (
                <span className="opacity-70 font-mono truncate max-w-xs">{docRoot}{activeFile}</span>
              )}
              <span className="opacity-70">UTF-8</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
