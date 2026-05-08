import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Site } from '@/lib/api-types'
import { Dialog } from '@/components/ui/dialog'
import { fmtBytes, fmtDate, fmtRelative } from '@/lib/utils'
import {
  FolderIcon as FolderIconBase,
  FolderOpenIcon,
  ChevronRightIcon,
  CloseIcon,
  UploadIcon,
  ListIcon,
  LayoutGridIcon,
  SearchIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  GlobeIcon,
  PencilIcon,
  TypeIcon,
  DownloadIcon,
  TrashIcon,
  CopyIcon,
  LockIcon,
  ExternalLinkIcon,
} from '@/components/icons'
import {
  PhpFileIcon, JsFileIcon, TsFileIcon, HtmlFileIcon, CssFileIcon, SassFileIcon, LessFileIcon,
  JsonFileIcon, YamlFileIcon, MarkdownFileIcon, XmlFileIcon, TomlFileIcon, SqliteFileIcon,
  BashFileIcon, PythonFileIcon, RubyFileIcon, GoFileIcon, RustFileIcon, VueFileIcon,
  ReactFileIcon, SvgFileIcon, DotnetFileIcon, KotlinFileIcon, SwiftFileIcon, CFileIcon,
  CppFileIcon, GitFileIcon, DockerFileIcon, EnvFileIcon, WasmFileIcon, NpmFileIcon,
  YarnFileIcon, NginxFileIcon, ApacheFileIcon, TailwindFileIcon, ViteFileIcon, WebpackFileIcon,
  MysqlFileIcon, PostgresFileIcon, CoffeeFileIcon,
  FileImageIcon, FileVideoIcon, FileAudioIcon, FileZipIcon, FilePdfIcon, FileFontIcon,
  FileCodeIcon2, FileBinaryIcon, FileTextIcon2, FileLockIcon,
} from '@/components/icons'

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

type Modal =
  | { type: 'newFile' }
  | { type: 'newFolder' }
  | { type: 'rename'; name: string }
  | { type: 'delete'; names: string[] }
  | { type: 'chmod'; name: string; perms: string }
  | { type: 'upload' }
  | { type: 'copy'; names: string[] }
  | { type: 'move'; names: string[] }

type SortKey = 'name' | 'size' | 'modified' | 'type'
type ViewMode = 'list' | 'grid'

type ContextMenuState = { x: number; y: number; entry: FileEntry } | null

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

function filePath(dirPath: string, name: string) {
  return dirPath === '/' ? `/${name}` : `${dirPath}/${name}`
}

// ── File type icons ───────────────────────────────────────────────────────────

type FTCfg = { bg: string; cls: string; Icon: React.ComponentType<{ size?: number; className?: string }> }

