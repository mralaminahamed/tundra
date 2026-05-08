import { createFileRoute, useRouter, Link } from '@tanstack/react-router'
import { Formik, Form, ErrorMessage } from 'formik'
import * as Yup from 'yup'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import {
  GlobeIcon as Globe, DatabaseIcon as Database, FolderOpenIcon as FolderOpen,
  DownloadIcon as Download, SettingsIcon as Settings2, ShieldCheckIcon as ShieldCheck,
  KeyIcon as Key, CheckCircleIcon as CheckCircle2, LockIcon as Lock, UnlockIcon as Unlock,
  CloseIcon as X, PackageIcon as Package, UploadIcon as Upload,
  CheckIcon,
  GithubIcon, GitlabIcon, BitbucketIcon, WordpressIcon,
  PhpIcon, LaravelIcon, NodejsIcon, PythonIcon, GoIcon, RubyIcon, DotnetIcon,
  ArrowLeftIcon, ArrowRightIcon,
} from '@/components/icons'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CreateSiteResponse, ListResponse, Server, TemplateManifest } from '@/lib/api-types'
import { Switch } from '@/components/ui/switch'

// ── Shared styles ─────────────────────────────────────────────────────────────

const INPUT = 'w-full rounded-xl border border-tundra-ink-200 bg-white px-3.5 py-2.5 text-sm placeholder:text-tundra-ink-300 focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20 transition-colors'
const LABEL = 'mb-1.5 block text-sm font-medium text-tundra-ink'
const HINT  = 'mt-1.5 text-xs text-tundra-ink-400 leading-relaxed'

// ── Helpers ───────────────────────────────────────────────────────────────────

function generatePassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()'
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function passwordStrength(pw: string): { label: string; color: string; width: string } {
  if (!pw) return { label: '', color: 'bg-tundra-ink-200', width: '0%' }
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { label: 'Weak',   color: 'bg-red-500',       width: '20%' }
  if (score <= 2) return { label: 'Fair',   color: 'bg-yellow-500',    width: '45%' }
  if (score <= 3) return { label: 'Good',   color: 'bg-tundra-aurora', width: '70%' }
  return             { label: 'Strong', color: 'bg-tundra-lichen',  width: '100%' }
}

// ── Version data ──────────────────────────────────────────────────────────────

interface VersionOption { value: string; label: string; recommended?: boolean }
interface VersionGroup  { label: string; status?: 'active' | 'security' | 'eol'; versions: string[] }

// PHP branch lifecycle (mirrors wp settings page; updated May 2026)
// active: 8.4, 8.3, 8.2  |  security: 8.1  |  eol: 8.0, 7.4
const PHP_EOL = new Set(['7.4', '8.0'])
const PHP_SEC = new Set(['8.1'])
function phpBranchStatus(b: string): 'active' | 'security' | 'eol' {
  if (PHP_EOL.has(b)) return 'eol'
  if (PHP_SEC.has(b)) return 'security'
  return 'active'
}

function groupByBranch(versions: string[]): VersionGroup[] {
  const map = new Map<string, string[]>()
  for (const v of versions) {
    const branch = v.split('.').slice(0, 2).join('.')
    if (!map.has(branch)) map.set(branch, [])
    map.get(branch)!.push(v)
  }
  return Array.from(map.entries()).map(([branch, vs]) => ({
    label: branch, status: phpBranchStatus(branch), versions: vs,
  }))
}

// PHP fallback when live API is unavailable (updated May 2026)
const PHP_FALLBACK = ['8.4.7', '8.4.6', '8.3.21', '8.3.20', '8.2.28', '8.2.27', '8.1.32', '8.0.30', '7.4.33']

// Curated grouped lists for other runtimes (updated May 2026)
const NODE_GROUPS: VersionGroup[] = [
  { label: 'Node 22 LTS', status: 'active', versions: ['22.22.2', '22.22.1', '22.22.0'] },
  { label: 'Node 20',     status: 'eol',    versions: ['20.20.1', '20.20.0', '20.19.2'] },
  { label: 'Node 18',     status: 'eol',    versions: ['18.20.8', '18.20.7', '18.20.6'] },
  { label: 'Node 16',     status: 'eol',    versions: ['16.20.2', '16.20.1', '16.20.0'] },
]
const PYTHON_GROUPS: VersionGroup[] = [
  { label: 'Python 3.13', status: 'active',   versions: ['3.13.13', '3.13.12', '3.13.11'] },
  { label: 'Python 3.12', status: 'active',   versions: ['3.12.13', '3.12.12', '3.12.11'] },
  { label: 'Python 3.11', status: 'active',   versions: ['3.11.15', '3.11.14', '3.11.13'] },
  { label: 'Python 3.10', status: 'security', versions: ['3.10.20'] },
  { label: 'Python 3.9',  status: 'eol',      versions: ['3.9.25'] },
]
const GO_GROUPS: VersionGroup[] = [
  { label: 'Go 1.26', status: 'active', versions: ['1.26.2', '1.26.1', '1.26.0'] },
  { label: 'Go 1.25', status: 'active', versions: ['1.25.9', '1.25.8', '1.25.7'] },
  { label: 'Go 1.24', status: 'eol',   versions: ['1.24.13', '1.24.12', '1.24.11'] },
  { label: 'Go 1.23', status: 'eol',   versions: ['1.23.12', '1.23.11', '1.23.10'] },
]
const RUBY_GROUPS: VersionGroup[] = [
  { label: 'Ruby 3.4', status: 'active',   versions: ['3.4.9', '3.4.8', '3.4.7'] },
  { label: 'Ruby 3.3', status: 'active',   versions: ['3.3.11', '3.3.10', '3.3.9'] },
  { label: 'Ruby 3.2', status: 'security', versions: ['3.2.11', '3.2.10', '3.2.9'] },
  { label: 'Ruby 3.1', status: 'eol',      versions: ['3.1.7'] },
]
const DOTNET_GROUPS: VersionGroup[] = [
  { label: '.NET 9', status: 'active', versions: ['9.0.15', '9.0.14', '9.0.13'] },
  { label: '.NET 8', status: 'active', versions: ['8.0.26', '8.0.25', '8.0.24'] },
  { label: '.NET 7', status: 'eol',   versions: ['7.0.20'] },
  { label: '.NET 6', status: 'eol',   versions: ['6.0.36'] },
]
const WP_VERSIONS: VersionOption[] = [
  { value: 'latest', label: 'Latest (recommended)', recommended: true },
  { value: '6.7.2',  label: '6.7.2' },
  { value: '6.6.2',  label: '6.6.2' },
  { value: '6.5.5',  label: '6.5.5' },
]

const PHP_EXTENSIONS = [
  { id: 'mbstring',  label: 'mbstring',  desc: 'Multibyte strings' },
  { id: 'curl',      label: 'curl',      desc: 'HTTP client' },
  { id: 'openssl',   label: 'openssl',   desc: 'SSL/TLS' },
  { id: 'zip',       label: 'zip',       desc: 'ZIP archives' },
  { id: 'xml',       label: 'xml',       desc: 'XML processing' },
  { id: 'gd',        label: 'gd',        desc: 'Image processing' },
  { id: 'imagick',   label: 'imagick',   desc: 'ImageMagick' },
  { id: 'intl',      label: 'intl',      desc: 'Internationalization' },
  { id: 'redis',     label: 'redis',     desc: 'Redis cache' },
  { id: 'memcached', label: 'memcached', desc: 'Memcache' },
  { id: 'pdo_mysql', label: 'pdo_mysql', desc: 'MySQL (PDO)' },
  { id: 'pdo_pgsql', label: 'pdo_pgsql', desc: 'PostgreSQL (PDO)' },
  { id: 'bcmath',    label: 'bcmath',    desc: 'Arbitrary precision' },
  { id: 'sodium',    label: 'sodium',    desc: 'Cryptography' },
  { id: 'pcntl',     label: 'pcntl',     desc: 'Process control' },
  { id: 'exif',      label: 'exif',      desc: 'EXIF metadata' },
]

const PHP_EXT_DEFAULTS = ['mbstring', 'curl', 'openssl', 'zip', 'xml', 'gd', 'pdo_mysql']

// ── VersionSelect ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  eol:      'bg-red-100 text-red-600',
  security: 'bg-yellow-100 text-yellow-700',
}
const STATUS_LABEL: Record<string, string> = { eol: 'EOL', security: 'Security' }

