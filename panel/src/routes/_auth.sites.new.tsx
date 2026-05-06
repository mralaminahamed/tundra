import { createFileRoute, useRouter, Link } from '@tanstack/react-router'
import { Formik, Form, ErrorMessage } from 'formik'
import * as Yup from 'yup'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CreateSiteResponse, ListResponse, Server, TemplateManifest } from '@/lib/api-types'
import { Switch } from '@/components/ui/switch'

interface SitesNewSearch { template?: string }

export const Route = createFileRoute('/_auth/sites/new')({
  validateSearch: (search: Record<string, unknown>): SitesNewSearch => ({
    template: typeof search.template === 'string' ? search.template : undefined,
  }),
  component: CreateSitePage,
})

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 0, label: 'Source',      desc: 'Where does the code come from?' },
  { id: 1, label: 'Application', desc: 'Runtime and build settings' },
  { id: 2, label: 'Domain',      desc: 'Domain and server' },
  { id: 3, label: 'Review',      desc: 'Confirm and deploy' },
] as const

const stepSchemas = [
  Yup.object({
    sourceKind: Yup.string().oneOf(['github', 'gitlab', 'blank', 'template']).required(),
    branch: Yup.string().when('sourceKind', {
      is: (k: string) => k !== 'blank' && k !== 'template',
      then: (s) => s.required('Branch is required'),
      otherwise: (s) => s.optional(),
    }),
  }),
  Yup.object({
    kind: Yup.string().required('Application type is required'),
    runtimeVersion: Yup.string().when('kind', {
      is: (k: string) => k !== 'static',
      then: (s) => s.required('Runtime version is required'),
      otherwise: (s) => s.optional(),
    }),
  }),
  Yup.object({
    domain: Yup.string()
      .required('Domain is required')
      .matches(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, 'Enter a valid domain (e.g. example.com)'),
    serverId: Yup.string().required('Select a server'),
  }),
  Yup.object({}),
]

interface FormValues {
  sourceKind: 'github' | 'gitlab' | 'blank' | 'template'
  repoUrl: string
  branch: string
  kind: string
  runtimeVersion: string
  buildCommand: string
  startCommand: string
  listenPort: string
  healthCheckPath: string
  domain: string
  serverId: string
  name: string
  enableSsl: boolean
}

type RuntimeKind = 'static' | 'php' | 'laravel' | 'nodejs' | 'python' | 'go' | 'ruby' | 'dotnet'

const RUNTIME_HINTS: Record<RuntimeKind, {
  label: string
  versionPlaceholder: string
  buildHint: string
  startHint: string
  portHint: string
  hasPort: boolean
  icon: string
}> = {
  static:  { label: 'Static',    versionPlaceholder: '',         buildHint: '',                                startHint: '',                                      portHint: '',     hasPort: false, icon: '🌐' },
  php:     { label: 'PHP',       versionPlaceholder: '8.3',      buildHint: 'composer install --no-dev',       startHint: '',                                      portHint: '',     hasPort: false, icon: '🐘' },
  laravel: { label: 'Laravel',   versionPlaceholder: '8.3',      buildHint: 'composer install --no-dev && php artisan optimize', startHint: '',              portHint: '',     hasPort: false, icon: '🔴' },
  nodejs:  { label: 'Node.js',   versionPlaceholder: '22',       buildHint: 'npm ci && npm run build',         startHint: 'node dist/index.js',                    portHint: '3000', hasPort: true,  icon: '🟢' },
  python:  { label: 'Python',    versionPlaceholder: '3.12',     buildHint: 'pip install -r requirements.txt', startHint: 'gunicorn app:app -b 0.0.0.0:$PORT',     portHint: '8000', hasPort: true,  icon: '🐍' },
  go:      { label: 'Go',        versionPlaceholder: '1.24',     buildHint: 'go build -o app .',               startHint: './app',                                 portHint: '8080', hasPort: true,  icon: '🔵' },
  ruby:    { label: 'Ruby',      versionPlaceholder: '3.3',      buildHint: 'bundle install',                  startHint: 'bundle exec puma -C config/puma.rb',    portHint: '3000', hasPort: true,  icon: '💎' },
  dotnet:  { label: '.NET',      versionPlaceholder: '9.0',      buildHint: 'dotnet publish -c Release -o out', startHint: 'dotnet out/App.dll',                  portHint: '5000', hasPort: true,  icon: '🔷' },
}