// Extension → official brand icon + background
const EXT_MAP: Record<string, FTCfg> = {
  php:   { bg: 'bg-purple-100', cls: 'text-purple-600', Icon: PhpFileIcon },
  js:    { bg: 'bg-yellow-100', cls: 'text-yellow-600', Icon: JsFileIcon },
  mjs:   { bg: 'bg-yellow-100', cls: 'text-yellow-600', Icon: JsFileIcon },
  cjs:   { bg: 'bg-yellow-100', cls: 'text-yellow-600', Icon: JsFileIcon },
  jsx:   { bg: 'bg-cyan-100',   cls: 'text-cyan-600',   Icon: ReactFileIcon },
  ts:    { bg: 'bg-blue-100',   cls: 'text-blue-600',   Icon: TsFileIcon },
  tsx:   { bg: 'bg-blue-100',   cls: 'text-blue-600',   Icon: TsFileIcon },
  html:  { bg: 'bg-orange-100', cls: 'text-orange-600', Icon: HtmlFileIcon },
  htm:   { bg: 'bg-orange-100', cls: 'text-orange-600', Icon: HtmlFileIcon },
  css:   { bg: 'bg-sky-100',    cls: 'text-sky-600',    Icon: CssFileIcon },
  scss:  { bg: 'bg-pink-100',   cls: 'text-pink-600',   Icon: SassFileIcon },
  sass:  { bg: 'bg-pink-100',   cls: 'text-pink-600',   Icon: SassFileIcon },
  less:  { bg: 'bg-indigo-100', cls: 'text-indigo-600', Icon: LessFileIcon },
  json:  { bg: 'bg-green-100',  cls: 'text-green-700',  Icon: JsonFileIcon },
  yaml:  { bg: 'bg-red-100',    cls: 'text-red-600',    Icon: YamlFileIcon },
  yml:   { bg: 'bg-red-100',    cls: 'text-red-600',    Icon: YamlFileIcon },
  toml:  { bg: 'bg-amber-100',  cls: 'text-amber-700',  Icon: TomlFileIcon },
  xml:   { bg: 'bg-rose-100',   cls: 'text-rose-600',   Icon: XmlFileIcon },
  svg:   { bg: 'bg-rose-100',   cls: 'text-rose-600',   Icon: SvgFileIcon },
  md:    { bg: 'bg-slate-100',  cls: 'text-slate-600',  Icon: MarkdownFileIcon },
  mdx:   { bg: 'bg-slate-100',  cls: 'text-slate-600',  Icon: MarkdownFileIcon },
  txt:   { bg: 'bg-slate-100',  cls: 'text-slate-500',  Icon: FileTextIcon2 },
  sql:   { bg: 'bg-amber-100',  cls: 'text-amber-700',  Icon: SqliteFileIcon },
  sh:    { bg: 'bg-lime-100',   cls: 'text-lime-700',   Icon: BashFileIcon },
  bash:  { bg: 'bg-lime-100',   cls: 'text-lime-700',   Icon: BashFileIcon },
  zsh:   { bg: 'bg-lime-100',   cls: 'text-lime-700',   Icon: BashFileIcon },
  fish:  { bg: 'bg-lime-100',   cls: 'text-lime-700',   Icon: BashFileIcon },
  py:    { bg: 'bg-blue-100',   cls: 'text-blue-700',   Icon: PythonFileIcon },
  pyw:   { bg: 'bg-blue-100',   cls: 'text-blue-700',   Icon: PythonFileIcon },
  rb:    { bg: 'bg-red-100',    cls: 'text-red-600',    Icon: RubyFileIcon },
  go:    { bg: 'bg-cyan-100',   cls: 'text-cyan-600',   Icon: GoFileIcon },
  rs:    { bg: 'bg-orange-100', cls: 'text-orange-700', Icon: RustFileIcon },
  cs:    { bg: 'bg-purple-100', cls: 'text-purple-700', Icon: DotnetFileIcon },
  vb:    { bg: 'bg-purple-100', cls: 'text-purple-700', Icon: DotnetFileIcon },
  vue:   { bg: 'bg-green-100',  cls: 'text-green-600',  Icon: VueFileIcon },
  kt:    { bg: 'bg-violet-100', cls: 'text-violet-600', Icon: KotlinFileIcon },
  kts:   { bg: 'bg-violet-100', cls: 'text-violet-600', Icon: KotlinFileIcon },
  swift: { bg: 'bg-orange-100', cls: 'text-orange-600', Icon: SwiftFileIcon },
  cpp:   { bg: 'bg-blue-100',   cls: 'text-blue-700',   Icon: CppFileIcon },
  cc:    { bg: 'bg-blue-100',   cls: 'text-blue-700',   Icon: CppFileIcon },
  cxx:   { bg: 'bg-blue-100',   cls: 'text-blue-700',   Icon: CppFileIcon },
  hpp:   { bg: 'bg-blue-100',   cls: 'text-blue-700',   Icon: CppFileIcon },
  c:     { bg: 'bg-blue-100',   cls: 'text-blue-700',   Icon: CFileIcon },
  h:     { bg: 'bg-blue-100',   cls: 'text-blue-700',   Icon: CFileIcon },
  wasm:  { bg: 'bg-violet-100', cls: 'text-violet-600', Icon: WasmFileIcon },
  coffee:{ bg: 'bg-amber-100',  cls: 'text-amber-700',  Icon: CoffeeFileIcon },
  env:   { bg: 'bg-yellow-100', cls: 'text-yellow-700', Icon: EnvFileIcon },
  ini:   { bg: 'bg-stone-100',  cls: 'text-stone-600',  Icon: FileCodeIcon2 },
  conf:  { bg: 'bg-stone-100',  cls: 'text-stone-600',  Icon: FileCodeIcon2 },
  cfg:   { bg: 'bg-stone-100',  cls: 'text-stone-600',  Icon: FileCodeIcon2 },
  jpg:   { bg: 'bg-violet-100', cls: 'text-violet-600', Icon: FileImageIcon },
  jpeg:  { bg: 'bg-violet-100', cls: 'text-violet-600', Icon: FileImageIcon },
  png:   { bg: 'bg-violet-100', cls: 'text-violet-600', Icon: FileImageIcon },
  gif:   { bg: 'bg-violet-100', cls: 'text-violet-600', Icon: FileImageIcon },
  webp:  { bg: 'bg-violet-100', cls: 'text-violet-600', Icon: FileImageIcon },
  ico:   { bg: 'bg-violet-100', cls: 'text-violet-600', Icon: FileImageIcon },
  bmp:   { bg: 'bg-violet-100', cls: 'text-violet-600', Icon: FileImageIcon },
  tiff:  { bg: 'bg-violet-100', cls: 'text-violet-600', Icon: FileImageIcon },
  tif:   { bg: 'bg-violet-100', cls: 'text-violet-600', Icon: FileImageIcon },
  avif:  { bg: 'bg-violet-100', cls: 'text-violet-600', Icon: FileImageIcon },
  mp4:   { bg: 'bg-blue-100',   cls: 'text-blue-600',   Icon: FileVideoIcon },
  mov:   { bg: 'bg-blue-100',   cls: 'text-blue-600',   Icon: FileVideoIcon },
  avi:   { bg: 'bg-blue-100',   cls: 'text-blue-600',   Icon: FileVideoIcon },
  mkv:   { bg: 'bg-blue-100',   cls: 'text-blue-600',   Icon: FileVideoIcon },
  webm:  { bg: 'bg-blue-100',   cls: 'text-blue-600',   Icon: FileVideoIcon },
  flv:   { bg: 'bg-blue-100',   cls: 'text-blue-600',   Icon: FileVideoIcon },
  mp3:   { bg: 'bg-pink-100',   cls: 'text-pink-600',   Icon: FileAudioIcon },
  wav:   { bg: 'bg-pink-100',   cls: 'text-pink-600',   Icon: FileAudioIcon },
  flac:  { bg: 'bg-pink-100',   cls: 'text-pink-600',   Icon: FileAudioIcon },
  aac:   { bg: 'bg-pink-100',   cls: 'text-pink-600',   Icon: FileAudioIcon },
  ogg:   { bg: 'bg-pink-100',   cls: 'text-pink-600',   Icon: FileAudioIcon },
  m4a:   { bg: 'bg-pink-100',   cls: 'text-pink-600',   Icon: FileAudioIcon },
  zip:   { bg: 'bg-stone-100',  cls: 'text-stone-600',  Icon: FileZipIcon },
  tar:   { bg: 'bg-stone-100',  cls: 'text-stone-600',  Icon: FileZipIcon },
  gz:    { bg: 'bg-stone-100',  cls: 'text-stone-600',  Icon: FileZipIcon },
  bz2:   { bg: 'bg-stone-100',  cls: 'text-stone-600',  Icon: FileZipIcon },
  rar:   { bg: 'bg-stone-100',  cls: 'text-stone-600',  Icon: FileZipIcon },
  '7z':  { bg: 'bg-stone-100',  cls: 'text-stone-600',  Icon: FileZipIcon },
  xz:    { bg: 'bg-stone-100',  cls: 'text-stone-600',  Icon: FileZipIcon },
  pdf:   { bg: 'bg-red-100',    cls: 'text-red-600',    Icon: FilePdfIcon },
  ttf:   { bg: 'bg-indigo-100', cls: 'text-indigo-600', Icon: FileFontIcon },
  woff:  { bg: 'bg-indigo-100', cls: 'text-indigo-600', Icon: FileFontIcon },
  woff2: { bg: 'bg-indigo-100', cls: 'text-indigo-600', Icon: FileFontIcon },
  otf:   { bg: 'bg-indigo-100', cls: 'text-indigo-600', Icon: FileFontIcon },
  eot:   { bg: 'bg-indigo-100', cls: 'text-indigo-600', Icon: FileFontIcon },
  exe:   { bg: 'bg-gray-100',   cls: 'text-gray-600',   Icon: FileBinaryIcon },
  dll:   { bg: 'bg-gray-100',   cls: 'text-gray-600',   Icon: FileBinaryIcon },
  so:    { bg: 'bg-gray-100',   cls: 'text-gray-600',   Icon: FileBinaryIcon },
  bin:   { bg: 'bg-gray-100',   cls: 'text-gray-600',   Icon: FileBinaryIcon },
  lock:  { bg: 'bg-gray-100',   cls: 'text-gray-500',   Icon: FileLockIcon },
}