function VersionSelect({
  value, onChange, groups, options, placeholder = 'Select version',
  allowCustom = true, loading = false, className,
}: {
  value: string; onChange: (v: string) => void
  groups?: VersionGroup[]; options?: VersionOption[]
  placeholder?: string; allowCustom?: boolean; loading?: boolean; className?: string
}) {
  const [open, setOpen]           = useState(false)
  const [query, setQuery]         = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const [rect, setRect]           = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const listRef    = useRef<HTMLDivElement>(null)
  const portalRef  = useRef<HTMLDivElement>(null)

  const updateRect = useCallback(() => {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect())
  }, [])

  useEffect(() => {
    if (!open) return
    updateRect()
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => { window.removeEventListener('scroll', updateRect, true); window.removeEventListener('resize', updateRect) }
  }, [open, updateRect])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!triggerRef.current?.contains(e.target as Node) && !portalRef.current?.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Flatten all versions for keyboard nav + search
  const allVersions: string[] = useMemo(() => {
    if (groups) return groups.flatMap((g) => g.versions)
    return (options ?? []).map((o) => o.value)
  }, [groups, options])

  const filtered: string[] = useMemo(() => {
    if (!query) return allVersions
    const q = query.toLowerCase()
    return allVersions.filter((v) => v.toLowerCase().includes(q))
  }, [allVersions, query])

  const filteredGroups: VersionGroup[] = useMemo(() => {
    if (!groups) return []
    if (!query) return groups
    return groups.map((g) => ({ ...g, versions: g.versions.filter((v) => v.toLowerCase().includes(query.toLowerCase())) })).filter((g) => g.versions.length > 0)
  }, [groups, query])

  function select(v: string) { onChange(v); setQuery(''); setOpen(false) }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'Enter') { setOpen(true); return } return }
    if (e.key === 'Escape')    { setOpen(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)) }
    if (e.key === 'Enter' && filtered[highlighted]) { select(filtered[highlighted]!); return }
  }

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${highlighted}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  useEffect(() => { setHighlighted(0) }, [query])

  // Determine EOL/security status of current value
  const valueBranch = value.split('.').slice(0, 2).join('.')
  const valueGroup  = groups?.find((g) => g.versions.includes(value))
  const valueStatus = valueGroup?.status ?? 'active'

  // Trigger display label
  const isLatest    = groups ? groups[0]?.versions[0] === value : (options?.[0]?.value === value)
  const triggerLabel = loading ? 'Loading versions…'
    : value ? `${value}${isLatest ? ' — latest' : ''}`
    : placeholder

  // Build portal dropdown
  const dropdown = open && rect && createPortal(
    <div
      ref={portalRef}
      style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 }}
      className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white shadow-xl"
    >
      {/* Search */}
      <div className="flex items-center gap-2 border-b border-tundra-ink-100 px-3 py-2">
        <svg className="h-3.5 w-3.5 shrink-0 text-tundra-ink-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input
          ref={inputRef} type="text" autoFocus
          placeholder="Search — e.g. 8.3 or 8.3.21"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent font-mono text-xs text-tundra-ink placeholder:text-tundra-ink-300 focus:outline-none"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} className="text-tundra-ink-300 hover:text-tundra-ink">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>
      {/* List */}
      <div ref={listRef} className="max-h-64 overflow-y-auto">
        {groups ? (
          filteredGroups.length === 0 ? (
            <p className="px-4 py-3 text-xs text-tundra-ink-400">No versions match "{query}"</p>
          ) : (() => {
            let flatIdx = 0
            return filteredGroups.map(({ label: gl, status, versions: vs }) => (
              <div key={gl}>
                <div className="sticky top-0 flex items-center justify-between bg-tundra-ink-50/95 px-3 py-1.5 backdrop-blur-sm">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-tundra-ink-500">{gl}</span>
                  {status && status !== 'active' && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[status]}`}>
                      {STATUS_LABEL[status]}
                    </span>
                  )}
                </div>
                {vs.map((v, i) => {
                  const idx = flatIdx++
                  return (
                    <button key={v} type="button" data-idx={idx}
                      onClick={() => select(v)}
                      className={`flex w-full items-center justify-between px-4 py-2 text-left font-mono text-sm transition-colors ${
                        idx === highlighted ? 'bg-tundra-lichen/10 text-tundra-lichen' : 'hover:bg-tundra-ink-50 text-tundra-ink'
                      } ${v === value ? 'font-semibold' : ''}`}
                    >
                      <span>{v}</span>
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-tundra-ink-400">
                        {i === 0 && <span className="rounded bg-tundra-lichen-100 px-1.5 py-0.5 text-[10px] font-medium text-tundra-lichen-700">latest</span>}
                        {v === value && <CheckIcon className="h-3.5 w-3.5 text-tundra-lichen" />}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))
          })()
        ) : (
          <>
            {(query ? filtered : (options ?? []).map((o) => o.value)).map((v, idx) => {
              const opt = options?.find((o) => o.value === v)
              return (
                <button key={v} type="button" data-idx={idx}
                  onClick={() => select(v)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    idx === highlighted ? 'bg-tundra-lichen/10 text-tundra-lichen' : 'hover:bg-tundra-ink-50 text-tundra-ink'
                  } ${v === value ? 'font-semibold' : ''}`}
                >
                  {v === value ? <CheckIcon className="h-3.5 w-3.5 shrink-0 text-tundra-lichen" /> : <span className="h-3.5 w-3.5 shrink-0" />}
                  <span className="flex-1">{opt?.label ?? v}</span>
                  {idx === 0 && <span className="rounded bg-tundra-lichen-100 px-1.5 py-0.5 text-[10px] font-medium text-tundra-lichen-700">latest</span>}
                </button>
              )
            })}
            {allowCustom && query && !allVersions.includes(query) && (
              <button type="button"
                onClick={() => select(query)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-tundra-ink-500 hover:bg-tundra-ink-50"
              >
                <span className="h-3.5 w-3.5 shrink-0" />
                Use custom: <code className="ml-1 font-mono text-xs">{query}</code>
              </button>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      <button
        ref={triggerRef} type="button"
        onClick={() => { setOpen((o) => !o); setTimeout(() => inputRef.current?.focus(), 10) }}
        onKeyDown={handleKeyDown}
        disabled={loading}
        className={`${INPUT} flex items-center justify-between font-mono disabled:opacity-60`}
      >
        <span className={value ? 'text-tundra-ink' : 'text-tundra-ink-300'}>{triggerLabel}</span>
        <svg className={`h-4 w-4 shrink-0 text-tundra-ink-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {dropdown}
      {/* EOL / security warning banner */}
      {value && valueStatus !== 'active' && (
        <div className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs ${
          valueStatus === 'eol' ? 'border-red-200 bg-red-50 text-red-700' : 'border-yellow-200 bg-yellow-50 text-yellow-700'
        }`}>
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          {valueStatus === 'eol'
            ? `${valueBranch} is end-of-life — no security fixes.`
            : `${valueBranch} receives security fixes only.`}
        </div>
      )}
    </div>
  )
}

// ── Step progress indicator ───────────────────────────────────────────────────

function StepIndicator({ steps, current }: {
  steps: Array<{ id: number; label: string }>
  current: number
}) {
  return (
    <nav className="flex items-center gap-0">
      {steps.map((s, i) => {
        const done   = s.id < current
        const active = s.id === current
        return (
          <div key={s.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={[
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-200',
                done   ? 'bg-tundra-lichen text-white shadow-sm shadow-tundra-lichen/30' :
                active ? 'bg-tundra-ink text-white ring-4 ring-tundra-ink/10' :
                         'border-2 border-tundra-ink-200 bg-white text-tundra-ink-300',
              ].join(' ')}>
                {done
                  ? <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
                  : s.id + 1}
              </div>
              <span className={[
                'hidden text-[10px] font-medium sm:block whitespace-nowrap',
                done ? 'text-tundra-lichen-700' : active ? 'text-tundra-ink font-semibold' : 'text-tundra-ink-300',
              ].join(' ')}>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={[
                'h-0.5 flex-1 mx-2 mb-5 sm:mb-4 min-w-[16px] transition-colors duration-300',
                done ? 'bg-tundra-lichen' : 'bg-tundra-ink-200',
              ].join(' ')} />
            )}
          </div>
        )
      })}
    </nav>
  )
}

// ── Form values ───────────────────────────────────────────────────────────────

interface EnvVar { key: string; value: string; secret: boolean }

interface FormValues {
  sourceKind: 'github' | 'gitlab' | 'bitbucket' | 'blank' | 'template' | 'zip' | 'wordpress'
  repoUrl: string; branch: string
  kind: string; runtimeVersion: string
  buildCommand: string; startCommand: string; listenPort: string; healthCheckPath: string
  domain: string; serverId: string; name: string; enableSsl: boolean
  wpSiteTitle: string; wpAdminUser: string; wpAdminEmail: string
  wpAdminPassword: string; wpVersion: string; wpShowPassword: boolean
  phpExtensions: string[]; phpMemoryLimit: string; phpMaxExec: string; phpOpcache: boolean
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun'; nodeEnv: string
  wsgiServer: 'gunicorn' | 'uvicorn' | 'waitress' | 'daphne'
  pythonRequirementsFile: string
  envVars: EnvVar[]
  gitAutoDeploy: boolean
}

// ── Plugin registry ───────────────────────────────────────────────────────────

type SetFieldValue = (field: string, value: unknown) => void

interface WizardPlugin {
  id: string
  matches: (sourceKind: string, runtimeKind: string, template: TemplateManifest | undefined) => boolean
  step: { label: string; desc: string }
  schema: Yup.ObjectSchema<Record<string, unknown>>
  Component: React.FC<{ values: FormValues; setFieldValue: SetFieldValue }>
  postCreate?: (siteId: string, primaryDomain: string, values: FormValues) => Promise<string | void>
}

// ── Plugin: WordPress ─────────────────────────────────────────────────────────