// ── Shared field styles ───────────────────────────────────────────────────────

const INPUT = 'w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm placeholder:text-tundra-ink-300 focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen'
const LABEL = 'mb-1.5 block text-sm font-medium text-tundra-ink'
const HINT  = 'mt-1 text-xs text-tundra-ink-400'

// ── Step 1: Source ─────────────────────────────────────────────────────────────

const SOURCE_TYPES = [
  {
    id: 'blank' as const,
    label: 'Blank site',
    desc: 'Start from scratch with an empty document root',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path d="M9 12h6m-3-3v6M3 12a9 9 0 1018 0 9 9 0 00-18 0z" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'template' as const,
    label: 'Template',
    desc: 'WordPress, WooCommerce, Laravel, Next.js and more',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm12-1a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/>
      </svg>
    ),
  },
  {
    id: 'github' as const,
    label: 'GitHub',
    desc: 'Deploy from a GitHub repository',
    icon: (
      <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
      </svg>
    ),
  },
  {
    id: 'gitlab' as const,
    label: 'GitLab',
    desc: 'Deploy from a GitLab repository',
    icon: (
      <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
        <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z"/>
      </svg>
    ),
  },
]

function SourceStep({
  values,
  setFieldValue,
  allTemplates,
  pickedTemplateId,
  setPickedTemplateId,
  setValues,
}: {
  values: FormValues
  setFieldValue: (f: string, v: unknown) => void
  allTemplates: TemplateManifest[]
  pickedTemplateId: string | undefined
  setPickedTemplateId: (id: string | undefined) => void
  setValues: (fn: (prev: FormValues) => FormValues) => void
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
      if (tmplSearch && !t.name.toLowerCase().includes(tmplSearch.toLowerCase()) && !t.description?.toLowerCase().includes(tmplSearch.toLowerCase())) return false
      return true
    }),
    [allTemplates, tmplSearch, tmplCategory],
  )

  return (
    <div className="space-y-5">
      <div>
        <p className={LABEL}>Source type</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SOURCE_TYPES.map((src) => {
            const active = values.sourceKind === src.id
            return (
              <button
                key={src.id}
                type="button"
                onClick={() => {
                  void setFieldValue('sourceKind', src.id)
                  if (src.id !== 'template') setPickedTemplateId(undefined)
                }}
                className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all ${
                  active
                    ? 'border-tundra-lichen bg-tundra-lichen/5 ring-1 ring-tundra-lichen'
                    : 'border-tundra-ink-200 hover:border-tundra-lichen hover:bg-tundra-ink-50'
                }`}
              >
                <span className={active ? 'text-tundra-lichen' : 'text-tundra-ink-400'}>{src.icon}</span>
                <span className="text-sm font-semibold text-tundra-ink">{src.label}</span>
                <span className="text-xs text-tundra-ink-400 leading-tight">{src.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Git fields */}
      {(values.sourceKind === 'github' || values.sourceKind === 'gitlab') && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className={LABEL}>Repository URL</label>
            <input
              type="url"
              value={values.repoUrl}
              onChange={(e) => { void setFieldValue('repoUrl', e.target.value) }}
              placeholder={values.sourceKind === 'github' ? 'https://github.com/user/repo' : 'https://gitlab.com/user/repo'}
              className={INPUT}
            />
            <p className={HINT}>HTTPS or SSH URL of the repository</p>
          </div>
          <div>
            <label className={LABEL}>Branch</label>
            <input
              type="text"
              value={values.branch}
              onChange={(e) => { void setFieldValue('branch', e.target.value) }}
              placeholder="main"
              className={INPUT}
            />
            <ErrorMessage name="branch" component="p" className="mt-1 text-xs text-tundra-rust" />
          </div>
        </div>
      )}

      {/* Template picker */}
      {values.sourceKind === 'template' && (
        <div>
          {/* Search + category filters */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative">
              <svg className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                type="search"
                placeholder="Search templates…"
                value={tmplSearch}
                onChange={(e) => { setTmplSearch(e.target.value) }}
                className="h-8 w-44 rounded-lg border border-tundra-ink-200 bg-white pl-8 pr-3 text-xs focus:border-tundra-lichen focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => { setTmplCategory(cat) }}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize transition-colors ${
                    tmplCategory === cat
                      ? 'border-tundra-lichen bg-tundra-lichen text-white'
                      : 'border-tundra-ink-200 text-tundra-ink-500 hover:border-tundra-lichen'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {allTemplates.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-xl border border-tundra-ink-200">
              <p className="animate-pulse text-sm text-tundra-ink-400">Loading templates…</p>
            </div>
          ) : filteredTmpls.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-xl border border-tundra-ink-200">
              <p className="text-sm text-tundra-ink-400">No templates match the filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTmpls.map((tmpl) => {
                const isPicked = pickedTemplateId === tmpl.id
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => {
                      setPickedTemplateId(tmpl.id)
                      const kind = tmpl.runtime.kind === 'static' ? 'static' : tmpl.runtime.kind
                      setValues((prev) => ({
                        ...prev,
                        sourceKind: 'template',
                        kind,
                        runtimeVersion: tmpl.runtime.version ?? '',
                        buildCommand: tmpl.build_command ?? '',
                        startCommand: tmpl.start_command ?? '',
                        listenPort: tmpl.listen_port != null ? String(tmpl.listen_port) : '',
                      }))
                    }}
                    className={`relative rounded-xl border p-4 text-left transition-all hover:shadow-sm ${
                      isPicked
                        ? 'border-tundra-lichen bg-tundra-lichen/5 ring-1 ring-tundra-lichen'
                        : 'border-tundra-ink-200 hover:border-tundra-lichen'
                    }`}
                  >
                    {isPicked && (
                      <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-tundra-lichen text-white">
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                          <path d="M5 13l4 4L19 7"/>
                        </svg>
                      </span>
                    )}
                    <p className="font-semibold text-sm text-tundra-ink">{tmpl.name}</p>
                    {tmpl.tags[0] && (
                      <span className="mt-1 inline-block rounded border border-tundra-ink-100 bg-tundra-ink-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tundra-ink-400">
                        {tmpl.tags[0]}
                      </span>
                    )}
                    <p className="mt-1.5 line-clamp-2 text-xs text-tundra-ink-400">{tmpl.description}</p>
                    <p className="mt-2 text-xs text-tundra-ink-300">
                      {RUNTIME_HINTS[tmpl.runtime.kind as RuntimeKind]?.icon ?? '📦'}{' '}
                      {tmpl.runtime.kind}{tmpl.runtime.version ? ` ${tmpl.runtime.version}` : ''}
                    </p>
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

function AppStep({ values, setFieldValue }: { values: FormValues; setFieldValue: (f: string, v: unknown) => void }) {
  const hints = (RUNTIME_HINTS as Record<string, (typeof RUNTIME_HINTS)[RuntimeKind]>)[values.kind] ?? RUNTIME_HINTS.static

  return (
    <div className="space-y-5">
      <div>
        <p className={LABEL}>Application type</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(RUNTIME_HINTS) as RuntimeKind[]).map((rt) => {
            const h = RUNTIME_HINTS[rt]
            const active = values.kind === rt
            return (
              <button
                key={rt}
                type="button"
                onClick={() => { void setFieldValue('kind', rt) }}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all ${
                  active
                    ? 'border-tundra-lichen bg-tundra-lichen/5 ring-1 ring-tundra-lichen'
                    : 'border-tundra-ink-200 hover:border-tundra-lichen hover:bg-tundra-ink-50'
                }`}
              >
                <span className="text-xl">{h.icon}</span>
                <span className={`text-sm font-medium ${active ? 'text-tundra-lichen-700' : 'text-tundra-ink'}`}>{h.label}</span>
              </button>
            )
          })}
        </div>
        <ErrorMessage name="kind" component="p" className="mt-1 text-xs text-tundra-rust" />
      </div>

      {values.kind !== 'static' && (
        <div>
          <label className={LABEL}>
            Runtime version
            <span className="ml-1 text-tundra-ink-400 font-normal">({hints.versionPlaceholder})</span>
          </label>
          <input
            type="text"
            value={values.runtimeVersion}
            onChange={(e) => { void setFieldValue('runtimeVersion', e.target.value) }}
            placeholder={hints.versionPlaceholder}
            className={INPUT}
          />
          <ErrorMessage name="runtimeVersion" component="p" className="mt-1 text-xs text-tundra-rust" />
        </div>
      )}

      <div>
        <label className={LABEL}>
          Build command
          <span className="ml-1 text-xs font-normal text-tundra-ink-400">optional</span>
        </label>
        <input
          type="text"
          value={values.buildCommand}
          onChange={(e) => { void setFieldValue('buildCommand', e.target.value) }}
          placeholder={hints.buildHint || 'e.g. npm ci && npm run build'}
          className={`${INPUT} font-mono text-xs`}
        />
        <p className={HINT}>Runs once during deployment to compile assets or install dependencies.</p>
      </div>

      {hints.hasPort && (
        <>
          <div>
            <label className={LABEL}>Start command</label>
            <input
              type="text"
              value={values.startCommand}
              onChange={(e) => { void setFieldValue('startCommand', e.target.value) }}
              placeholder={hints.startHint}
              className={`${INPUT} font-mono text-xs`}
            />
            <p className={HINT}>Command used to start the application process.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL}>Listen port</label>
              <input
                type="text"
                value={values.listenPort}
                onChange={(e) => { void setFieldValue('listenPort', e.target.value) }}
                placeholder={hints.portHint}
                className={`${INPUT} font-mono`}
              />
            </div>
            <div>
              <label className={LABEL}>Health check path</label>
              <input
                type="text"
                value={values.healthCheckPath}
                onChange={(e) => { void setFieldValue('healthCheckPath', e.target.value) }}
                placeholder="/"
                className={`${INPUT} font-mono`}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Step 3: Domain & Server ───────────────────────────────────────────────────

function DomainStep({
  values,
  setFieldValue,
  servers,
}: {
  values: FormValues
  setFieldValue: (f: string, v: unknown) => void
  servers: Server[]
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL}>Primary domain</label>
          <input
            type="text"
            value={values.domain}
            onChange={(e) => {
              const v = e.target.value.toLowerCase().trim()
              void setFieldValue('domain', v)
              if (!values.name) void setFieldValue('name', v)
            }}
            placeholder="example.com"
            className={INPUT}
            autoComplete="off"
            spellCheck={false}
          />
          <ErrorMessage name="domain" component="p" className="mt-1 text-xs text-tundra-rust" />
          <p className={HINT}>Must be a valid domain you control. You can add more domains after creation.</p>
        </div>
        <div>
          <label className={LABEL}>
            Site display name
            <span className="ml-1 text-xs font-normal text-tundra-ink-400">optional</span>
          </label>
          <input
            type="text"
            value={values.name}
            onChange={(e) => { void setFieldValue('name', e.target.value) }}
            placeholder={values.domain || 'My Site'}
            className={INPUT}
          />
          <p className={HINT}>Friendly name shown in the panel. Defaults to the domain.</p>
        </div>
      </div>

      {/* SSL toggle */}
      <div className="flex items-center justify-between rounded-xl border border-tundra-ink-200 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-tundra-ink">Enable SSL / HTTPS</p>
          <p className="text-xs text-tundra-ink-400">Automatically issues a Let's Encrypt certificate after provisioning</p>
        </div>
        <Switch
          checked={values.enableSsl}
          onChange={(v) => { void setFieldValue('enableSsl', v) }}
        />
      </div>

      {/* Server selection */}
      <div>
        <p className={LABEL}>Server</p>
        <ErrorMessage name="serverId" component="p" className="mb-2 text-xs text-tundra-rust" />
        {servers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-tundra-ink-200 p-6 text-center">
            <p className="text-sm text-tundra-ink-400">No servers enrolled yet.</p>
            <Link to="/servers" className="mt-1 inline-block text-xs font-medium text-tundra-lichen hover:underline">
              Enroll a server →
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {servers.map((srv) => {
              const active = values.serverId === srv.id
              return (
                <button
                  key={srv.id}
                  type="button"
                  onClick={() => { void setFieldValue('serverId', srv.id) }}
                  className={`relative rounded-xl border p-4 text-left transition-all ${
                    active
                      ? 'border-tundra-lichen bg-tundra-lichen/5 ring-1 ring-tundra-lichen'
                      : 'border-tundra-ink-200 hover:border-tundra-lichen hover:bg-tundra-ink-50'
                  }`}
                >
                  {active && (
                    <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-tundra-lichen text-white">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                        <path d="M5 13l4 4L19 7"/>
                      </svg>
                    </span>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="h-4 w-4 text-tundra-ink-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
                      <line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
                    </svg>
                    <p className="font-semibold text-sm text-tundra-ink">{srv.name}</p>
                  </div>
                  <p className="font-mono text-xs text-tundra-ink-400">{srv.hostname}</p>
                  {srv.os && (
                    <p className="mt-1 text-xs text-tundra-ink-400">{srv.os}</p>
                  )}
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${srv.status === 'active' ? 'bg-tundra-lichen' : 'bg-tundra-ink-300'}`} />
                    <span className="text-xs capitalize text-tundra-ink-400">{srv.status}</span>
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

// ── Step 4: Review ────────────────────────────────────────────────────────────

function ReviewStep({
  values,
  servers,
  selectedTemplate,
}: {
  values: FormValues
  servers: Server[]
  selectedTemplate: TemplateManifest | undefined
}) {
  const server = servers.find((s) => s.id === values.serverId)
  const hints = (RUNTIME_HINTS as Record<string, (typeof RUNTIME_HINTS)[RuntimeKind]>)[values.kind] ?? RUNTIME_HINTS.static

  const rows: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: 'Domain',   value: values.domain },
    { label: 'Site name', value: values.name || values.domain },
    { label: 'Server',   value: server ? `${server.name} (${server.hostname})` : '—' },
    { label: 'Source',   value: values.sourceKind === 'template' && selectedTemplate ? `Template: ${selectedTemplate.name}` : values.sourceKind === 'blank' ? 'Blank site' : `${values.sourceKind}: ${values.repoUrl || '—'} @ ${values.branch}` },
    { label: 'Runtime',  value: hints.label + (values.runtimeVersion ? ` ${values.runtimeVersion}` : '') },
    ...(values.buildCommand ? [{ label: 'Build', value: values.buildCommand, mono: true }] : []),
    ...(values.startCommand ? [{ label: 'Start', value: values.startCommand, mono: true }] : []),
    ...(values.listenPort   ? [{ label: 'Port',  value: values.listenPort }] : []),
    { label: 'SSL', value: values.enableSsl ? 'Enabled (Let\'s Encrypt)' : 'Disabled' },
  ]

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
        <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Deployment configuration</span>
        </div>
        <div className="divide-y divide-tundra-ink-100">
          {rows.map(({ label, value, mono }) => (
            <div key={label} className="flex items-start gap-4 px-4 py-2.5 text-sm">
              <span className="w-24 shrink-0 text-tundra-ink-400">{label}</span>
              <span className={`flex-1 ${mono ? 'font-mono text-xs' : ''} text-tundra-ink`}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Deployment timeline */}
      <div className="rounded-xl border border-tundra-ink-200 bg-white p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">What happens next</p>
        <div className="space-y-3">
          {[
            { icon: '🗄', label: 'Database and user created', time: '~5s' },
            { icon: '📂', label: 'Document root provisioned on server', time: '~10s' },
            { icon: '⚙', label: values.buildCommand ? 'Build command executed' : 'Files synced to server', time: '~30s' },
            { icon: '🔐', label: values.enableSsl ? 'SSL certificate issued via Let\'s Encrypt' : 'HTTP configured (no SSL)', time: '~45s' },
            { icon: '✅', label: 'Site goes live', time: '~1min' },
          ].map(({ icon, label, time }, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-tundra-ink-200 bg-tundra-ink-50 text-base">
                {icon}
              </div>
              <span className="flex-1 text-tundra-ink-600">{label}</span>
              <span className="text-xs text-tundra-ink-300">{time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Live summary sidebar ──────────────────────────────────────────────────────

function SidebarSummary({
  values,
  step,
  servers,
  selectedTemplate,
}: {
  values: FormValues
  step: number
  servers: Server[]
  selectedTemplate: TemplateManifest | undefined
}) {
  const server = servers.find((s) => s.id === values.serverId)
  const hints = (RUNTIME_HINTS as Record<string, (typeof RUNTIME_HINTS)[RuntimeKind]>)[values.kind] ?? RUNTIME_HINTS.static

  const items: Array<{ label: string; value: string | undefined; mono?: boolean }> = [
    { label: 'Domain',  value: values.domain || undefined },
    { label: 'Source',  value: values.sourceKind === 'template' && selectedTemplate ? selectedTemplate.name : values.sourceKind === 'blank' ? 'Blank' : values.sourceKind === 'github' ? `GitHub${values.repoUrl ? ` — ${values.repoUrl.split('/').slice(-1)[0]}` : ''}` : values.sourceKind === 'gitlab' ? 'GitLab' : undefined },
    { label: 'Runtime', value: step >= 1 ? hints.label + (values.runtimeVersion ? ` ${values.runtimeVersion}` : '') : undefined },
    { label: 'Server',  value: step >= 2 && server ? server.name : undefined },
    { label: 'SSL',     value: step >= 2 ? (values.enableSsl ? 'Enabled' : 'Disabled') : undefined },
  ].filter((i) => i.value !== undefined)

  return (
    <aside className="hidden lg:block w-64 shrink-0">
      <div className="sticky top-6 rounded-xl border border-tundra-ink-200 bg-white overflow-hidden">
        <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Summary</p>
        </div>
        <div className="p-4">
          {items.length === 0 ? (
            <p className="text-xs text-tundra-ink-300 italic">Fill in the form to see a summary.</p>
          ) : (
            <div className="space-y-2.5">
              {items.map(({ label, value, mono }) => (
                <div key={label}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-tundra-ink-400">{label}</p>
                  <p className={`mt-0.5 text-sm text-tundra-ink ${mono ? 'font-mono text-xs' : ''} break-all`}>{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Step checklist */}
        <div className="border-t border-tundra-ink-100 p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-tundra-ink-400">Progress</p>
          <div className="space-y-2">
            {STEPS.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  s.id < step ? 'bg-tundra-lichen text-white' :
                  s.id === step ? 'bg-tundra-ink text-white' :
                  'border border-tundra-ink-200 text-tundra-ink-300'
                }`}>
                  {s.id < step ? (
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                      <path d="M5 13l4 4L19 7"/>
                    </svg>
                  ) : s.id + 1}
                </div>
                <span className={`text-xs ${s.id === step ? 'font-semibold text-tundra-ink' : s.id < step ? 'text-tundra-lichen-700' : 'text-tundra-ink-400'}`}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function CreateSitePage() {
  const router = useRouter()
  const { template: templateId } = Route.useSearch()
  const [step, setStep] = useState(0)
  const [result, setResult] = useState<CreateSiteResponse | null>(null)

  const { data: serversData } = useQuery({
    queryKey: ['servers'],
    queryFn: () => api<ListResponse<Server>>('/servers'),
  })

  const { data: templatesData } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api<{ data: TemplateManifest[] }>('/templates'),
    staleTime: Infinity,
  })

  const allTemplates = templatesData?.data ?? []
  const servers = serversData?.data ?? []

  const [pickedTemplateId, setPickedTemplateId] = useState<string | undefined>(templateId)
  const selectedTemplate = pickedTemplateId ? allTemplates.find((t) => t.id === pickedTemplateId) : undefined

  const initialValues: FormValues = {
    sourceKind: selectedTemplate ? 'template' : 'blank',
    repoUrl: '',
    branch: 'main',
    kind: selectedTemplate ? selectedTemplate.runtime.kind : 'static',
    runtimeVersion: selectedTemplate?.runtime.version ?? '',
    buildCommand: selectedTemplate?.build_command ?? '',
    startCommand: selectedTemplate?.start_command ?? '',
    listenPort: selectedTemplate?.listen_port != null ? String(selectedTemplate.listen_port) : '',
    healthCheckPath: '/',
    domain: '',
    serverId: '',
    name: '',
    enableSsl: true,
  }

  if (result) {
    return (
      <div className="max-w-lg">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-tundra-lichen/10">
          <svg className="h-8 w-8 text-tundra-lichen" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <h1 className="mb-2 text-2xl font-bold text-tundra-ink">Site created!</h1>
        <p className="mb-1 text-tundra-ink-500">
          <strong>{result.data.primary_domain}</strong> is now provisioning.
        </p>
        <p className="mb-6 text-sm text-tundra-ink-400">
          Deployment <code className="rounded bg-tundra-ink-100 px-1 font-mono">{result.deployment.id.slice(0, 8)}</code> is queued — usually ready in under a minute.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { void router.navigate({ to: '/sites/$siteId', params: { siteId: result.data.id } }) }}
            className="rounded-lg bg-tundra-lichen px-5 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors"
          >
            View site →
          </button>
          <Link to="/sites" className="rounded-lg border border-tundra-ink-200 px-5 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
            All sites
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-tundra-ink">Create site</h1>
          <p className="mt-0.5 text-sm text-tundra-ink-400">Step {step + 1} of {STEPS.length} — {STEPS[step].desc}</p>
        </div>
        <Link to="/sites" className="rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm text-tundra-ink-500 hover:bg-tundra-ink-50 transition-colors">
          Cancel
        </Link>
      </div>

      {/* Progress bar */}
      <div className="mb-8 flex gap-1.5">
        {STEPS.map((s) => (
          <div key={s.id} className="group flex-1">
            <div className={`h-1 rounded-full transition-colors ${s.id <= step ? 'bg-tundra-lichen' : 'bg-tundra-ink-100'}`} />
            <p className={`mt-1.5 hidden text-xs sm:block ${s.id === step ? 'font-semibold text-tundra-ink' : s.id < step ? 'text-tundra-lichen-600' : 'text-tundra-ink-300'}`}>
              {s.label}
            </p>
          </div>
        ))}
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
                  source_kind: values.sourceKind,
                  source_config: {
                    branch: values.branch || undefined,
                    repo_url: values.repoUrl || undefined,
                    template_id: values.sourceKind === 'template' && pickedTemplateId ? pickedTemplateId : undefined,
                  },
                },
              },
            })
            setResult(res)
            toast.success('Site created — provisioning started')
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to create site')
          } finally {
            setSubmitting(false)
          }
        }}
      >
        {({ isSubmitting, values, setFieldValue, setValues }) => (
          <Form>
            <div className="flex gap-8">
              {/* Main content */}
              <div className="min-w-0 flex-1">
                <div className="rounded-xl border border-tundra-ink-200 bg-white p-6">
                  <h2 className="mb-5 text-base font-semibold text-tundra-ink">{STEPS[step].label}</h2>

                  {step === 0 && (
                    <SourceStep
                      values={values}
                      setFieldValue={setFieldValue}
                      allTemplates={allTemplates}
                      pickedTemplateId={pickedTemplateId}
                      setPickedTemplateId={setPickedTemplateId}
                      setValues={(fn) => { void setValues(fn(values)) }}
                    />
                  )}
                  {step === 1 && <AppStep values={values} setFieldValue={setFieldValue} />}
                  {step === 2 && <DomainStep values={values} setFieldValue={setFieldValue} servers={servers} />}
                  {step === 3 && <ReviewStep values={values} servers={servers} selectedTemplate={selectedTemplate} />}
                </div>

                {/* Nav buttons */}
                <div className="mt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => { step === 0 ? void router.navigate({ to: '/sites' }) : setStep((s) => s - 1) }}
                    className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
                  >
                    {step === 0 ? 'Cancel' : '← Back'}
                  </button>

                  <div className="flex items-center gap-3">
                    {/* Mobile step dots */}
                    <div className="flex gap-1.5 sm:hidden">
                      {STEPS.map((s) => (
                        <div key={s.id} className={`h-1.5 rounded-full transition-all ${
                          s.id === step ? 'w-4 bg-tundra-lichen' : s.id < step ? 'w-1.5 bg-tundra-lichen' : 'w-1.5 bg-tundra-ink-200'
                        }`} />
                      ))}
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting || (step === 0 && values.sourceKind === 'template' && !pickedTemplateId)}
                      className="rounded-lg bg-tundra-lichen px-6 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
                    >
                      {isSubmitting ? 'Creating…' : step < STEPS.length - 1 ? 'Next →' : 'Create site'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Sidebar */}
              <SidebarSummary
                values={values}
                step={step}
                servers={servers}
                selectedTemplate={selectedTemplate}
              />
            </div>
          </Form>
        )}
      </Formik>
    </div>
  )
}