// Exact filename overrides (checked before extension)
const NAME_MAP: Record<string, FTCfg> = {
  'dockerfile':          { bg: 'bg-blue-100',   cls: 'text-blue-600',   Icon: DockerFileIcon },
  'docker-compose.yml':  { bg: 'bg-blue-100',   cls: 'text-blue-600',   Icon: DockerFileIcon },
  'docker-compose.yaml': { bg: 'bg-blue-100',   cls: 'text-blue-600',   Icon: DockerFileIcon },
  '.gitignore':          { bg: 'bg-orange-100', cls: 'text-orange-600', Icon: GitFileIcon },
  '.gitattributes':      { bg: 'bg-orange-100', cls: 'text-orange-600', Icon: GitFileIcon },
  '.gitmodules':         { bg: 'bg-orange-100', cls: 'text-orange-600', Icon: GitFileIcon },
  'package.json':        { bg: 'bg-red-100',    cls: 'text-red-600',    Icon: NpmFileIcon },
  'package-lock.json':   { bg: 'bg-red-100',    cls: 'text-red-600',    Icon: NpmFileIcon },
  'yarn.lock':           { bg: 'bg-blue-100',   cls: 'text-blue-600',   Icon: YarnFileIcon },
  '.htaccess':           { bg: 'bg-red-100',    cls: 'text-red-600',    Icon: ApacheFileIcon },
  'nginx.conf':          { bg: 'bg-green-100',  cls: 'text-green-700',  Icon: NginxFileIcon },
  'vite.config.ts':      { bg: 'bg-purple-100', cls: 'text-purple-600', Icon: ViteFileIcon },
  'vite.config.js':      { bg: 'bg-purple-100', cls: 'text-purple-600', Icon: ViteFileIcon },
  'webpack.config.js':   { bg: 'bg-cyan-100',   cls: 'text-cyan-600',   Icon: WebpackFileIcon },
  'webpack.config.ts':   { bg: 'bg-cyan-100',   cls: 'text-cyan-600',   Icon: WebpackFileIcon },
  'tailwind.config.js':  { bg: 'bg-teal-100',   cls: 'text-teal-600',   Icon: TailwindFileIcon },
  'tailwind.config.ts':  { bg: 'bg-teal-100',   cls: 'text-teal-600',   Icon: TailwindFileIcon },
  'tsconfig.json':       { bg: 'bg-blue-100',   cls: 'text-blue-600',   Icon: TsFileIcon },
  'my.cnf':              { bg: 'bg-orange-100', cls: 'text-orange-700', Icon: MysqlFileIcon },
  'pg_hba.conf':         { bg: 'bg-blue-100',   cls: 'text-blue-700',   Icon: PostgresFileIcon },
}