function WpSetupStep({ values, setFieldValue }: { values: FormValues; setFieldValue: SetFieldValue }) {
  const strength = passwordStrength(values.wpAdminPassword)
  return (
    <div className="space-y-6">
      <div>
        <label className={LABEL}>WordPress Version</label>
        <VersionSelect
          value={values.wpVersion || 'latest'}
          onChange={(v) => setFieldValue('wpVersion', v)}
          options={WP_VERSIONS}
          placeholder="Select WP version"
          allowCustom
        />
      </div>
      <div>
        <label className={LABEL}>Site Title</label>
        <input type="text" value={values.wpSiteTitle} onChange={(e) => setFieldValue('wpSiteTitle', e.target.value)} placeholder="My WordPress Site" className={INPUT} />
        <ErrorMessage name="wpSiteTitle" component="p" className="mt-1 text-xs text-red-500" />
      </div>
      <div className="rounded-2xl border border-tundra-ink-200 bg-tundra-ink-50/50 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-tundra-ink-200">
            <svg className="h-3.5 w-3.5 text-tundra-ink-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-500">Admin account</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Username</label>
            <input type="text" value={values.wpAdminUser} onChange={(e) => setFieldValue('wpAdminUser', e.target.value)} placeholder="admin" autoComplete="off" className={INPUT} />
            <ErrorMessage name="wpAdminUser" component="p" className="mt-1 text-xs text-red-500" />
          </div>
          <div>
            <label className={LABEL}>Email</label>
            <input type="email" value={values.wpAdminEmail} onChange={(e) => setFieldValue('wpAdminEmail', e.target.value)} placeholder={values.domain ? `admin@${values.domain}` : 'admin@example.com'} className={INPUT} />
            <ErrorMessage name="wpAdminEmail" component="p" className="mt-1 text-xs text-red-500" />
          </div>
        </div>
        <div>
          <label className={LABEL}>Password</label>
          <div className="relative">
            <input type={values.wpShowPassword ? 'text' : 'password'} value={values.wpAdminPassword} onChange={(e) => setFieldValue('wpAdminPassword', e.target.value)} autoComplete="new-password" className={`${INPUT} pr-28`} />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button type="button" onClick={() => setFieldValue('wpAdminPassword', generatePassword())}
                className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-tundra-lichen hover:bg-tundra-lichen/10 transition-colors">
                Generate
              </button>
              <button type="button" onClick={() => setFieldValue('wpShowPassword', !values.wpShowPassword)} className="p-0.5 text-tundra-ink-400 hover:text-tundra-ink">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  {values.wpShowPassword
                    ? <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/>
                    : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
                </svg>
              </button>
            </div>
          </div>
          {values.wpAdminPassword && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-tundra-ink-100 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-300 ${strength.color}`} style={{ width: strength.width }} />
              </div>
              <span className="text-[10px] font-semibold text-tundra-ink-500 w-10">{strength.label}</span>
            </div>
          )}
          <ErrorMessage name="wpAdminPassword" component="p" className="mt-1 text-xs text-red-500" />
        </div>
      </div>
    </div>
  )
}

const wpPlugin: WizardPlugin = {
  id: 'wordpress',
  matches: (sourceKind, _, tmpl) => sourceKind === 'wordpress' || !!tmpl?.tags.includes('wordpress'),
  step: { label: 'WordPress', desc: 'WordPress site configuration' },
  schema: Yup.object({
    wpSiteTitle:     Yup.string().required('Site title is required'),
    wpAdminUser:     Yup.string().required('Admin username is required'),
    wpAdminEmail:    Yup.string().email('Valid email required').required('Admin email is required'),
    wpAdminPassword: Yup.string().min(8, 'At least 8 characters').required('Password is required'),
  }) as Yup.ObjectSchema<Record<string, unknown>>,
  Component: WpSetupStep,
  postCreate: async (siteId, _domain, values) => {
    const wp = await api<{ id: string }>('/wordpress/installations', {
      method: 'POST',
      body: {
        site_id:           siteId,
        installation_path: '/',
        site_title:        values.wpSiteTitle,
        site_description:  '',
        wp_version:        values.wpVersion || 'latest',
        language:          'en_US',
        admin_username:    values.wpAdminUser,
        admin_password:    values.wpAdminPassword,
        admin_email:       values.wpAdminEmail,
        db_prefix:         'wp_',
        multisite:         false,
        auto_updates:      'minor',
        send_email:        false,
      },
    })
    return `/wordpress/${wp.id}`
  },
}

// ── Plugin: PHP Config ─────────────────────────────────────────────────────────

function PhpConfigStep({ values, setFieldValue }: { values: FormValues; setFieldValue: SetFieldValue }) {
  const toggle = (ext: string) => {
    const current = values.phpExtensions
    setFieldValue(
      'phpExtensions',
      current.includes(ext) ? current.filter((e) => e !== ext) : [...current, ext],
    )
  }

  return (
    <div className="space-y-6">
      {/* PHP Extensions */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className={LABEL.replace('mb-1.5 ', '')}>PHP Extensions</p>
          <button type="button"
            onClick={() => setFieldValue('phpExtensions', PHP_EXTENSIONS.map((e) => e.id))}
            className="text-xs text-tundra-lichen hover:underline">Select all</button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {PHP_EXTENSIONS.map(({ id, label, desc }) => {
            const checked = values.phpExtensions.includes(id)
            return (
              <button key={id} type="button" onClick={() => toggle(id)}
                className={[
                  'flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all duration-150',
                  checked
                    ? 'border-tundra-lichen bg-tundra-lichen/5 ring-1 ring-tundra-lichen/20'
                    : 'border-tundra-ink-200 bg-white hover:border-tundra-lichen/40',
                ].join(' ')}
              >
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${checked ? 'border-tundra-lichen bg-tundra-lichen' : 'border-tundra-ink-300'}`}>
                  {checked && <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>}
                </span>
                <div className="min-w-0">
                  <p className={`font-mono text-xs font-semibold ${checked ? 'text-tundra-lichen-700' : 'text-tundra-ink'}`}>{label}</p>
                  <p className="truncate text-[10px] text-tundra-ink-400">{desc}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Memory limit + max exec */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL}>Memory limit</label>
          <select value={values.phpMemoryLimit} onChange={(e) => setFieldValue('phpMemoryLimit', e.target.value)} className={INPUT}>
            {['64M', '128M', '256M', '512M', '1024M'].map((v) => (
              <option key={v} value={v}>{v}{v === '256M' ? ' (recommended)' : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Max execution time</label>
          <select value={values.phpMaxExec} onChange={(e) => setFieldValue('phpMaxExec', e.target.value)} className={INPUT}>
            {['30', '60', '120', '300', '600'].map((v) => (
              <option key={v} value={v}>{v}s{v === '30' ? ' (recommended)' : ''}</option>
            ))}
          </select>
        </div>
      </div>

      {/* OPcache */}
      <div className="flex items-center justify-between rounded-2xl border border-tundra-ink-200 bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tundra-lichen/10">
            <svg className="h-4 w-4 text-tundra-lichen-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-tundra-ink">Enable OPcache</p>
            <p className="text-xs text-tundra-ink-400">Bytecode caching for faster PHP execution</p>
          </div>
        </div>
        <Switch checked={values.phpOpcache} onChange={(v) => setFieldValue('phpOpcache', v)} />
      </div>
    </div>
  )
}

const phpConfigPlugin: WizardPlugin = {
  id: 'php_config',
  matches: (sourceKind, runtimeKind, tmpl) => {
    if (sourceKind === 'wordpress' || tmpl?.tags.includes('wordpress')) return true
    return runtimeKind === 'php' || runtimeKind === 'laravel'
  },
  step: { label: 'PHP Config', desc: 'PHP extensions and server settings' },
  schema: Yup.object({}) as Yup.ObjectSchema<Record<string, unknown>>,
  Component: PhpConfigStep,
}

// ── Plugin: Node Config ────────────────────────────────────────────────────────

const PKG_MANAGERS: Array<{ id: FormValues['packageManager']; label: string; desc: string }> = [
  { id: 'npm',  label: 'npm',  desc: 'Node default' },
  { id: 'yarn', label: 'Yarn', desc: 'Fast + PnP' },
  { id: 'pnpm', label: 'pnpm', desc: 'Disk-efficient' },
  { id: 'bun',  label: 'Bun',  desc: 'Ultra-fast' },
]

function NodeConfigStep({ values, setFieldValue }: { values: FormValues; setFieldValue: SetFieldValue }) {
  return (
    <div className="space-y-6">
      <div>
        <label className={LABEL}>Package manager</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PKG_MANAGERS.map(({ id, label, desc }) => {
            const active = values.packageManager === id
            return (
              <button key={id} type="button" onClick={() => setFieldValue('packageManager', id)}
                className={[
                  'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all duration-150',
                  active
                    ? 'border-tundra-lichen bg-tundra-lichen/5 ring-2 ring-tundra-lichen/20 shadow-sm'
                    : 'border-tundra-ink-200 bg-white hover:border-tundra-lichen/40',
                ].join(' ')}
              >
                <span className={`font-mono text-sm font-bold ${active ? 'text-tundra-lichen-700' : 'text-tundra-ink'}`}>{label}</span>
                <span className="text-[10px] text-tundra-ink-400">{desc}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <label className={LABEL}>NODE_ENV</label>
        <div className="grid grid-cols-3 gap-2">
          {['production', 'staging', 'development'].map((env) => {
            const active = values.nodeEnv === env
            return (
              <button key={env} type="button" onClick={() => setFieldValue('nodeEnv', env)}
                className={[
                  'rounded-xl border px-4 py-2.5 text-sm font-medium capitalize transition-all duration-150',
                  active
                    ? 'border-tundra-lichen bg-tundra-lichen/5 text-tundra-lichen-700 ring-2 ring-tundra-lichen/20 shadow-sm'
                    : 'border-tundra-ink-200 bg-white text-tundra-ink hover:border-tundra-lichen/40',
                ].join(' ')}
              >{env}</button>
            )
          })}
        </div>
        <p className={HINT}>Sets the NODE_ENV environment variable at runtime.</p>
      </div>
    </div>
  )
}

const nodeConfigPlugin: WizardPlugin = {
  id: 'node_config',
  matches: (_, runtimeKind) => runtimeKind === 'nodejs',
  step: { label: 'Node Config', desc: 'Package manager and runtime environment' },
  schema: Yup.object({}) as Yup.ObjectSchema<Record<string, unknown>>,
  Component: NodeConfigStep,
}

// ── Plugin: Python Config ──────────────────────────────────────────────────────

const WSGI_SERVERS: Array<{ id: FormValues['wsgiServer']; label: string; desc: string }> = [
  { id: 'gunicorn', label: 'Gunicorn',  desc: 'WSGI, battle-tested' },
  { id: 'uvicorn',  label: 'Uvicorn',   desc: 'ASGI, async support' },
  { id: 'waitress', label: 'Waitress',  desc: 'Pure-Python WSGI' },
  { id: 'daphne',   label: 'Daphne',    desc: 'Django Channels' },
]

function PythonConfigStep({ values, setFieldValue }: { values: FormValues; setFieldValue: SetFieldValue }) {
  return (
    <div className="space-y-6">
      <div>
        <label className={LABEL}>WSGI / ASGI server</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {WSGI_SERVERS.map(({ id, label, desc }) => {
            const active = values.wsgiServer === id
            return (
              <button key={id} type="button" onClick={() => setFieldValue('wsgiServer', id)}
                className={[
                  'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all duration-150',
                  active
                    ? 'border-tundra-lichen bg-tundra-lichen/5 ring-2 ring-tundra-lichen/20 shadow-sm'
                    : 'border-tundra-ink-200 bg-white hover:border-tundra-lichen/40',
                ].join(' ')}
              >
                <span className={`text-sm font-bold ${active ? 'text-tundra-lichen-700' : 'text-tundra-ink'}`}>{label}</span>
                <span className="text-[10px] text-tundra-ink-400">{desc}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <label className={LABEL}>Requirements file</label>
        <input type="text" value={values.pythonRequirementsFile} onChange={(e) => setFieldValue('pythonRequirementsFile', e.target.value)} placeholder="requirements.txt" className={`${INPUT} font-mono text-xs`} />
        <p className={HINT}>Path relative to the document root. Used for <code className="font-mono">pip install -r</code> during build.</p>
      </div>
    </div>
  )
}

const pythonConfigPlugin: WizardPlugin = {
  id: 'python_config',
  matches: (_, runtimeKind) => runtimeKind === 'python',
  step: { label: 'Python Config', desc: 'WSGI server and package settings' },
  schema: Yup.object({}) as Yup.ObjectSchema<Record<string, unknown>>,
  Component: PythonConfigStep,
}

// ── Plugin: Environment Variables ─────────────────────────────────────────────

function EnvVarsStep({ values, setFieldValue }: { values: FormValues; setFieldValue: SetFieldValue }) {
  const addVar    = () => setFieldValue('envVars', [...values.envVars, { key: '', value: '', secret: false }])
  const removeVar = (i: number) => setFieldValue('envVars', values.envVars.filter((_, idx) => idx !== i))
  const updateVar = (i: number, field: keyof EnvVar, val: unknown) =>
    setFieldValue('envVars', values.envVars.map((v, idx) => idx === i ? { ...v, [field]: val } : v))

  return (
    <div className="space-y-4">
      <p className="text-sm text-tundra-ink-500">
        Add variables written to <code className="rounded-md bg-tundra-ink-100 px-1.5 py-0.5 font-mono text-xs">.env</code> on the server.
        Mark sensitive ones as <strong>Secret</strong> to encrypt at rest.
      </p>
      {values.envVars.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-tundra-ink-200 py-10 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-tundra-ink-100">
            <svg className="h-5 w-5 text-tundra-ink-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          </div>
          <p className="text-sm text-tundra-ink-400">No environment variables yet.</p>
          <button type="button" onClick={addVar} className="mt-2 text-sm font-semibold text-tundra-lichen hover:underline">+ Add first variable</button>
        </div>
      ) : (
        <div className="space-y-2">
          {values.envVars.map((ev, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="text" value={ev.key} onChange={(e) => updateVar(i, 'key', e.target.value.toUpperCase())} placeholder="KEY" className={`${INPUT} w-40 font-mono text-xs uppercase`} />
              <input type={ev.secret ? 'password' : 'text'} value={ev.value} onChange={(e) => updateVar(i, 'value', e.target.value)} placeholder="value" className={`${INPUT} flex-1 font-mono text-xs`} />
              <button type="button" onClick={() => updateVar(i, 'secret', !ev.secret)} title={ev.secret ? 'Unmark secret' : 'Mark as secret'}
                className={`rounded-xl border px-2.5 py-2 text-xs font-medium transition-colors ${ev.secret ? 'border-tundra-aurora-300 bg-tundra-aurora-50 text-tundra-aurora-700' : 'border-tundra-ink-200 text-tundra-ink-400 hover:border-tundra-aurora-300'}`}>
                {ev.secret ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              </button>
              <button type="button" onClick={() => removeVar(i)} className="rounded-xl border border-tundra-ink-200 p-2 text-tundra-ink-400 hover:border-red-300 hover:text-red-500 transition-colors"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <button type="button" onClick={addVar} className="mt-1 text-sm font-semibold text-tundra-lichen hover:underline">+ Add variable</button>
        </div>
      )}
    </div>
  )
}

const envVarsPlugin: WizardPlugin = {
  id: 'env_vars',
  matches: (sourceKind, _, tmpl) => {
    if (['github', 'gitlab', 'bitbucket', 'wordpress', 'blank', 'zip'].includes(sourceKind)) return false
    if (tmpl?.tags.includes('wordpress')) return false
    return sourceKind === 'template' && !!tmpl
  },
  step: { label: 'Environment', desc: 'Environment variables for deployment' },
  schema: Yup.object({}) as Yup.ObjectSchema<Record<string, unknown>>,
  Component: EnvVarsStep,
}

// ── Plugin: Git ───────────────────────────────────────────────────────────────

function GitRepoStep({ values, setFieldValue }: { values: FormValues; setFieldValue: SetFieldValue }) {
  const kind = values.sourceKind
  const label = kind === 'github' ? 'GitHub' : kind === 'gitlab' ? 'GitLab' : 'Bitbucket'
  const addVar    = () => setFieldValue('envVars', [...values.envVars, { key: '', value: '', secret: false }])
  const removeVar = (i: number) => setFieldValue('envVars', values.envVars.filter((_, idx) => idx !== i))
  const updateVar = (i: number, field: keyof EnvVar, val: unknown) =>
    setFieldValue('envVars', values.envVars.map((v, idx) => idx === i ? { ...v, [field]: val } : v))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-2xl border border-tundra-ink-200 bg-white px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-tundra-ink">Auto-deploy on push</p>
          <p className="mt-0.5 text-xs text-tundra-ink-400">
            Deploy when code is pushed to <code className="rounded bg-tundra-ink-100 px-1 font-mono">{values.branch || 'main'}</code>
          </p>
        </div>
        <Switch checked={values.gitAutoDeploy} onChange={(v) => setFieldValue('gitAutoDeploy', v)} />
      </div>
      <div className="rounded-2xl border border-tundra-ink-200 bg-tundra-ink-50/50 p-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-500">{label} setup</p>
        <p className="text-sm text-tundra-ink-500">After site creation, add a <strong>deploy key</strong> to your repository so Tundra can pull code.</p>
        <div className="flex flex-col gap-2 text-xs text-tundra-ink-500">
          {[
            `Go to Repository → Settings → Deploy keys`,
            'Add the deploy key shown on the site detail page after creation',
            ...(values.gitAutoDeploy ? ['Add the webhook URL from the site detail page to your repository'] : []),
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-tundra-lichen text-white text-[9px] font-bold">{i + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className={LABEL}>Environment Variables <span className="font-normal text-tundra-ink-400 ml-1">optional</span></p>
        <p className={HINT}>Written to <code className="font-mono">.env</code> on the server during deployment.</p>
        <div className="mt-3 space-y-2">
          {values.envVars.map((ev, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="text" value={ev.key} onChange={(e) => updateVar(i, 'key', e.target.value.toUpperCase())} placeholder="KEY" className={`${INPUT} w-40 font-mono text-xs`} />
              <input type={ev.secret ? 'password' : 'text'} value={ev.value} onChange={(e) => updateVar(i, 'value', e.target.value)} placeholder="value" className={`${INPUT} flex-1 font-mono text-xs`} />
              <button type="button" onClick={() => updateVar(i, 'secret', !ev.secret)} className={`rounded-xl border px-2.5 py-2 transition-colors ${ev.secret ? 'border-tundra-aurora-300 bg-tundra-aurora-50 text-tundra-aurora-700' : 'border-tundra-ink-200 text-tundra-ink-400 hover:border-tundra-aurora-300'}`}>{ev.secret ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}</button>
              <button type="button" onClick={() => removeVar(i)} className="rounded-xl border border-tundra-ink-200 p-2 text-tundra-ink-400 hover:border-red-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addVar} className="mt-3 text-sm font-semibold text-tundra-lichen hover:underline">+ Add variable</button>
      </div>
    </div>
  )
}

const gitPlugin: WizardPlugin = {
  id: 'git',
  matches: (sourceKind) => ['github', 'gitlab', 'bitbucket'].includes(sourceKind),
  step: { label: 'Repository', desc: 'Git repository and deploy settings' },
  schema: Yup.object({}) as Yup.ObjectSchema<Record<string, unknown>>,
  Component: GitRepoStep,
}

const WIZARD_PLUGINS: WizardPlugin[] = [wpPlugin, phpConfigPlugin, nodeConfigPlugin, pythonConfigPlugin, gitPlugin, envVarsPlugin]

// ── Runtime constants ─────────────────────────────────────────────────────────

type RuntimeKind = 'static' | 'php' | 'laravel' | 'nodejs' | 'python' | 'go' | 'ruby' | 'dotnet'

const RUNTIME_HINTS: Record<RuntimeKind, {
  label: string; versionGroups: VersionGroup[]
  buildHint: string; startHint: string; portHint: string; hasPort: boolean; icon: React.ReactNode
}> = {
  static:  { label: 'Static',  versionGroups: [],            buildHint: '',                                                  startHint: '',                                    portHint: '',     hasPort: false, icon: <Globe       size={16} /> },
  php:     { label: 'PHP',     versionGroups: [],            buildHint: 'composer install --no-dev',                         startHint: '',                                    portHint: '',     hasPort: false, icon: <PhpIcon     size={16} /> },
  laravel: { label: 'Laravel', versionGroups: [],            buildHint: 'composer install --no-dev && php artisan optimize', startHint: '',                                    portHint: '',     hasPort: false, icon: <LaravelIcon size={16} /> },
  nodejs:  { label: 'Node.js', versionGroups: NODE_GROUPS,  buildHint: 'npm ci && npm run build',                          startHint: 'node dist/index.js',                  portHint: '3000', hasPort: true,  icon: <NodejsIcon  size={16} /> },
  python:  { label: 'Python',  versionGroups: PYTHON_GROUPS,buildHint: 'pip install -r requirements.txt',                  startHint: 'gunicorn app:app -b 0.0.0.0:$PORT',   portHint: '8000', hasPort: true,  icon: <PythonIcon  size={16} /> },
  go:      { label: 'Go',      versionGroups: GO_GROUPS,    buildHint: 'go build -o app .',                                startHint: './app',                               portHint: '8080', hasPort: true,  icon: <GoIcon      size={16} /> },
  ruby:    { label: 'Ruby',    versionGroups: RUBY_GROUPS,  buildHint: 'bundle install',                                   startHint: 'bundle exec puma -C config/puma.rb',  portHint: '3000', hasPort: true,  icon: <RubyIcon    size={16} /> },
  dotnet:  { label: '.NET',    versionGroups: DOTNET_GROUPS,buildHint: 'dotnet publish -c Release -o out',                 startHint: 'dotnet out/App.dll',                  portHint: '5000', hasPort: true,  icon: <DotnetIcon  size={16} /> },
}

// ── Base schemas ──────────────────────────────────────────────────────────────

const SCHEMA_SOURCE = Yup.object({
  sourceKind: Yup.string().oneOf(['github', 'gitlab', 'bitbucket', 'blank', 'template', 'zip', 'wordpress']).required(),
  branch: Yup.string().when('sourceKind', {
    is: (k: string) => ['github', 'gitlab', 'bitbucket'].includes(k),
    then: (s) => s.required('Branch is required'),
    otherwise: (s) => s.optional(),
  }),
})
const SCHEMA_APP = Yup.object({
  kind: Yup.string().required('Application type is required'),
  runtimeVersion: Yup.string().when('kind', {
    is: (k: string) => k !== 'static',
    then: (s) => s.required('Runtime version is required'),
    otherwise: (s) => s.optional(),
  }),
})
const SCHEMA_DOMAIN = Yup.object({
  domain: Yup.string().required('Domain is required').matches(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, 'Enter a valid domain (e.g. example.com)'),
  serverId: Yup.string().required('Select a server'),
})
const SCHEMA_REVIEW = Yup.object({})

// ── Step 1: Source ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-tundra-ink-400">{children}</p>
}

type SourceKind = FormValues['sourceKind']

interface SourceCard {
  id: SourceKind; label: string; badge?: string; desc: string
  icon: React.ReactNode; color: string; bg: string
}

const SOURCE_GROUPS: Array<{ label: string; cards: SourceCard[] }> = [
  {
    label: 'New application',
    cards: [
      { id: 'blank', label: 'Blank site', desc: 'Empty document root — start from scratch',
        icon: <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path d="M9 12h6m-3-3v6M3 12a9 9 0 1018 0 9 9 0 00-18 0z" strokeLinecap="round"/></svg>,
        color: 'border-tundra-ink-200 hover:border-tundra-lichen', bg: 'bg-white' },
      { id: 'wordpress', label: 'WordPress', badge: 'Direct', desc: 'Install WordPress — skip the template picker',
        icon: <WordpressIcon size={28} />,
        color: 'border-blue-200 hover:border-blue-400', bg: 'bg-blue-50/50' },
      { id: 'template', label: 'Template', badge: 'Popular', desc: 'WooCommerce, Laravel, Next.js and more…',
        icon: <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm12-1a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/></svg>,
        color: 'border-tundra-lichen/40 hover:border-tundra-lichen', bg: 'bg-tundra-lichen/5' },
    ],
  },
  {
    label: 'From repository',
    cards: [
      { id: 'github', label: 'GitHub', desc: 'Deploy from a GitHub repository',
        icon: <GithubIcon size={28} />,
        color: 'border-tundra-ink-200 hover:border-tundra-lichen', bg: 'bg-white' },
      { id: 'gitlab', label: 'GitLab', desc: 'Deploy from a GitLab repository',
        icon: <GitlabIcon size={28} />,
        color: 'border-orange-200 hover:border-orange-400', bg: 'bg-orange-50/30' },
      { id: 'bitbucket', label: 'Bitbucket', desc: 'Deploy from a Bitbucket repository',
        icon: <BitbucketIcon size={28} />,
        color: 'border-blue-200 hover:border-blue-400', bg: 'bg-blue-50/30' },
    ],
  },
  {
    label: 'Import',
    cards: [
      { id: 'zip', label: 'ZIP upload', desc: 'Upload a ZIP archive of your site files',
        icon: <Upload size={28} />,
        color: 'border-tundra-ink-200 hover:border-tundra-lichen', bg: 'bg-white' },
    ],
  },
]

function SourceStep({
  values, setFieldValue, allTemplates, pickedTemplateId, setPickedTemplateId, setValues,
  onSourceKindChange, zipFileRef,
}: {
  values: FormValues; setFieldValue: SetFieldValue; allTemplates: TemplateManifest[]
  pickedTemplateId: string | undefined; setPickedTemplateId: (id: string | undefined) => void
  setValues: (fn: (prev: FormValues) => FormValues) => void; onSourceKindChange: (kind: SourceKind) => void
  zipFileRef: React.MutableRefObject<File | null>
}) {
  const [tmplSearch, setTmplSearch] = useState('')
  const [tmplCategory, setTmplCategory] = useState('all')

  const categories = useMemo(() => {
    const cats = new Set<string>()
    allTemplates.forEach((t) => t.tags.forEach((tag) => cats.add(tag)))
    return ['all', ...Array.from(cats)]
  }, [allTemplates])

  const filteredTmpls = useMemo(() =>
    allTemplates.filter((t) => {
      if (tmplCategory !== 'all' && !t.tags.includes(tmplCategory)) return false
      if (tmplSearch && !t.name.toLowerCase().includes(tmplSearch.toLowerCase())) return false
      return true
    }),
    [allTemplates, tmplSearch, tmplCategory],
  )

  const handleSourceClick = (id: SourceKind) => {
    setFieldValue('sourceKind', id)
    onSourceKindChange(id)
    if (id !== 'template') setPickedTemplateId(undefined)
    if (id === 'wordpress') {
      setValues((prev) => ({ ...prev, sourceKind: id, kind: 'php', runtimeVersion: '8.3' }))
    } else {
      setValues((prev) => ({ ...prev, sourceKind: id }))
    }
  }

  return (
    <div className="space-y-7">
      {SOURCE_GROUPS.map((group) => (
        <div key={group.label}>
          <SectionLabel>{group.label}</SectionLabel>
          <div className={`grid gap-3 ${group.cards.length === 1 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-3'}`}>
            {group.cards.map((src) => {
              const active = values.sourceKind === src.id
              const activeBadgeOnTop = src.badge && !active
              return (
                <button key={src.id} type="button" onClick={() => handleSourceClick(src.id)}
                  className={[
                    'relative flex flex-col items-start gap-2.5 rounded-2xl border p-4 text-left transition-all duration-150',
                    active
                      ? 'border-tundra-lichen bg-tundra-lichen/5 ring-2 ring-tundra-lichen/20 shadow-sm'
                      : `${src.color} ${src.bg}`,
                  ].join(' ')}
                >
                  {activeBadgeOnTop && (
                    <span className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${src.badge === 'Popular' ? 'bg-tundra-lichen' : 'bg-blue-500'}`}>
                      {src.badge}
                    </span>
                  )}
                  {active && (
                    <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-tundra-lichen text-white">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
                    </span>
                  )}
                  <span className={active ? 'text-tundra-lichen' : 'text-tundra-ink-500'}>{src.icon}</span>
                  <div>
                    <p className={`font-semibold text-sm ${active ? 'text-tundra-lichen-700' : 'text-tundra-ink'}`}>{src.label}</p>
                    <p className="mt-0.5 text-xs text-tundra-ink-400 leading-relaxed">{src.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* Git inputs */}
      {['github', 'gitlab', 'bitbucket'].includes(values.sourceKind) && (
        <div className="rounded-2xl border border-tundra-ink-200 bg-white p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className={LABEL}>Repository URL</label>
              <input type="url" value={values.repoUrl} onChange={(e) => setFieldValue('repoUrl', e.target.value)}
                placeholder={
                  values.sourceKind === 'github' ? 'https://github.com/user/repo' :
                  values.sourceKind === 'gitlab' ? 'https://gitlab.com/user/repo' :
                  'https://bitbucket.org/user/repo'
                }
                className={INPUT} />
              <p className={HINT}>HTTPS or SSH URL of the repository</p>
            </div>
            <div>
              <label className={LABEL}>Branch</label>
              <input type="text" value={values.branch} onChange={(e) => setFieldValue('branch', e.target.value)} placeholder="main" className={INPUT} />
              <ErrorMessage name="branch" component="p" className="mt-1 text-xs text-red-500" />
            </div>
          </div>
        </div>
      )}

      {/* ZIP file input */}
      {values.sourceKind === 'zip' && (
        <div className="rounded-2xl border border-tundra-ink-200 bg-white p-5">
          <label className={LABEL}>ZIP Archive</label>
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-tundra-ink-200 py-8 transition-colors hover:border-tundra-lichen hover:bg-tundra-lichen/5">
            <Upload size={28} className="text-tundra-ink-400" />
            <span className="text-sm text-tundra-ink-500">
              {zipFileRef.current ? (
                <><span className="font-semibold text-tundra-ink">{zipFileRef.current.name}</span> · {(zipFileRef.current.size / 1024 / 1024).toFixed(1)} MB</>
              ) : (
                <>Click or drag to upload a <strong>.zip</strong> file</>
              )}
            </span>
            <input type="file" accept=".zip" className="sr-only"
              onChange={(e) => {
                zipFileRef.current = e.target.files?.[0] ?? null
                setFieldValue('__zipTrigger', Date.now())
              }} />
          </label>
          <p className={HINT}>The ZIP will be extracted to the document root after site creation.</p>
        </div>
      )}

      {/* Template gallery */}
      {values.sourceKind === 'template' && (
        <div>
          <SectionLabel>Choose a template</SectionLabel>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative">
              <svg className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input type="search" placeholder="Search templates…" value={tmplSearch} onChange={(e) => setTmplSearch(e.target.value)}
                className="h-8 w-44 rounded-xl border border-tundra-ink-200 bg-white pl-8 pr-3 text-xs focus:border-tundra-lichen focus:outline-none" />
            </div>
            <div className="flex flex-wrap gap-1">
              {categories.map((cat) => (
                <button key={cat} type="button" onClick={() => setTmplCategory(cat)}
                  className={`rounded-full border px-3 py-0.5 text-xs font-medium capitalize transition-colors ${tmplCategory === cat ? 'border-tundra-lichen bg-tundra-lichen text-white' : 'border-tundra-ink-200 text-tundra-ink-500 hover:border-tundra-lichen'}`}
                >{cat}</button>
              ))}
            </div>
          </div>
          {allTemplates.length === 0 ? (
            <div className="flex h-36 items-center justify-center rounded-2xl border border-tundra-ink-200 bg-tundra-ink-50/50">
              <p className="animate-pulse text-sm text-tundra-ink-400">Loading templates…</p>
            </div>
          ) : filteredTmpls.length === 0 ? (
            <div className="flex h-36 items-center justify-center rounded-2xl border border-tundra-ink-200">
              <p className="text-sm text-tundra-ink-400">No templates match.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTmpls.map((tmpl) => {
                const isPicked = pickedTemplateId === tmpl.id
                return (
                  <button key={tmpl.id} type="button"
                    onClick={() => {
                      setPickedTemplateId(tmpl.id)
                      setValues((prev) => ({
                        ...prev, sourceKind: 'template', kind: tmpl.runtime.kind,
                        runtimeVersion: tmpl.runtime.version ?? '',
                        buildCommand: tmpl.build_command ?? '',
                        startCommand: tmpl.start_command ?? '',
                        listenPort: tmpl.listen_port != null ? String(tmpl.listen_port) : '',
                      }))
                    }}
                    className={`relative rounded-2xl border p-4 text-left transition-all duration-150 ${isPicked ? 'border-tundra-lichen bg-tundra-lichen/5 ring-2 ring-tundra-lichen/20 shadow-sm' : 'border-tundra-ink-200 bg-white hover:border-tundra-lichen hover:shadow-sm'}`}
                  >
                    {isPicked && (
                      <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-tundra-lichen text-white">
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
                      </span>
                    )}
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-tundra-ink-400">{RUNTIME_HINTS[tmpl.runtime.kind as RuntimeKind]?.icon ?? <Package className="h-4 w-4" />}</span>
                      <p className="font-semibold text-sm text-tundra-ink leading-tight">{tmpl.name}</p>
                    </div>
                    {tmpl.tags[0] && (
                      <span className="mb-2 inline-block rounded-lg border border-tundra-ink-100 bg-tundra-ink-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-tundra-ink-400">{tmpl.tags[0]}</span>
                    )}
                    <p className="line-clamp-2 text-xs text-tundra-ink-400 leading-relaxed">{tmpl.description}</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Step 2: Application ───────────────────────────────────────────────────────

function useLivePhpVersions(): { groups: VersionGroup[]; loading: boolean } {
  const { data, isLoading } = useQuery<string[]>({
    queryKey: ['php-net-releases'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/v1/proxy/php-releases', { credentials: 'include' })
        if (!res.ok) throw new Error()
        const raw = await res.json() as Record<string, unknown>
        const sorted = Object.keys(raw).sort((a, b) => {
          const pa = a.split('.').map(Number)
          const pb = b.split('.').map(Number)
          for (let i = 0; i < 3; i++) { const d = (pb[i] ?? 0) - (pa[i] ?? 0); if (d !== 0) return d }
          return 0
        })
        return sorted.length >= 6 ? sorted : PHP_FALLBACK
      } catch {
        return PHP_FALLBACK
      }
    },
    staleTime: 1000 * 60 * 10,
  })
  const groups = useMemo(() => groupByBranch(data ?? PHP_FALLBACK), [data])
  return { groups, loading: isLoading }
}

function AppStep({ values, setFieldValue, onRuntimeKindChange, selectedTemplate }: {
  values: FormValues; setFieldValue: SetFieldValue
  onRuntimeKindChange: (kind: string) => void
  selectedTemplate: TemplateManifest | undefined
}) {
  const hints       = (RUNTIME_HINTS as Record<string, (typeof RUNTIME_HINTS)[RuntimeKind]>)[values.kind] ?? RUNTIME_HINTS.static
  const isWordpress = values.sourceKind === 'wordpress'
  const isTemplate  = values.sourceKind === 'template' && !!selectedTemplate
  const isLocked    = isWordpress || isTemplate
  const isPhp       = values.kind === 'php' || values.kind === 'laravel'
  const { groups: phpGroups, loading: phpLoading } = useLivePhpVersions()

  const versionGroups = isPhp ? phpGroups : hints.versionGroups
  const hasVersions   = versionGroups.length > 0

  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>Application type</SectionLabel>
        {/* Lock banner */}
        {isLocked && (
          <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-tundra-ink-200 bg-tundra-ink-50/70 px-4 py-2.5">
            <svg className="h-4 w-4 shrink-0 text-tundra-ink-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            <p className="text-xs text-tundra-ink-500">
              {isWordpress
                ? 'Runtime locked to PHP by WordPress.'
                : <>Runtime locked to <strong className="text-tundra-ink">{hints.label}</strong> by template <strong className="text-tundra-ink">{selectedTemplate?.name}</strong>.</>}
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(RUNTIME_HINTS) as RuntimeKind[]).map((rt) => {
            const h = RUNTIME_HINTS[rt]; const active = values.kind === rt
            const locked = isLocked && !active
            return (
              <button key={rt} type="button"
                onClick={() => {
                  if (isLocked) return
                  const firstVer = rt === 'php' || rt === 'laravel' ? phpGroups[0]?.versions[0] ?? '' : (RUNTIME_HINTS[rt].versionGroups[0]?.versions[0] ?? '')
                  setFieldValue('kind', rt)
                  setFieldValue('runtimeVersion', firstVer)
                  onRuntimeKindChange(rt)
                }}
                className={[
                  'flex items-center gap-2.5 rounded-xl border px-3 py-3 transition-all duration-150',
                  active
                    ? 'border-tundra-lichen bg-tundra-lichen/5 ring-2 ring-tundra-lichen/20 shadow-sm'
                    : 'border-tundra-ink-200 bg-white hover:border-tundra-lichen hover:bg-tundra-ink-50/50',
                  locked ? 'opacity-35 cursor-not-allowed' : '',
                ].join(' ')}
                disabled={locked}
              >
                <span className={active ? 'text-tundra-lichen' : 'text-tundra-ink-400'}>{h.icon}</span>
                <span className={`text-sm font-semibold ${active ? 'text-tundra-lichen-700' : 'text-tundra-ink'}`}>{h.label}</span>
              </button>
            )
          })}
        </div>
        <ErrorMessage name="kind" component="p" className="mt-2 text-xs text-red-500" />
      </div>

      {values.kind !== 'static' && hasVersions && (
        <div>
          <label className={LABEL}>Runtime version</label>
          <VersionSelect
            value={values.runtimeVersion}
            onChange={(v) => setFieldValue('runtimeVersion', v)}
            groups={versionGroups}
            placeholder={`Select ${hints.label} version`}
            loading={isPhp && phpLoading}
            allowCustom
          />
          <ErrorMessage name="runtimeVersion" component="p" className="mt-1 text-xs text-red-500" />
        </div>
      )}

      <div>
        <label className={LABEL}>Build command <span className="ml-1 text-xs font-normal text-tundra-ink-400">optional</span></label>
        <input type="text" value={values.buildCommand} onChange={(e) => setFieldValue('buildCommand', e.target.value)} placeholder={hints.buildHint || 'e.g. npm ci && npm run build'} className={`${INPUT} font-mono text-xs`} />
        <p className={HINT}>Runs once during deployment to compile assets or install dependencies.</p>
      </div>

      {hints.hasPort && (
        <>
          <div>
            <label className={LABEL}>Start command</label>
            <input type="text" value={values.startCommand} onChange={(e) => setFieldValue('startCommand', e.target.value)} placeholder={hints.startHint} className={`${INPUT} font-mono text-xs`} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL}>Listen port</label>
              <input type="text" value={values.listenPort} onChange={(e) => setFieldValue('listenPort', e.target.value)} placeholder={hints.portHint} className={`${INPUT} font-mono`} />
            </div>
            <div>
              <label className={LABEL}>Health check path</label>
              <input type="text" value={values.healthCheckPath} onChange={(e) => setFieldValue('healthCheckPath', e.target.value)} placeholder="/" className={`${INPUT} font-mono`} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Step 3: Domain & Server ───────────────────────────────────────────────────

function DomainStep({ values, setFieldValue, servers }: { values: FormValues; setFieldValue: SetFieldValue; servers: Server[] }) {
  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>Domain</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Primary domain</label>
            <input type="text" value={values.domain}
              onChange={(e) => { const v = e.target.value.toLowerCase().trim(); setFieldValue('domain', v); if (!values.name) setFieldValue('name', v) }}
              placeholder="example.com" className={INPUT} autoComplete="off" spellCheck={false} />
            <ErrorMessage name="domain" component="p" className="mt-1 text-xs text-red-500" />
            <p className={HINT}>Must be a domain you control and can point DNS to this server.</p>
          </div>
          <div>
            <label className={LABEL}>Display name <span className="ml-1 text-xs font-normal text-tundra-ink-400">optional</span></label>
            <input type="text" value={values.name} onChange={(e) => setFieldValue('name', e.target.value)} placeholder={values.domain || 'My Site'} className={INPUT} />
            <p className={HINT}>Shown in lists and dashboards. Defaults to the domain.</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-tundra-ink-200 bg-white px-5 py-4 transition-colors hover:border-tundra-lichen/30">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tundra-lichen/10">
            <svg className="h-4.5 w-4.5 text-tundra-lichen-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-tundra-ink">Enable SSL / HTTPS</p>
            <p className="text-xs text-tundra-ink-400">Automatically issues a free Let's Encrypt certificate</p>
          </div>
        </div>
        <Switch checked={values.enableSsl} onChange={(v) => setFieldValue('enableSsl', v)} />
      </div>

      <div>
        <SectionLabel>Server</SectionLabel>
        <ErrorMessage name="serverId" component="p" className="mb-2 text-xs text-red-500" />
        {servers.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-tundra-ink-200 p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-tundra-ink-100">
              <svg className="h-6 w-6 text-tundra-ink-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
            </div>
            <p className="font-medium text-tundra-ink">No servers enrolled yet</p>
            <p className="mt-1 text-sm text-tundra-ink-400">You need at least one server to deploy to.</p>
            <Link to="/servers" className="mt-3 inline-flex items-center gap-1 rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">Enroll a server →</Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {servers.map((srv) => {
              const active = values.serverId === srv.id
              return (
                <button key={srv.id} type="button" onClick={() => setFieldValue('serverId', srv.id)}
                  className={['relative rounded-2xl border p-4 text-left transition-all duration-150', active ? 'border-tundra-lichen bg-tundra-lichen/5 ring-2 ring-tundra-lichen/20 shadow-sm' : 'border-tundra-ink-200 bg-white hover:border-tundra-lichen hover:shadow-sm'].join(' ')}
                >
                  {active && (
                    <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-tundra-lichen text-white">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
                    </span>
                  )}
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-tundra-lichen/15' : 'bg-tundra-ink-100'}`}>
                      <svg className={`h-4 w-4 ${active ? 'text-tundra-lichen-700' : 'text-tundra-ink-400'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                    </div>
                    <p className="font-semibold text-sm text-tundra-ink">{srv.name}</p>
                  </div>
                  <p className="font-mono text-xs text-tundra-ink-400">{srv.hostname}</p>
                  {srv.os && <p className="mt-0.5 text-xs text-tundra-ink-400">{srv.os}</p>}
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${srv.status === 'active' ? 'bg-tundra-lichen' : 'bg-tundra-ink-300'}`} />
                    <span className="text-xs capitalize text-tundra-ink-500 font-medium">{srv.status}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Step: Review ──────────────────────────────────────────────────────────────

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-4 py-2.5 px-4 text-sm">
      <span className="w-28 shrink-0 text-tundra-ink-400">{label}</span>
      <span className={`flex-1 ${mono ? 'font-mono text-xs' : ''} text-tundra-ink`}>{value}</span>
    </div>
  )
}

function ReviewSection({ title, icon, rows, tint }: {
  title: string; icon: React.ReactNode
  rows: Array<{ label: string; value: string; mono?: boolean }>; tint?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-tundra-ink-200 bg-white">
      <div className={`flex items-center gap-2.5 border-b border-tundra-ink-100 px-4 py-3 ${tint ? 'bg-tundra-lichen/5' : 'bg-tundra-ink-50/70'}`}>
        <span className={tint ? 'text-tundra-lichen-700' : 'text-tundra-ink-500'}>{icon}</span>
        <span className={`text-xs font-bold uppercase tracking-widest ${tint ? 'text-tundra-lichen-700' : 'text-tundra-ink-500'}`}>{title}</span>
      </div>
      <div className="divide-y divide-tundra-ink-50">{rows.map((r) => <ReviewRow key={r.label} {...r} />)}</div>
    </div>
  )
}

function ReviewStep({ values, servers, selectedTemplate, activePlugins, zipFile }: {
  values: FormValues; servers: Server[]
  selectedTemplate: TemplateManifest | undefined; activePlugins: WizardPlugin[]
  zipFile: File | null
}) {
  const server   = servers.find((s) => s.id === values.serverId)
  const hints    = (RUNTIME_HINTS as Record<string, (typeof RUNTIME_HINTS)[RuntimeKind]>)[values.kind] ?? RUNTIME_HINTS.static
  const hasWp    = activePlugins.some((p) => p.id === 'wordpress')
  const hasGit   = activePlugins.some((p) => p.id === 'git')
  const hasEnv   = activePlugins.some((p) => p.id === 'env_vars')
  const hasPhp   = activePlugins.some((p) => p.id === 'php_config')
  const hasNode  = activePlugins.some((p) => p.id === 'node_config')
  const hasPy    = activePlugins.some((p) => p.id === 'python_config')
  const filledEnvVars = values.envVars.filter((v) => v.key)

  const sourceLabel =
    values.sourceKind === 'wordpress' ? 'WordPress (direct)' :
    values.sourceKind === 'template' && selectedTemplate ? `Template: ${selectedTemplate.name}` :
    values.sourceKind === 'blank' ? 'Blank site' :
    values.sourceKind === 'zip' ? `ZIP: ${zipFile?.name ?? 'uploaded file'}` :
    `${values.sourceKind}: ${values.repoUrl || '—'} @ ${values.branch}`

  const gitIcon = values.sourceKind === 'github' ? <GithubIcon size={14} /> : values.sourceKind === 'gitlab' ? <GitlabIcon size={14} /> : <BitbucketIcon size={14} />
  const gitLabel = values.sourceKind === 'github' ? 'GitHub' : values.sourceKind === 'gitlab' ? 'GitLab' : 'Bitbucket'

  const timelineSteps: Array<{ icon: React.ReactNode; label: string; time: string }> = hasWp
    ? [
        { icon: <Database className="h-3.5 w-3.5" />, label: 'MySQL database and user created', time: '~5s' },
        { icon: <FolderOpen className="h-3.5 w-3.5" />, label: 'Document root provisioned on server', time: '~10s' },
        { icon: <Download className="h-3.5 w-3.5" />, label: 'WordPress core downloaded via WP-CLI', time: '~30s' },
        { icon: <Settings2 className="h-3.5 w-3.5" />, label: 'WordPress configured and installed', time: '~45s' },
        { icon: <ShieldCheck className="h-3.5 w-3.5" />, label: values.enableSsl ? 'SSL certificate issued' : 'Nginx configured', time: '~1min' },
        { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'WordPress site live', time: '~2min' },
      ]
    : hasGit
    ? [
        { icon: <Key className="h-3.5 w-3.5" />, label: 'Deploy key generated', time: '~5s' },
        { icon: <FolderOpen className="h-3.5 w-3.5" />, label: 'Document root provisioned', time: '~10s' },
        { icon: <Download className="h-3.5 w-3.5" />, label: 'Code cloned from repository', time: '~20s' },
        { icon: <Settings2 className="h-3.5 w-3.5" />, label: values.buildCommand ? 'Build command executed' : 'Files deployed', time: '~30s' },
        { icon: <ShieldCheck className="h-3.5 w-3.5" />, label: values.enableSsl ? 'SSL certificate issued' : 'Nginx configured', time: '~45s' },
        { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'Site goes live', time: '~1min' },
      ]
    : [
        { icon: <FolderOpen className="h-3.5 w-3.5" />, label: 'Document root provisioned', time: '~10s' },
        { icon: <Settings2 className="h-3.5 w-3.5" />, label: values.buildCommand ? 'Build command executed' : 'Files synced', time: '~20s' },
        { icon: <ShieldCheck className="h-3.5 w-3.5" />, label: values.enableSsl ? 'SSL certificate issued' : 'Nginx configured', time: '~30s' },
        { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'Site goes live', time: '~45s' },
      ]

  return (
    <div className="space-y-4">
      <ReviewSection title="Deployment" icon={<Globe size={14} />} rows={[
        { label: 'Domain',   value: values.domain },
        { label: 'Name',     value: values.name || values.domain },
        { label: 'Server',   value: server ? `${server.name} (${server.hostname})` : '—' },
        { label: 'Source',   value: sourceLabel },
        { label: 'Runtime',  value: hints.label + (values.runtimeVersion ? ` ${values.runtimeVersion}` : '') },
        ...(values.buildCommand ? [{ label: 'Build',  value: values.buildCommand,  mono: true }] : []),
        ...(values.startCommand ? [{ label: 'Start',  value: values.startCommand,  mono: true }] : []),
        ...(values.listenPort   ? [{ label: 'Port',   value: values.listenPort }] : []),
        { label: 'SSL', value: values.enableSsl ? "Let's Encrypt (auto)" : 'Disabled' },
      ]} />

      {hasWp && (
        <ReviewSection title="WordPress" icon={<WordpressIcon size={14} />} tint rows={[
          { label: 'Version',    value: values.wpVersion || 'latest' },
          { label: 'Site title', value: values.wpSiteTitle },
          { label: 'Admin user', value: values.wpAdminUser },
          { label: 'Admin email',value: values.wpAdminEmail },
          { label: 'Password',   value: '••••••••' },
        ]} />
      )}

      {hasPhp && (
        <ReviewSection title="PHP Config" icon={<PhpIcon size={14} />} rows={[
          { label: 'Extensions', value: values.phpExtensions.join(', ') || '(none)' },
          { label: 'Memory',     value: values.phpMemoryLimit },
          { label: 'Max exec',   value: `${values.phpMaxExec}s` },
          { label: 'OPcache',    value: values.phpOpcache ? 'Enabled' : 'Disabled' },
        ]} />
      )}

      {hasNode && (
        <ReviewSection title="Node Config" icon={<NodejsIcon size={14} />} rows={[
          { label: 'Package mgr', value: values.packageManager },
          { label: 'NODE_ENV',    value: values.nodeEnv },
        ]} />
      )}

      {hasPy && (
        <ReviewSection title="Python Config" icon={<PythonIcon size={14} />} rows={[
          { label: 'WSGI server',   value: values.wsgiServer },
          { label: 'Requirements', value: values.pythonRequirementsFile || 'requirements.txt' },
        ]} />
      )}

      {hasGit && (
        <ReviewSection title={gitLabel} icon={gitIcon} rows={[
          { label: 'Repository',  value: values.repoUrl || '—', mono: true },
          { label: 'Branch',      value: values.branch || 'main', mono: true },
          { label: 'Auto-deploy', value: values.gitAutoDeploy ? 'Enabled' : 'Disabled' },
        ]} />
      )}

      {(hasEnv || (hasGit && filledEnvVars.length > 0)) && filledEnvVars.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-tundra-ink-200 bg-white">
          <div className="flex items-center gap-2.5 border-b border-tundra-ink-100 bg-tundra-ink-50/70 px-4 py-3">
            <span className="text-xs font-bold uppercase tracking-widest text-tundra-ink-500">Environment ({filledEnvVars.length})</span>
          </div>
          <div className="divide-y divide-tundra-ink-50">
            {filledEnvVars.map((ev) => (
              <div key={ev.key} className="flex items-center gap-4 px-4 py-2.5">
                <span className="w-40 shrink-0 font-mono text-xs text-tundra-ink">{ev.key}</span>
                <span className="flex-1 font-mono text-xs text-tundra-ink-400">{ev.secret ? '••••••••' : ev.value || '(empty)'}</span>
                {ev.secret && <span className="rounded-lg border border-tundra-aurora-300 bg-tundra-aurora-50 px-2 py-0.5 text-[10px] font-semibold text-tundra-aurora-700">secret</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-2xl border border-tundra-ink-200 bg-white overflow-hidden">
        <div className="border-b border-tundra-ink-100 bg-tundra-ink-50/70 px-4 py-3">
          <span className="text-xs font-bold uppercase tracking-widest text-tundra-ink-500">What happens next</span>
        </div>
        <div className="p-4 space-y-0">
          {timelineSteps.map(({ icon, label, time }, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-tundra-ink-200 bg-white text-tundra-ink-500">{icon}</div>
                {i < timelineSteps.length - 1 && <div className="h-5 w-px bg-tundra-ink-200" />}
              </div>
              <div className="flex flex-1 items-center justify-between pb-1">
                <span className="text-sm text-tundra-ink-600">{label}</span>
                <span className="text-xs text-tundra-ink-300 font-mono">{time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Sidebar summary ───────────────────────────────────────────────────────────

function SidebarSummary({ values, step, servers, selectedTemplate, steps, activePlugins, zipFile }: {
  values: FormValues; step: number; servers: Server[]
  selectedTemplate: TemplateManifest | undefined
  steps: Array<{ id: number; label: string; desc: string }>
  activePlugins: WizardPlugin[]
  zipFile: File | null
}) {
  const server = servers.find((s) => s.id === values.serverId)
  const hints  = (RUNTIME_HINTS as Record<string, (typeof RUNTIME_HINTS)[RuntimeKind]>)[values.kind] ?? RUNTIME_HINTS.static

  const items: Array<{ icon: React.ReactNode; label: string; value: string }> = [
    values.domain && { icon: <Globe size={13} />, label: 'Domain', value: values.domain },
    values.sourceKind === 'wordpress' && { icon: <WordpressIcon size={13} />, label: 'Source', value: 'WordPress (direct)' },
    (values.sourceKind === 'template' && selectedTemplate) && { icon: <Package size={13} />, label: 'Template', value: selectedTemplate.name },
    (['github', 'gitlab', 'bitbucket'].includes(values.sourceKind) && values.repoUrl) && {
      icon: values.sourceKind === 'github' ? <GithubIcon size={13} /> : values.sourceKind === 'gitlab' ? <GitlabIcon size={13} /> : <BitbucketIcon size={13} />,
      label: 'Repo', value: values.repoUrl.split('/').slice(-2).join('/'),
    },
    values.sourceKind === 'blank' && { icon: <Globe size={13} />, label: 'Source', value: 'Blank site' },
    values.sourceKind === 'zip' && zipFile && { icon: <Upload size={13} />, label: 'ZIP', value: zipFile.name },
    step >= 1 && { icon: <Settings2 size={13} />, label: 'Runtime', value: hints.label + (values.runtimeVersion ? ` ${values.runtimeVersion}` : '') },
    step >= 2 && server && { icon: <Database size={13} />, label: 'Server', value: server.name },
    step >= 2 && { icon: <ShieldCheck size={13} />, label: 'SSL', value: values.enableSsl ? 'Enabled' : 'Disabled' },
    (activePlugins.some((p) => p.id === 'wordpress') && values.wpSiteTitle) && { icon: <WordpressIcon size={13} />, label: 'WP title', value: values.wpSiteTitle },
  ].filter(Boolean) as Array<{ icon: React.ReactNode; label: string; value: string }>

  return (
    <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 gap-3">
      <div className="sticky top-6 rounded-2xl border border-tundra-ink-200 bg-white overflow-hidden">
        <div className="border-b border-tundra-ink-100 bg-tundra-ink-50/70 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-tundra-ink-400">Summary</p>
        </div>
        <div className="p-4">
          {items.length === 0 ? (
            <p className="text-xs text-tundra-ink-300 italic">Fill in the steps to see a live summary.</p>
          ) : (
            <div className="space-y-3">
              {items.map(({ icon, label, value }) => (
                <div key={label} className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0 text-tundra-ink-400">{icon}</span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-tundra-ink-300">{label}</p>
                    <p className="text-xs font-medium text-tundra-ink break-all leading-snug">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-tundra-ink-100 px-4 py-3">
          <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-tundra-ink-400">Steps</p>
          <div className="space-y-1.5">
            {steps.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <div className={[
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold transition-all',
                  s.id < step ? 'bg-tundra-lichen text-white' :
                  s.id === step ? 'bg-tundra-ink text-white' :
                  'border border-tundra-ink-200 text-tundra-ink-300',
                ].join(' ')}>
                  {s.id < step
                    ? <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
                    : s.id + 1}
                </div>
                <span className={`text-xs truncate ${s.id === step ? 'font-semibold text-tundra-ink' : s.id < step ? 'text-tundra-lichen-700' : 'text-tundra-ink-300'}`}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}

// ── Route ─────────────────────────────────────────────────────────────────────

interface SitesNewSearch { template?: string }

export const Route = createFileRoute('/_auth/sites/new')({
  validateSearch: (search: Record<string, unknown>): SitesNewSearch => ({
    template: typeof search.template === 'string' ? search.template : undefined,
  }),
  component: CreateSitePage,
})

function CreateSitePage() {
  const router    = useRouter()
  const { template: templateId } = Route.useSearch()
  const [step, setStep]   = useState(0)
  const [result, setResult] = useState<CreateSiteResponse | null>(null)

  const initSourceKind = (templateId ? 'template' : 'blank') as FormValues['sourceKind']
  const [sourceKind, setSourceKind] = useState<string>(initSourceKind)
  const [runtimeKind, setRuntimeKind] = useState<string>('static')
  const zipFileRef = useRef<File | null>(null)
  const [, forceUpdate] = useState(0)

  const { data: serversData }   = useQuery({ queryKey: ['servers'],   queryFn: () => api<ListResponse<Server>>('/servers') })
  const { data: templatesData } = useQuery({ queryKey: ['templates'], queryFn: () => api<{ data: TemplateManifest[] }>('/templates'), staleTime: Infinity })

  const allTemplates = templatesData?.data ?? []
  const servers      = serversData?.data ?? []

  const [pickedTemplateId, setPickedTemplateId] = useState<string | undefined>(templateId)
  const selectedTemplate = pickedTemplateId ? allTemplates.find((t) => t.id === pickedTemplateId) : undefined

  const activePlugins = useMemo(
    () => WIZARD_PLUGINS.filter((p) => p.matches(sourceKind, runtimeKind, selectedTemplate)),
    [sourceKind, runtimeKind, selectedTemplate],
  )

  const STEPS = useMemo(() => {
    const base = [
      { id: 0, label: 'Source',      desc: 'Where does the code come from?' },
      { id: 1, label: 'Application', desc: 'Runtime and build settings' },
      { id: 2, label: 'Domain',      desc: 'Domain and server' },
    ]
    activePlugins.forEach((p, i) => base.push({ id: 3 + i, label: p.step.label, desc: p.step.desc }))
    base.push({ id: 3 + activePlugins.length, label: 'Review', desc: 'Confirm and deploy' })
    return base
  }, [activePlugins])

  useEffect(() => {
    setStep((s) => Math.min(s, STEPS.length - 1))
  }, [STEPS.length])

  const stepSchemas = useMemo(
    () => [SCHEMA_SOURCE, SCHEMA_APP, SCHEMA_DOMAIN, ...activePlugins.map((p) => p.schema), SCHEMA_REVIEW],
    [activePlugins],
  )

  const reviewStepIndex = STEPS.length - 1

  const initRuntimeKind = selectedTemplate ? selectedTemplate.runtime.kind : initSourceKind === 'wordpress' ? 'php' : 'static'

  const initialValues: FormValues = {
    sourceKind: initSourceKind,
    repoUrl: '', branch: 'main',
    kind: initRuntimeKind,
    runtimeVersion: selectedTemplate?.runtime.version ?? (initSourceKind === 'wordpress' ? '8.3' : ''),
    buildCommand: selectedTemplate?.build_command ?? '',
    startCommand: selectedTemplate?.start_command ?? '',
    listenPort: selectedTemplate?.listen_port != null ? String(selectedTemplate.listen_port) : '',
    healthCheckPath: '/',
    domain: '', serverId: '', name: '', enableSsl: true,
    wpSiteTitle: '', wpAdminUser: 'admin', wpAdminEmail: '', wpAdminPassword: '',
    wpVersion: 'latest', wpShowPassword: false,
    phpExtensions: PHP_EXT_DEFAULTS, phpMemoryLimit: '256M', phpMaxExec: '30', phpOpcache: true,
    packageManager: 'npm', nodeEnv: 'production',
    wsgiServer: 'gunicorn', pythonRequirementsFile: 'requirements.txt',
    envVars: [], gitAutoDeploy: true,
  }

  // ── Success screen ───────────────────────────────────────────────────────────

  if (result) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-tundra-lichen/10">
            <svg className="h-10 w-10 text-tundra-lichen" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="mb-2 text-3xl font-bold text-tundra-ink">Site created!</h1>
          <p className="text-tundra-ink-500">
            <strong className="text-tundra-ink">{result.data.primary_domain}</strong> is now provisioning on your server.
          </p>
          <p className="mt-1 text-sm text-tundra-ink-400">
            Deployment <code className="rounded-lg bg-tundra-ink-100 px-2 py-0.5 font-mono text-xs">{result.deployment.id.slice(0, 8)}</code> is queued.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <button type="button"
              onClick={() => { void router.navigate({ to: '/sites/$siteId', params: { siteId: result.data.id } }) }}
              className="rounded-xl bg-tundra-lichen px-6 py-2.5 text-sm font-semibold text-white hover:bg-tundra-lichen-600 transition-colors shadow-sm shadow-tundra-lichen/20">
              View site →
            </button>
            <Link to="/sites" className="rounded-xl border border-tundra-ink-200 px-6 py-2.5 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">All sites</Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Main wizard ──────────────────────────────────────────────────────────────

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-tundra-ink-400 mb-2">
            <Link to="/sites" className="hover:text-tundra-ink transition-colors">Sites</Link>
            <span>/</span>
            <span className="text-tundra-ink font-medium">New site</span>
          </div>
          <h1 className="text-2xl font-bold text-tundra-ink">Create site</h1>
          <p className="mt-1 text-sm text-tundra-ink-400">{STEPS[step]?.desc}</p>
        </div>
        <Link to="/sites" className="flex items-center gap-1.5 rounded-xl border border-tundra-ink-200 px-3.5 py-2 text-sm text-tundra-ink-500 hover:bg-tundra-ink-50 transition-colors">
          <X className="h-3.5 w-3.5" />
          Cancel
        </Link>
      </div>

      {/* Step indicator */}
      <div className="mb-8">
        <StepIndicator steps={STEPS} current={step} />
      </div>

      <Formik
        initialValues={initialValues}
        validationSchema={stepSchemas[step]}
        onSubmit={async (values, { setSubmitting }) => {
          if (step < STEPS.length - 1) {
            setStep((s) => s + 1)
            setSubmitting(false)
            return
          }
          try {
            const envVarsConfig = values.envVars.filter((v) => v.key).length > 0
              ? { env_vars: Object.fromEntries(values.envVars.filter((v) => v.key).map((v) => [v.key, v.value])) }
              : {}

            const res = await api<CreateSiteResponse>('/sites', {
              method: 'POST',
              body: {
                name: values.name || values.domain,
                primary_domain: values.domain,
                server_id: values.serverId,
                application: {
                  kind: values.kind,
                  runtime_version: values.runtimeVersion || null,
                  build_command: values.buildCommand || null,
                  start_command: values.startCommand || null,
                  listen_port: values.listenPort ? parseInt(values.listenPort, 10) : null,
                  health_check_path: values.healthCheckPath || '/',
                  source_kind: values.sourceKind === 'wordpress' ? 'template' : values.sourceKind,
                  source_config: {
                    branch: values.branch || undefined,
                    repo_url: values.repoUrl || undefined,
                    template_id: values.sourceKind === 'template' && pickedTemplateId ? pickedTemplateId : undefined,
                    auto_deploy: values.gitAutoDeploy || undefined,
                    ...envVarsConfig,
                  },
                },
              },
            })

            // Upload ZIP if needed
            if (values.sourceKind === 'zip' && zipFileRef.current) {
              const fd = new FormData()
              fd.append('path', '/')
              fd.append('file', zipFileRef.current)
              await fetch(`/api/v1/sites/${res.data.id}/files/upload`, { method: 'POST', body: fd })
            }

            let redirect: string | undefined
            for (const plugin of activePlugins) {
              if (plugin.postCreate) {
                try {
                  const r = await plugin.postCreate(res.data.id, res.data.primary_domain, values)
                  if (r) { redirect = r; break }
                } catch (err) {
                  toast.error(`${plugin.step.label} setup failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
                }
              }
            }

            if (redirect) {
              toast.success(activePlugins.some((p) => p.id === 'wordpress') ? 'Site created — WordPress installing…' : 'Site created — provisioning started')
              void router.navigate({ to: redirect as never })
            } else {
              setResult(res)
              toast.success('Site created — provisioning started')
            }
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to create site')
          } finally {
            setSubmitting(false)
          }
        }}
      >
        {({ isSubmitting, values, setFieldValue, setValues }) => (
          <Form>
            <div className="flex gap-6">
              {/* Main content */}
              <div className="min-w-0 flex-1">
                <div className="rounded-2xl border border-tundra-ink-200 bg-white p-6 shadow-sm">
                  <h2 className="mb-6 text-base font-bold text-tundra-ink flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-tundra-ink text-white text-xs font-bold">{step + 1}</span>
                    {STEPS[step]?.label}
                  </h2>

                  {step === 0 && (
                    <SourceStep
                      values={values} setFieldValue={setFieldValue}
                      allTemplates={allTemplates}
                      pickedTemplateId={pickedTemplateId}
                      setPickedTemplateId={setPickedTemplateId}
                      setValues={(fn) => { void setValues(fn(values)) }}
                      onSourceKindChange={(kind) => {
                        setSourceKind(kind)
                        if (kind === 'wordpress') setRuntimeKind('php')
                      }}
                      zipFileRef={zipFileRef}
                    />
                  )}
                  {step === 1 && (
                    <AppStep
                      values={values} setFieldValue={setFieldValue}
                      onRuntimeKindChange={setRuntimeKind}
                      selectedTemplate={selectedTemplate}
                    />
                  )}
                  {step === 2 && <DomainStep values={values} setFieldValue={setFieldValue} servers={servers} />}

                  {activePlugins.map((plugin, i) => {
                    const pluginStep = 3 + i
                    if (step !== pluginStep) return null
                    return <plugin.Component key={plugin.id} values={values} setFieldValue={setFieldValue} />
                  })}

                  {step === reviewStepIndex && (
                    <ReviewStep
                      values={values} servers={servers} selectedTemplate={selectedTemplate}
                      activePlugins={activePlugins} zipFile={zipFileRef.current}
                    />
                  )}
                </div>

                {/* Footer nav */}
                <div className="mt-4 flex items-center justify-between">
                  <button type="button"
                    onClick={() => step === 0 ? void router.navigate({ to: '/sites' }) : setStep((s) => s - 1)}
                    className="flex items-center gap-1.5 rounded-xl border border-tundra-ink-200 px-4 py-2.5 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
                  >
                    <ArrowLeftIcon className="h-3.5 w-3.5" />
                    {step === 0 ? 'Cancel' : 'Back'}
                  </button>

                  <div className="flex items-center gap-4">
                    <div className="flex gap-1.5 lg:hidden">
                      {STEPS.map((s) => (
                        <div key={s.id} className={`rounded-full transition-all ${s.id === step ? 'h-2 w-5 bg-tundra-lichen' : s.id < step ? 'h-2 w-2 bg-tundra-lichen/60' : 'h-2 w-2 bg-tundra-ink-200'}`} />
                      ))}
                    </div>
                    <button
                      type="submit"
                      disabled={isSubmitting || (step === 0 && values.sourceKind === 'template' && !pickedTemplateId) || (step === 0 && values.sourceKind === 'zip' && !zipFileRef.current)}
                      className="flex items-center gap-1.5 rounded-xl bg-tundra-lichen px-6 py-2.5 text-sm font-semibold text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors shadow-sm shadow-tundra-lichen/20"
                      onClick={() => forceUpdate((n) => n + 1)}
                    >
                      {isSubmitting ? 'Creating…' :
                       step < STEPS.length - 1 ? <>Next <ArrowRightIcon className="h-3.5 w-3.5" /></> :
                       activePlugins.some((p) => p.id === 'wordpress') ? 'Create & Install WordPress' :
                       'Create site'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Sidebar */}
              <SidebarSummary
                values={values} step={step} servers={servers}
                selectedTemplate={selectedTemplate} steps={STEPS}
                activePlugins={activePlugins} zipFile={zipFileRef.current}
              />
            </div>
          </Form>
        )}
      </Formik>
    </div>
  )
}