function FileIcon({ type, name, large = false }: { type: string; name: string; large?: boolean }) {
  const dim   = large ? 40 : 32
  const iSize = large ? 20 : 16

  if (type === 'dir') return (
    <div style={{ width: dim, height: dim }} className="flex items-center justify-center rounded-lg bg-tundra-aurora/15">
      <FolderIconBase style={{ width: iSize + 2, height: iSize + 2 }} className="text-tundra-aurora" />
    </div>
  )

  // Exact filename check first, then extension lookup
  const nameLower = name.toLowerCase()
  const ext = nameLower.startsWith('.') && !nameLower.slice(1).includes('.')
    ? nameLower.slice(1)
    : nameLower.split('.').pop() ?? ''

  const cfg: FTCfg | undefined = NAME_MAP[nameLower] ?? EXT_MAP[ext]

  if (!cfg) return (
    <div style={{ width: dim, height: dim }} className="flex items-center justify-center rounded-lg bg-tundra-ink-100">
      <FileCodeIcon2 size={iSize} className="text-tundra-ink-400" />
    </div>
  )

  return (
    <div style={{ width: dim, height: dim }} className={`flex items-center justify-center rounded-lg ${cfg.bg}`}>
      <cfg.Icon size={iSize} className={cfg.cls} />
    </div>
  )
}

// ── Context menu ──────────────────────────────────────────────────────────────

type CtxItem =
  | { kind: 'action'; label: string; icon: React.ReactNode; danger?: boolean; onClick: () => void }
  | { kind: 'sep' }

function ContextMenu({ x, y, items, onClose }: {
  x: number; y: number; items: CtxItem[]; onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Flip near screen edges once mounted
  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    let left = x, top = y
    if (x + width  > window.innerWidth  - 8) left = x - width
    if (y + height > window.innerHeight - 8) top  = y - height
    el.style.left = `${Math.max(8, left)}px`
    el.style.top  = `${Math.max(8, top)}px`
  }, [x, y])

  // Close on outside click or Escape
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={menuRef}
      style={{ position: 'fixed', left: x, top: y, zIndex: 9999 }}
      className="min-w-[180px] overflow-hidden rounded-xl border border-tundra-ink-200 bg-white py-1 shadow-xl ring-1 ring-black/5"
    >
      {items.map((item, i) =>
        item.kind === 'sep'
          ? <div key={i} className="my-1 h-px bg-tundra-ink-100" />
          : (
            <button
              key={i}
              type="button"
              onClick={() => { item.onClick(); onClose() }}
              className={[
                'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs font-medium transition-colors',
                item.danger
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-tundra-ink-700 hover:bg-tundra-ink-50',
              ].join(' ')}
            >
              <span className={`shrink-0 ${item.danger ? 'text-red-500' : 'text-tundra-ink-400'}`}>
                {item.icon}
              </span>
              {item.label}
            </button>
          )
      )}
    </div>,
    document.body,
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

type DirCache = Record<string, FileEntry[]>

function TreeNodeRow({ name, nodePath, depth, currentPath, expanded, dirCache, onToggle, onNavigate }: {
  name: string; nodePath: string; depth: number; currentPath: string
  expanded: Set<string>; dirCache: DirCache
  onToggle: (p: string) => void; onNavigate: (p: string) => void
}) {
  const isExpanded = expanded.has(nodePath)
  const isActive   = currentPath === nodePath
  const cachedKids = dirCache[nodePath]
  const hasKids    = cachedKids === undefined || cachedKids.length > 0

  return (
    <>
      <div
        style={{ paddingLeft: `${10 + depth * 14}px` }}
        onClick={() => { onNavigate(nodePath); if (!isExpanded) onToggle(nodePath) }}
        className={[
          'group flex cursor-pointer select-none items-center gap-1.5 rounded-md mx-1 pr-2 py-1 transition-colors',
          isActive ? 'bg-tundra-lichen/10 text-tundra-lichen-700' : 'text-tundra-ink-600 hover:bg-tundra-ink-100 hover:text-tundra-ink',
        ].join(' ')}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(nodePath) }}
          className={`h-4 w-4 shrink-0 flex items-center justify-center rounded transition-transform ${!hasKids ? 'invisible' : ''}`}
          style={{ transform: isExpanded ? 'rotate(90deg)' : undefined }}
        >
          <ChevronRightIcon className="h-2.5 w-2.5" />
        </button>
        <FolderIconBase className="h-3.5 w-3.5 shrink-0 text-tundra-aurora" />
        <span className="truncate text-xs">{name}</span>
      </div>
      {isExpanded && cachedKids && cachedKids.map((child) => {
        const childPath = nodePath === '/' ? `/${child.name}` : `${nodePath}/${child.name}`
        return (
          <TreeNodeRow key={childPath} name={child.name} nodePath={childPath} depth={depth + 1}
            currentPath={currentPath} expanded={expanded} dirCache={dirCache}
            onToggle={onToggle} onNavigate={onNavigate} />
        )
      })}
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
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </Dialog>
  )
}

// ── Chmod modal ───────────────────────────────────────────────────────────────

function ChmodModal({ name, perms, filePath: fp, onApply, isPending, onClose }: {
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
        <button type="button" disabled={isPending} onClick={() => { onApply(fp, octal) }}
          className="rounded-xl bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
          {isPending ? 'Applying…' : 'Apply'}
        </button>
      </div>
    </ModalShell>
  )
}

// ── Upload modal ──────────────────────────────────────────────────────────────

function UploadModal({ path, siteId, onClose, onSuccess }: {
  path: string; siteId: string; onClose: () => void; onSuccess?: () => void
}) {
  const [dragging, setDragging]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState<string[]>([])

  async function uploadFiles(fileList: FileList) {
    setUploading(true)
    const files = Array.from(fileList)
    const msgs: string[] = []
    for (const file of files) {
      const form = new FormData()
      form.append('path', path)
      form.append('file', file, file.name)
      try {
        const res = await fetch(`/api/v1/sites/${siteId}/files/upload`, {
          method: 'POST',
          body: form,
          credentials: 'include',
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
          msgs.push(`✗ ${file.name}: ${err?.error?.message ?? res.statusText}`)
        } else {
          msgs.push(`✓ ${file.name}`)
        }
      } catch (e) {
        msgs.push(`✗ ${file.name}: network error`)
      }
    }
    setProgress(msgs)
    setUploading(false)
    const succeeded = msgs.filter((m) => m.startsWith('✓')).length
    if (succeeded > 0) {
      toast.success(`Uploaded ${succeeded} file${succeeded !== 1 ? 's' : ''}`)
      onSuccess?.()
    }
    if (msgs.every((m) => m.startsWith('✓'))) onClose()
  }

  return (
    <ModalShell title="Upload files" onClose={onClose}>
      {progress.length > 0 ? (
        <div className="mb-4 space-y-1 rounded-xl border border-tundra-ink-100 p-3 max-h-48 overflow-y-auto">
          {progress.map((m, i) => (
            <p key={i} className={`text-xs font-mono ${m.startsWith('✓') ? 'text-tundra-lichen-700' : 'text-red-600'}`}>{m}</p>
          ))}
        </div>
      ) : (
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
            {uploading
              ? <div className="h-7 w-7 animate-spin rounded-full border-2 border-tundra-lichen border-t-transparent" />
              : <UploadIcon className="h-7 w-7 text-tundra-ink-400" />
            }
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-tundra-ink">{uploading ? 'Uploading…' : 'Drop files here'}</p>
            <p className="mt-0.5 text-xs text-tundra-ink-400">or click to browse</p>
          </div>
          {!uploading && (
            <label className="cursor-pointer rounded-xl border border-tundra-ink-200 bg-white px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors shadow-sm">
              Browse files
              <input type="file" multiple className="sr-only" onChange={(e) => {
                if (e.target.files?.length) void uploadFiles(e.target.files)
              }} />
            </label>
          )}
        </div>
      )}
      <p className="text-center text-xs text-tundra-ink-400">
        Destination: <code className="font-mono text-tundra-ink-600">{path}</code>
      </p>
      {progress.length > 0 && (
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose}
            className="rounded-xl bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
            Done
          </button>
        </div>
      )}
    </ModalShell>
  )
}

// ── Copy/Move modal ───────────────────────────────────────────────────────────

function CopyMoveModal({ mode, names, currentPath, onDone, isPending, onClose }: {
  mode: 'copy' | 'move'; names: string[]; currentPath: string
  onDone: (dest: string) => void; isPending: boolean; onClose: () => void
}) {
  const [dest, setDest] = useState(currentPath === '/' ? '/' : currentPath)
  const label = mode === 'copy' ? 'Copy' : 'Move'
  const hint  = names.length === 1 ? names[0] : `${names.length} items`

  return (
    <ModalShell title={`${label} — ${hint}`} onClose={onClose}>
      <p className="mb-3 text-xs text-tundra-ink-400">
        {label} to destination path (absolute, within document root):
      </p>
      <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Destination directory</label>
      <input
        autoFocus type="text" value={dest}
        onChange={(e) => { setDest(e.target.value) }}
        onKeyDown={(e) => { if (e.key === 'Enter' && dest) onDone(dest) }}
        placeholder="/wp-content/uploads"
        className="mb-4 w-full rounded-xl border border-tundra-ink-200 px-3 py-2.5 font-mono text-sm focus:border-tundra-lichen focus:outline-none"
      />
      {names.length > 1 && (
        <ul className="mb-4 max-h-28 overflow-y-auto rounded-xl border border-tundra-ink-100 p-2 text-xs font-mono text-tundra-ink-500">
          {names.map((n) => <li key={n} className="py-0.5">{n}</li>)}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose}
          className="rounded-xl border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">Cancel</button>
        <button type="button" disabled={!dest || isPending} onClick={() => { if (dest) onDone(dest) }}
          className="rounded-xl bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
          {isPending ? `${label}ing…` : label}
        </button>
      </div>
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
  const [treeExpanded, setTreeExpanded] = useState<Set<string>>(new Set(['/']))
  const [dirCache,     setDirCache]     = useState<DirCache>({})
  const [selected,     setSelected]     = useState<Set<string>>(new Set())
  const [filterText,   setFilterText]   = useState('')
  const [modal,        setModal]        = useState<Modal | null>(null)
  const [newName,      setNewName]      = useState('')
  const [viewMode,     setViewMode]     = useState<ViewMode>('list')
  const [sortKey,      setSortKey]      = useState<SortKey>('name')
  const [sortDir,      setSortDir]      = useState<'asc' | 'desc'>('asc')
  const [contextMenu,  setContextMenu]  = useState<ContextMenuState>(null)

  const invalidateDir = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['site-files', siteId, path] })
    void fetchTreeDirs(path)
  }, [queryClient, siteId, path]) // eslint-disable-line react-hooks/exhaustive-deps

  const touchMutation = useMutation({
    mutationFn: (name: string) => api(`/sites/${siteId}/files/touch`, {
      method: 'POST',
      body: { path: filePath(path, name) },
    }),
    onSuccess: (_data, name) => { toast.success(`Created ${name}`); void invalidateDir(); setModal(null) },
    onError: (e) => { toast.error(e instanceof Error ? e.message : 'Failed to create file') },
  })

  const mkdirMutation = useMutation({
    mutationFn: (name: string) => api(`/sites/${siteId}/files/mkdir`, {
      method: 'POST',
      body: { path: filePath(path, name) },
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
        query: { path: filePath(path, name) },
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
    mutationFn: ({ filePath: fp, mode }: { filePath: string; mode: string }) => api(`/sites/${siteId}/files/chmod`, {
      method: 'POST',
      body: { path: fp, mode },
    }),
    onSuccess: () => { void invalidateDir(); setModal(null) },
    onError: (e) => { toast.error(e instanceof Error ? e.message : 'Failed to change permissions') },
  })

  const copyMutation = useMutation({
    mutationFn: ({ names, dest }: { names: string[]; dest: string }) =>
      Promise.all(names.map((name) => {
        const destName = `${dest.replace(/\/$/, '')}/${name}`
        return api(`/sites/${siteId}/files/copy`, {
          method: 'POST',
          body: { from: filePath(path, name), to: destName },
        })
      })),
    onSuccess: (_d, { names }) => {
      toast.success(`Copied ${names.length} item(s)`)
      void invalidateDir()
      setSelected(new Set())
      setModal(null)
    },
    onError: (e) => { toast.error(e instanceof Error ? e.message : 'Failed to copy') },
  })

  const moveMutation = useMutation({
    mutationFn: ({ names, dest }: { names: string[]; dest: string }) =>
      Promise.all(names.map((name) => {
        const destName = `${dest.replace(/\/$/, '')}/${name}`
        return api(`/sites/${siteId}/files/rename`, {
          method: 'POST',
          body: { from: filePath(path, name), to: destName },
        })
      })),
    onSuccess: (_d, { names }) => {
      toast.success(`Moved ${names.length} item(s)`)
      void invalidateDir()
      setSelected(new Set())
      setModal(null)
    },
    onError: (e) => { toast.error(e instanceof Error ? e.message : 'Failed to move') },
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

  const fetchTreeDirs = useCallback(async (p: string) => {
    try {
      const res = await api<{ data: FileEntry[] }>(`/sites/${siteId}/files`, { query: { path: p } })
      const dirs = (res.data ?? []).filter((f) => f.type === 'dir').sort((a, b) => a.name.localeCompare(b.name))
      setDirCache((c) => ({ ...c, [p]: dirs }))
    } catch {
      setDirCache((c) => ({ ...c, [p]: [] }))
    }
  }, [siteId])

  // Initial fetch: root directories
  useEffect(() => {
    if (!dirCache['/']) void fetchTreeDirs('/')
  }, [dirCache, fetchTreeDirs])

  // Auto-expand all parent dirs of the current path so tree reveals the location
  useEffect(() => {
    if (path === '/') return
    const parts = path.split('/').filter(Boolean)
    let acc = ''
    const toFetch: string[] = ['/']
    for (let i = 0; i < parts.length - 1; i++) {
      acc += '/' + parts[i]
      toFetch.push(acc)
    }
    setTreeExpanded((s) => {
      const n = new Set(s)
      toFetch.forEach((p) => n.add(p))
      return n
    })
    toFetch.forEach((p) => { if (!dirCache[p]) void fetchTreeDirs(p) })
  }, [path, dirCache, fetchTreeDirs])

  function toggleTree(p: string) {
    setTreeExpanded((s) => {
      const n = new Set(s)
      if (n.has(p)) {
        n.delete(p)
      } else {
        n.add(p)
        if (!dirCache[p]) void fetchTreeDirs(p)
      }
      return n
    })
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
    const fp = filePath(path, name)
    window.open(`/editor/${siteId}?active=${encodeURIComponent(fp)}&files=${encodeURIComponent(fp)}`, '_blank')
  }

  function enterDir(name: string) {
    goToPath(filePath(path, name))
  }

  function buildContextItems(entry: FileEntry): CtxItem[] {
    const isDir   = entry.type === 'dir'
    const canEdit = entry.type === 'file' && isTextFile(entry.name)
    const items: CtxItem[] = []

    if (isDir) {
      items.push({ kind: 'action', label: 'Open', icon: <FolderOpenIcon className="h-3.5 w-3.5" />, onClick: () => { enterDir(entry.name) } })
      items.push({ kind: 'sep' })
    } else if (canEdit) {
      items.push({ kind: 'action', label: 'Edit', icon: <PencilIcon className="h-3.5 w-3.5" />, onClick: () => { openEdit(entry.name) } })
      items.push({ kind: 'action', label: 'Open in new tab', icon: <ExternalLinkIcon className="h-3.5 w-3.5" />, onClick: () => { openEdit(entry.name) } })
      items.push({ kind: 'sep' })
    }

    items.push({ kind: 'action', label: 'Rename', icon: <TypeIcon className="h-3.5 w-3.5" />, onClick: () => { setNewName(entry.name); setModal({ type: 'rename', name: entry.name }) } })
    items.push({ kind: 'action', label: 'Copy to…', icon: <CopyIcon className="h-3.5 w-3.5" />, onClick: () => { setModal({ type: 'copy', names: [entry.name] }) } })
    items.push({ kind: 'action', label: 'Move to…', icon: <ArrowRightIcon className="h-3.5 w-3.5" />, onClick: () => { setModal({ type: 'move', names: [entry.name] }) } })
    items.push({ kind: 'sep' })
    items.push({ kind: 'action', label: isDir ? 'Download as Zip' : 'Download', icon: <DownloadIcon className="h-3.5 w-3.5" />, onClick: () => { downloadEntry(entry.name) } })
    items.push({ kind: 'sep' })
    items.push({ kind: 'action', label: 'Permissions…', icon: <LockIcon className="h-3.5 w-3.5" />, onClick: () => { setModal({ type: 'chmod', name: entry.name, perms: entry.perms }) } })
    items.push({ kind: 'sep' })
    items.push({ kind: 'action', label: 'Delete', icon: <TrashIcon className="h-3.5 w-3.5" />, danger: true, onClick: () => { setModal({ type: 'delete', names: [entry.name] }) } })

    return items
  }

  function openContextMenu(e: React.MouseEvent, entry: FileEntry) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, entry })
  }

  function downloadEntry(name: string) {
    const fp = filePath(path, name)
    const url = `/api/v1/sites/${siteId}/files/download?path=${encodeURIComponent(fp)}`
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  function downloadBulk() {
    for (const name of selected) downloadEntry(name)
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
              <FolderIconBase className="h-3.5 w-3.5 shrink-0 text-tundra-aurora" />
              <span className="text-xs font-medium">/ root</span>
            </div>
            {(dirCache['/'] ?? []).map((d) => (
              <TreeNodeRow key={`/${d.name}`} name={d.name} nodePath={`/${d.name}`} depth={0}
                currentPath={path} expanded={treeExpanded} dirCache={dirCache}
                onToggle={toggleTree} onNavigate={goToPath} />
            ))}
            {!dirCache['/'] && (
              <div className="mx-2 mt-2 space-y-1">
                {[1,2,3,4].map((i) => (
                  <div key={i} className="h-5 animate-pulse rounded bg-tundra-ink-100" />
                ))}
              </div>
            )}
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
            <ListIcon className="h-3.5 w-3.5" />
          </button>

          {/* Site domain */}
          {site && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-md border border-tundra-ink-200 bg-tundra-ink-50 px-2 py-0.5 text-xs font-medium text-tundra-ink">
              <GlobeIcon className="h-3 w-3 shrink-0 text-tundra-ink-400" />
              <span className="font-mono">{site.primary_domain}</span>
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
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1.5 h-3.5 w-3.5 text-tundra-ink-300" />
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
                  ? <ListIcon className="h-3.5 w-3.5" />
                  : <LayoutGridIcon className="h-3.5 w-3.5" />
                }
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={() => { setModal({ type: 'upload' }) }}
              className="flex items-center gap-1 rounded-lg border border-tundra-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
              <UploadIcon className="h-3.5 w-3.5" />
              Upload
            </button>
            <button type="button" onClick={() => { setNewName(''); setModal({ type: 'newFile' }) }}
              className="flex items-center gap-1 rounded-lg border border-tundra-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
              + File
            </button>
            <button type="button" onClick={() => { setNewName(''); setModal({ type: 'newFolder' }) }}
              className="flex items-center gap-1.5 rounded-lg bg-tundra-lichen px-2.5 py-1 text-xs font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
              <FolderIconBase className="h-3.5 w-3.5" />
              + Folder
            </button>
          </div>
        </div>

        {/* ── Bulk bar ── */}
        {selected.size > 0 && (
          <div className="flex shrink-0 items-center gap-2 border-b border-tundra-lichen-200 bg-tundra-lichen-50 px-4 py-2">
            <span className="text-xs font-semibold text-tundra-lichen-800">{selected.size} selected</span>
            <div className="h-3 w-px bg-tundra-lichen-200" />
            <button type="button" onClick={downloadBulk}
              className="rounded-lg border border-tundra-lichen-200 bg-white px-2.5 py-1 text-xs font-medium text-tundra-lichen-700 hover:bg-tundra-lichen-100 transition-colors">
              Download
            </button>
            <button type="button" onClick={() => { setModal({ type: 'copy', names: [...selected] }) }}
              className="rounded-lg border border-tundra-lichen-200 bg-white px-2.5 py-1 text-xs font-medium text-tundra-lichen-700 hover:bg-tundra-lichen-100 transition-colors">
              Copy
            </button>
            <button type="button" onClick={() => { setModal({ type: 'move', names: [...selected] }) }}
              className="rounded-lg border border-tundra-lichen-200 bg-white px-2.5 py-1 text-xs font-medium text-tundra-lichen-700 hover:bg-tundra-lichen-100 transition-colors">
              Move
            </button>
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
                        <ArrowLeftIcon className="h-3.5 w-3.5" />
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
                      onContextMenu={(e) => { openContextMenu(e, f) }}
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
                        <span title={fmtDate(f.modified)}>{fmtRelative(f.modified)}</span>
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
                              <PencilIcon className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button type="button"
                            onClick={() => { setNewName(f.name); setModal({ type: 'rename', name: f.name }) }}
                            title="Rename"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-tundra-ink-400 hover:bg-tundra-ink-100 hover:text-tundra-ink transition-colors">
                            <TypeIcon className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => { setModal({ type: 'copy', names: [f.name] }) }} title="Copy"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-tundra-ink-400 hover:bg-tundra-ink-100 hover:text-tundra-ink transition-colors">
                            <CopyIcon className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => { downloadEntry(f.name) }} title={f.type === 'dir' ? 'Zip & download' : 'Download'}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-tundra-ink-400 hover:bg-tundra-ink-100 hover:text-tundra-ink transition-colors">
                            <DownloadIcon className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => { setModal({ type: 'delete', names: [f.name] }) }} title="Delete"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-tundra-ink-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                            <TrashIcon className="h-3.5 w-3.5" />
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
                  <ArrowLeftIcon className="h-3.5 w-3.5" />
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
                        onContextMenu={(e) => { openContextMenu(e, f) }}
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
                        <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button type="button" onClick={(e) => { e.stopPropagation(); downloadEntry(f.name) }}
                            className="flex h-5 w-5 items-center justify-center rounded-md bg-white shadow text-tundra-ink-400 hover:text-tundra-lichen-700 transition-colors">
                            <DownloadIcon className="h-3 w-3" />
                          </button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setModal({ type: 'delete', names: [f.name] }) }}
                            className="flex h-5 w-5 items-center justify-center rounded-md bg-white shadow text-tundra-ink-400 hover:text-red-600 transition-colors">
                            <CloseIcon className="h-3 w-3" />
                          </button>
                        </div>
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
                renameMutation.mutate({ from: filePath(path, modal.name), to: filePath(path, newName) })
              }
            }}
            className="mb-4 w-full rounded-xl border border-tundra-ink-200 px-3 py-2.5 font-mono text-sm focus:border-tundra-lichen focus:outline-none" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setModal(null) }}
              className="rounded-xl border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">Cancel</button>
            <button type="button" disabled={!newName || renameMutation.isPending}
              onClick={() => {
                if (newName && modal.type === 'rename') {
                  renameMutation.mutate({ from: filePath(path, modal.name), to: filePath(path, newName) })
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
          filePath={filePath(path, modal.name)}
          onApply={(fp, mode) => { chmodMutation.mutate({ filePath: fp, mode }) }}
          isPending={chmodMutation.isPending}
          onClose={() => { setModal(null) }}
        />
      )}

      {modal?.type === 'upload' && (
        <UploadModal path={path} siteId={siteId} onClose={() => { setModal(null) }} onSuccess={() => { void invalidateDir() }} />
      )}

      {modal?.type === 'copy' && (
        <CopyMoveModal
          mode="copy" names={modal.names} currentPath={path}
          onDone={(dest) => { copyMutation.mutate({ names: modal.names, dest }) }}
          isPending={copyMutation.isPending}
          onClose={() => { setModal(null) }}
        />
      )}

      {modal?.type === 'move' && (
        <CopyMoveModal
          mode="move" names={modal.names} currentPath={path}
          onDone={(dest) => { moveMutation.mutate({ names: modal.names, dest }) }}
          isPending={moveMutation.isPending}
          onClose={() => { setModal(null) }}
        />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextItems(contextMenu.entry)}
          onClose={() => { setContextMenu(null) }}
        />
      )}
    </div>
  )
}
