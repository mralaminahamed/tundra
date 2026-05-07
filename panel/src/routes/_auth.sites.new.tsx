import { createFileRoute, useRouter, Link } from '@tanstack/react-router'
import { Formik, Form, ErrorMessage } from 'formik'
import * as Yup from 'yup'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import {
  GlobeIcon as Globe,
  DatabaseIcon as Database, FolderOpenIcon as FolderOpen, DownloadIcon as Download,
  SettingsIcon as Settings2, ShieldCheckIcon as ShieldCheck, KeyIcon as Key,
  CheckCircleIcon as CheckCircle2, LockIcon as Lock, UnlockIcon as Unlock,
  CloseIcon as X, PackageIcon as Package,
  GithubIcon, GitlabIcon, WordpressIcon,
  PhpIcon, LaravelIcon, NodejsIcon, PythonIcon, GoIcon, RubyIcon, DotnetIcon,
} from '@/components/icons'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CreateSiteResponse, ListResponse, Server, TemplateManifest } from '@/lib/api-types'
import { Switch } from '@/components/ui/switch'

// ── Shared styles ─────────────────────────────────────────────────────────────

const INPUT = 'w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm placeholder:text-tundra-ink-300 focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen'
const LABEL = 'mb-1.5 block text-sm font-medium text-tundra-ink'
const HINT  = 'mt-1 text-xs text-tundra-ink-400'

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
  if (score <= 1) return { label: 'Weak',   color: 'bg-red-500',          width: '20%' }
  if (score <= 2) return { label: 'Fair',   color: 'bg-yellow-500',       width: '45%' }
  if (score <= 3) return { label: 'Good',   color: 'bg-tundra-aurora',    width: '70%' }
  return             { label: 'Strong', color: 'bg-tundra-lichen',    width: '100%' }
}

// ── Form values ───────────────────────────────────────────────────────────────

interface EnvVar { key: string; value: string; secret: boolean }

interface FormValues {
  // Core
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
  // WordPress plugin
  wpSiteTitle: string
  wpAdminUser: string
  wpAdminEmail: string
  wpAdminPassword: string
  wpVersion: string
  wpShowPassword: boolean
  // Env vars plugin (github / gitlab / non-WP templates)
  envVars: EnvVar[]
  // Git plugin
  gitAutoDeploy: boolean
}

// ── Plugin registry ───────────────────────────────────────────────────────────

type SetFieldValue = (field: string, value: unknown) => void

interface WizardPlugin {
  id: string
  matches: (sourceKind: string, template: TemplateManifest | undefined) => boolean
  step: { label: string; desc: string }
  schema: Yup.ObjectSchema<Record<string, unknown>>
  Component: React.FC<{ values: FormValues; setFieldValue: SetFieldValue }>
  /** Called after site is created. Return redirect path to override default. */
  postCreate?: (siteId: string, primaryDomain: string, values: FormValues) => Promise<string | void>
}

// ── Plugin: WordPress ─────────────────────────────────────────────────────────

const WP_VERSIONS = [
  { value: 'latest', label: 'Latest (recommended)' },
  { value: '6.7.2',  label: '6.7.2' },
  { value: '6.6.2',  label: '6.6.2' },
  { value: '6.5.5',  label: '6.5.5' },
]

function WpSetupStep({ values, setFieldValue }: { values: FormValues; setFieldValue: SetFieldValue }) {
  const strength = passwordStrength(values.wpAdminPassword)
  return (
    <div className="space-y-5">
      <div>
        <label className={LABEL}>WordPress Version</label>
        <select value={values.wpVersion || 'latest'} onChange={(e) => setFieldValue('wpVersion', e.target.value)} className={INPUT}>
          {WP_VERSIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
        </select>
      </div>
      <div>
        <label className={LABEL}>Site Title</label>
        <input type="text" value={values.wpSiteTitle} onChange={(e) => setFieldValue('wpSiteTitle', e.target.value)} placeholder="My WordPress Site" className={INPUT} />
        <ErrorMessage name="wpSiteTitle" component="p" className="mt-1 text-xs text-tundra-rust" />
      </div>
      <div className="rounded-xl border border-tundra-ink-200 bg-tundra-ink-50/50 p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Admin Account</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Username</label>
            <input type="text" value={values.wpAdminUser} onChange={(e) => setFieldValue('wpAdminUser', e.target.value)} placeholder="admin" autoComplete="off" className={INPUT} />
            <ErrorMessage name="wpAdminUser" component="p" className="mt-1 text-xs text-tundra-rust" />
          </div>
          <div>
            <label className={LABEL}>Email</label>
            <input type="email" value={values.wpAdminEmail} onChange={(e) => setFieldValue('wpAdminEmail', e.target.value)} placeholder={values.domain ? `admin@${values.domain}` : 'admin@example.com'} className={INPUT} />
            <ErrorMessage name="wpAdminEmail" component="p" className="mt-1 text-xs text-tundra-rust" />
          </div>
        </div>
        <div>
          <label className={LABEL}>Password</label>
          <div className="relative">
            <input type={values.wpShowPassword ? 'text' : 'password'} value={values.wpAdminPassword} onChange={(e) => setFieldValue('wpAdminPassword', e.target.value)} autoComplete="new-password" className={`${INPUT} pr-24`} />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button type="button" onClick={() => setFieldValue('wpAdminPassword', generatePassword())} className="rounded px-1.5 py-0.5 text-[10px] font-medium text-tundra-ink-400 hover:text-tundra-lichen">Generate</button>
              <button type="button" onClick={() => setFieldValue('wpShowPassword', !values.wpShowPassword)} className="p-0.5 text-tundra-ink-400 hover:text-tundra-ink">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  {values.wpShowPassword
                    ? <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/>
                    : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                  }
                </svg>
              </button>
            </div>
          </div>
          {values.wpAdminPassword && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 h-1 rounded-full bg-tundra-ink-100">
                <div className={`h-1 rounded-full transition-all ${strength.color}`} style={{ width: strength.width }} />
              </div>
              <span className="text-[10px] font-semibold text-tundra-ink-500">{strength.label}</span>
            </div>
          )}
          <ErrorMessage name="wpAdminPassword" component="p" className="mt-1 text-xs text-tundra-rust" />
        </div>
      </div>
    </div>
  )
}

const wpPlugin: WizardPlugin = {
  id: 'wordpress',
  matches: (_, tmpl) => !!tmpl?.tags.includes('wordpress'),
  step: { label: 'WordPress', desc: 'WordPress configuration' },
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

// ── Plugin: Environment Variables ─────────────────────────────────────────────

function EnvVarsStep({ values, setFieldValue }: { values: FormValues; setFieldValue: SetFieldValue }) {
  const addVar = () => setFieldValue('envVars', [...values.envVars, { key: '', value: '', secret: false }])
  const removeVar = (i: number) => setFieldValue('envVars', values.envVars.filter((_, idx) => idx !== i))
  const updateVar = (i: number, field: keyof EnvVar, val: unknown) => {
    const next = values.envVars.map((v, idx) => idx === i ? { ...v, [field]: val } : v)
    setFieldValue('envVars', next)
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-tundra-ink-500 mb-4">
          Add environment variables that will be written to <code className="rounded bg-tundra-ink-100 px-1 font-mono text-xs">.env</code> on the server.
          Mark secrets as <span className="font-medium">Secret</span> to encrypt them at rest.
        </p>
        {values.envVars.length === 0 ? (
          <div className="rounded-xl border border-dashed border-tundra-ink-200 py-8 text-center">
            <p className="text-sm text-tundra-ink-400">No environment variables added yet.</p>
            <button type="button" onClick={addVar} className="mt-2 text-sm font-medium text-tundra-lichen hover:underline">+ Add first variable</button>
          </div>
        ) : (
          <div className="space-y-2">
            {values.envVars.map((ev, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={ev.key}
                  onChange={(e) => updateVar(i, 'key', e.target.value.toUpperCase())}
                  placeholder="KEY"
                  className={`${INPUT} w-40 font-mono text-xs uppercase`}
                />
                <input
                  type={ev.secret ? 'password' : 'text'}
                  value={ev.value}
                  onChange={(e) => updateVar(i, 'value', e.target.value)}
                  placeholder="value"
                  className={`${INPUT} flex-1 font-mono text-xs`}
                />
                <button
                  type="button"
                  onClick={() => updateVar(i, 'secret', !ev.secret)}
                  title={ev.secret ? 'Unmark secret' : 'Mark as secret'}
                  className={`rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${ev.secret ? 'border-tundra-aurora-300 bg-tundra-aurora-50 text-tundra-aurora-700' : 'border-tundra-ink-200 text-tundra-ink-400 hover:border-tundra-aurora-300'}`}
                >
                  {ev.secret ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                </button>
                <button type="button" onClick={() => removeVar(i)} className="rounded-lg border border-tundra-ink-200 p-2 text-tundra-ink-400 hover:border-red-300 hover:text-red-500 transition-colors"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}
        {values.envVars.length > 0 && (
          <button type="button" onClick={addVar} className="mt-3 text-sm font-medium text-tundra-lichen hover:underline">+ Add variable</button>
        )}
      </div>
    </div>
  )
}

const envVarsPlugin: WizardPlugin = {
  id: 'env_vars',
  // Active for non-WordPress templates and for github/gitlab
  matches: (sourceKind, tmpl) => {
    if (sourceKind === 'github' || sourceKind === 'gitlab') return false // git plugin handles those
    if (tmpl?.tags.includes('wordpress')) return false
    return sourceKind === 'template' && !!tmpl
  },
  step: { label: 'Environment', desc: 'Environment variables for deployment' },
  schema: Yup.object({}) as Yup.ObjectSchema<Record<string, unknown>>,
  Component: EnvVarsStep,
}

// ── Plugin: Git Repository (GitHub / GitLab) ──────────────────────────────────

function GitRepoStep({ values, setFieldValue }: { values: FormValues; setFieldValue: SetFieldValue }) {
  const isGitHub = values.sourceKind === 'github'
  const addVar = () => setFieldValue('envVars', [...values.envVars, { key: '', value: '', secret: false }])
  const removeVar = (i: number) => setFieldValue('envVars', values.envVars.filter((_, idx) => idx !== i))
  const updateVar = (i: number, field: keyof EnvVar, val: unknown) => {
    setFieldValue('envVars', values.envVars.map((v, idx) => idx === i ? { ...v, [field]: val } : v))
  }

  return (
    <div className="space-y-5">
      {/* Auto-deploy */}
      <div className="flex items-center justify-between rounded-xl border border-tundra-ink-200 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-tundra-ink">Auto-deploy on push</p>
          <p className="text-xs text-tundra-ink-400">
            Trigger a deployment whenever code is pushed to <code className="rounded bg-tundra-ink-100 px-1 font-mono">{values.branch || 'main'}</code>
          </p>
        </div>
        <Switch checked={values.gitAutoDeploy} onChange={(v) => setFieldValue('gitAutoDeploy', v)} />
      </div>

      {/* Deploy key instructions */}
      <div className="rounded-xl border border-tundra-ink-200 bg-tundra-ink-50/50 p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">
          {isGitHub ? 'GitHub' : 'GitLab'} Setup
        </p>
        <p className="text-sm text-tundra-ink-500">
          After site creation, you'll need to add a <strong>deploy key</strong> to your repository so Tundra can pull code.
          A unique SSH deploy key will be generated for this site.
        </p>
        <div className="mt-2 flex flex-col gap-1.5 text-xs text-tundra-ink-500">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-tundra-lichen text-white text-[9px] font-bold">1</span>
            <span>Go to <strong>Repository → Settings → {isGitHub ? 'Deploy keys' : 'Repository → Deploy Keys'}</strong></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-tundra-lichen text-white text-[9px] font-bold">2</span>
            <span>Add the deploy key shown on the site detail page after creation</span>
          </div>
          {values.gitAutoDeploy && (
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-tundra-lichen text-white text-[9px] font-bold">3</span>
              <span>Add the webhook URL from the site detail page to your repository webhooks</span>
            </div>
          )}
        </div>
      </div>

      {/* Env vars */}
      <div>
        <p className={LABEL}>Environment Variables <span className="text-tundra-ink-400 font-normal ml-1">optional</span></p>
        <p className={HINT}>Variables written to <code className="font-mono">.env</code> on the server during deployment.</p>
        <div className="mt-3 space-y-2">
          {values.envVars.map((ev, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="text" value={ev.key} onChange={(e) => updateVar(i, 'key', e.target.value.toUpperCase())} placeholder="KEY" className={`${INPUT} w-40 font-mono text-xs`} />
              <input type={ev.secret ? 'password' : 'text'} value={ev.value} onChange={(e) => updateVar(i, 'value', e.target.value)} placeholder="value" className={`${INPUT} flex-1 font-mono text-xs`} />
              <button type="button" onClick={() => updateVar(i, 'secret', !ev.secret)} className={`rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${ev.secret ? 'border-tundra-aurora-300 bg-tundra-aurora-50 text-tundra-aurora-700' : 'border-tundra-ink-200 text-tundra-ink-400 hover:border-tundra-aurora-300'}`}>{ev.secret ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}</button>
              <button type="button" onClick={() => removeVar(i)} className="rounded-lg border border-tundra-ink-200 p-2 text-tundra-ink-400 hover:border-red-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addVar} className="mt-3 text-sm font-medium text-tundra-lichen hover:underline">+ Add variable</button>
      </div>
    </div>
  )
}

const gitPlugin: WizardPlugin = {
  id: 'git',
  matches: (sourceKind) => sourceKind === 'github' || sourceKind === 'gitlab',
  step: { label: 'Repository', desc: 'Git repository settings' },
  schema: Yup.object({}) as Yup.ObjectSchema<Record<string, unknown>>,
  Component: GitRepoStep,
}

// ── All plugins (order matters — first match wins for postCreate) ──────────────

const WIZARD_PLUGINS: WizardPlugin[] = [wpPlugin, gitPlugin, envVarsPlugin]

// ── Runtime / application step constants ─────────────────────────────────────

type RuntimeKind = 'static' | 'php' | 'laravel' | 'nodejs' | 'python' | 'go' | 'ruby' | 'dotnet'

const RUNTIME_HINTS: Record<RuntimeKind, {
  label: string; versionPlaceholder: string; buildHint: string
  startHint: string; portHint: string; hasPort: boolean; icon: React.ReactNode
}> = {
  static:  { label: 'Static',  versionPlaceholder: '',    buildHint: '',                                                  startHint: '',                                   portHint: '',     hasPort: false, icon: <Globe       size={16} /> },
  php:     { label: 'PHP',     versionPlaceholder: '8.3', buildHint: 'composer install --no-dev',                         startHint: '',                                   portHint: '',     hasPort: false, icon: <PhpIcon     size={16} /> },
  laravel: { label: 'Laravel', versionPlaceholder: '8.3', buildHint: 'composer install --no-dev && php artisan optimize', startHint: '',                                   portHint: '',     hasPort: false, icon: <LaravelIcon size={16} /> },
  nodejs:  { label: 'Node.js', versionPlaceholder: '22',  buildHint: 'npm ci && npm run build',                          startHint: 'node dist/index.js',                 portHint: '3000', hasPort: true,  icon: <NodejsIcon  size={16} /> },
  python:  { label: 'Python',  versionPlaceholder: '3.12',buildHint: 'pip install -r requirements.txt',                  startHint: 'gunicorn app:app -b 0.0.0.0:$PORT',  portHint: '8000', hasPort: true,  icon: <PythonIcon  size={16} /> },
  go:      { label: 'Go',      versionPlaceholder: '1.24',buildHint: 'go build -o app .',                                startHint: './app',                              portHint: '8080', hasPort: true,  icon: <GoIcon      size={16} /> },
  ruby:    { label: 'Ruby',    versionPlaceholder: '3.3', buildHint: 'bundle install',                                   startHint: 'bundle exec puma -C config/puma.rb', portHint: '3000', hasPort: true,  icon: <RubyIcon    size={16} /> },
  dotnet:  { label: '.NET',    versionPlaceholder: '9.0', buildHint: 'dotnet publish -c Release -o out',                 startHint: 'dotnet out/App.dll',                 portHint: '5000', hasPort: true,  icon: <DotnetIcon  size={16} /> },
}

// ── Base Yup schemas ──────────────────────────────────────────────────────────

const SCHEMA_SOURCE = Yup.object({
  sourceKind: Yup.string().oneOf(['github', 'gitlab', 'blank', 'template']).required(),
  branch: Yup.string().when('sourceKind', {
    is: (k: string) => k !== 'blank' && k !== 'template',
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
  domain: Yup.string()
    .required('Domain is required')
    .matches(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, 'Enter a valid domain (e.g. example.com)'),
  serverId: Yup.string().required('Select a server'),
})
const SCHEMA_REVIEW = Yup.object({})

// ── Step 1: Source ────────────────────────────────────────────────────────────

const SOURCE_TYPES = [
  { id: 'blank'    as const, label: 'Blank site', desc: 'Start from scratch with an empty document root',
    icon: <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path d="M9 12h6m-3-3v6M3 12a9 9 0 1018 0 9 9 0 00-18 0z" strokeLinecap="round"/></svg> },
  { id: 'template' as const, label: 'Template',   desc: 'WordPress, WooCommerce, Laravel, Next.js and more',
    icon: <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm12-1a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/></svg> },
  { id: 'github'   as const, label: 'GitHub',     desc: 'Deploy from a GitHub repository',   icon: <GithubIcon size={28} /> },
  { id: 'gitlab'   as const, label: 'GitLab',     desc: 'Deploy from a GitLab repository',   icon: <GitlabIcon size={28} /> },
]

function SourceStep({
  values, setFieldValue, allTemplates, pickedTemplateId, setPickedTemplateId, setValues, onSourceKindChange,
}: {
  values: FormValues
  setFieldValue: SetFieldValue
  allTemplates: TemplateManifest[]
  pickedTemplateId: string | undefined
  setPickedTemplateId: (id: string | undefined) => void
  setValues: (fn: (prev: FormValues) => FormValues) => void
  onSourceKindChange: (kind: string) => void
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
              <button key={src.id} type="button"
                onClick={() => {
                  setFieldValue('sourceKind', src.id)
                  onSourceKindChange(src.id)
                  if (src.id !== 'template') setPickedTemplateId(undefined)
                }}
                className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all ${active ? 'border-tundra-lichen bg-tundra-lichen/5 ring-1 ring-tundra-lichen' : 'border-tundra-ink-200 hover:border-tundra-lichen hover:bg-tundra-ink-50'}`}
              >
                <span className={active ? 'text-tundra-lichen' : 'text-tundra-ink-400'}>{src.icon}</span>
                <span className="text-sm font-semibold text-tundra-ink">{src.label}</span>
                <span className="text-xs text-tundra-ink-400 leading-tight">{src.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      {(values.sourceKind === 'github' || values.sourceKind === 'gitlab') && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className={LABEL}>Repository URL</label>
            <input type="url" value={values.repoUrl} onChange={(e) => setFieldValue('repoUrl', e.target.value)} placeholder={values.sourceKind === 'github' ? 'https://github.com/user/repo' : 'https://gitlab.com/user/repo'} className={INPUT} />
            <p className={HINT}>HTTPS or SSH URL of the repository</p>
          </div>
          <div>
            <label className={LABEL}>Branch</label>
            <input type="text" value={values.branch} onChange={(e) => setFieldValue('branch', e.target.value)} placeholder="main" className={INPUT} />
            <ErrorMessage name="branch" component="p" className="mt-1 text-xs text-tundra-rust" />
          </div>
        </div>
      )}

      {values.sourceKind === 'template' && (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative">
              <svg className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input type="search" placeholder="Search templates…" value={tmplSearch} onChange={(e) => setTmplSearch(e.target.value)} className="h-8 w-44 rounded-lg border border-tundra-ink-200 bg-white pl-8 pr-3 text-xs focus:border-tundra-lichen focus:outline-none" />
            </div>
            <div className="flex flex-wrap gap-1">
              {categories.map((cat) => (
                <button key={cat} type="button" onClick={() => setTmplCategory(cat)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize transition-colors ${tmplCategory === cat ? 'border-tundra-lichen bg-tundra-lichen text-white' : 'border-tundra-ink-200 text-tundra-ink-500 hover:border-tundra-lichen'}`}
                >{cat}</button>
              ))}
            </div>
          </div>

          {allTemplates.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-xl border border-tundra-ink-200"><p className="animate-pulse text-sm text-tundra-ink-400">Loading templates…</p></div>
          ) : filteredTmpls.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-xl border border-tundra-ink-200"><p className="text-sm text-tundra-ink-400">No templates match the filter.</p></div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTmpls.map((tmpl) => {
                const isPicked = pickedTemplateId === tmpl.id
                return (
                  <button key={tmpl.id} type="button"
                    onClick={() => {
                      setPickedTemplateId(tmpl.id)
                      onSourceKindChange('template')
                      setValues((prev) => ({
                        ...prev, sourceKind: 'template', kind: tmpl.runtime.kind,
                        runtimeVersion: tmpl.runtime.version ?? '',
                        buildCommand: tmpl.build_command ?? '',
                        startCommand: tmpl.start_command ?? '',
                        listenPort: tmpl.listen_port != null ? String(tmpl.listen_port) : '',
                      }))
                    }}
                    className={`relative rounded-xl border p-4 text-left transition-all hover:shadow-sm ${isPicked ? 'border-tundra-lichen bg-tundra-lichen/5 ring-1 ring-tundra-lichen' : 'border-tundra-ink-200 hover:border-tundra-lichen'}`}
                  >
                    {isPicked && (
                      <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-tundra-lichen text-white">
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
                      </span>
                    )}
                    <p className="font-semibold text-sm text-tundra-ink">{tmpl.name}</p>
                    {tmpl.tags[0] && (
                      <span className="mt-1 inline-block rounded border border-tundra-ink-100 bg-tundra-ink-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tundra-ink-400">{tmpl.tags[0]}</span>
                    )}
                    <p className="mt-1.5 line-clamp-2 text-xs text-tundra-ink-400">{tmpl.description}</p>
                    <div className="mt-2 flex items-center gap-1 text-xs text-tundra-ink-300">
                      <span className="text-tundra-ink-400">{RUNTIME_HINTS[tmpl.runtime.kind as RuntimeKind]?.icon ?? <Package className="h-4 w-4" />}</span>
                      {tmpl.runtime.kind}{tmpl.runtime.version ? ` ${tmpl.runtime.version}` : ''}
                    </div>
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

function AppStep({ values, setFieldValue }: { values: FormValues; setFieldValue: SetFieldValue }) {
  const hints = (RUNTIME_HINTS as Record<string, (typeof RUNTIME_HINTS)[RuntimeKind]>)[values.kind] ?? RUNTIME_HINTS.static
  return (
    <div className="space-y-5">
      <div>
        <p className={LABEL}>Application type</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(RUNTIME_HINTS) as RuntimeKind[]).map((rt) => {
            const h = RUNTIME_HINTS[rt]; const active = values.kind === rt
            return (
              <button key={rt} type="button" onClick={() => setFieldValue('kind', rt)}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all ${active ? 'border-tundra-lichen bg-tundra-lichen/5 ring-1 ring-tundra-lichen' : 'border-tundra-ink-200 hover:border-tundra-lichen hover:bg-tundra-ink-50'}`}
              >
                <span className={active ? 'text-tundra-lichen' : 'text-tundra-ink-400'}>{h.icon}</span>
                <span className={`text-sm font-medium ${active ? 'text-tundra-lichen-700' : 'text-tundra-ink'}`}>{h.label}</span>
              </button>
            )
          })}
        </div>
        <ErrorMessage name="kind" component="p" className="mt-1 text-xs text-tundra-rust" />
      </div>
      {values.kind !== 'static' && (
        <div>
          <label className={LABEL}>Runtime version <span className="ml-1 text-tundra-ink-400 font-normal">({hints.versionPlaceholder})</span></label>
          <input type="text" value={values.runtimeVersion} onChange={(e) => setFieldValue('runtimeVersion', e.target.value)} placeholder={hints.versionPlaceholder} className={INPUT} />
          <ErrorMessage name="runtimeVersion" component="p" className="mt-1 text-xs text-tundra-rust" />
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
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL}>Primary domain</label>
          <input type="text" value={values.domain} onChange={(e) => { const v = e.target.value.toLowerCase().trim(); setFieldValue('domain', v); if (!values.name) setFieldValue('name', v) }} placeholder="example.com" className={INPUT} autoComplete="off" spellCheck={false} />
          <ErrorMessage name="domain" component="p" className="mt-1 text-xs text-tundra-rust" />
          <p className={HINT}>Must be a valid domain you control.</p>
        </div>
        <div>
          <label className={LABEL}>Site display name <span className="ml-1 text-xs font-normal text-tundra-ink-400">optional</span></label>
          <input type="text" value={values.name} onChange={(e) => setFieldValue('name', e.target.value)} placeholder={values.domain || 'My Site'} className={INPUT} />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-tundra-ink-200 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-tundra-ink">Enable SSL / HTTPS</p>
          <p className="text-xs text-tundra-ink-400">Automatically issues a Let's Encrypt certificate after provisioning</p>
        </div>
        <Switch checked={values.enableSsl} onChange={(v) => setFieldValue('enableSsl', v)} />
      </div>
      <div>
        <p className={LABEL}>Server</p>
        <ErrorMessage name="serverId" component="p" className="mb-2 text-xs text-tundra-rust" />
        {servers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-tundra-ink-200 p-6 text-center">
            <p className="text-sm text-tundra-ink-400">No servers enrolled yet.</p>
            <Link to="/servers" className="mt-1 inline-block text-xs font-medium text-tundra-lichen hover:underline">Enroll a server →</Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {servers.map((srv) => {
              const active = values.serverId === srv.id
              return (
                <button key={srv.id} type="button" onClick={() => setFieldValue('serverId', srv.id)}
                  className={`relative rounded-xl border p-4 text-left transition-all ${active ? 'border-tundra-lichen bg-tundra-lichen/5 ring-1 ring-tundra-lichen' : 'border-tundra-ink-200 hover:border-tundra-lichen hover:bg-tundra-ink-50'}`}
                >
                  {active && <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-tundra-lichen text-white"><svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span>}
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="h-4 w-4 text-tundra-ink-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                    <p className="font-semibold text-sm text-tundra-ink">{srv.name}</p>
                  </div>
                  <p className="font-mono text-xs text-tundra-ink-400">{srv.hostname}</p>
                  {srv.os && <p className="mt-1 text-xs text-tundra-ink-400">{srv.os}</p>}
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

// ── Review step ───────────────────────────────────────────────────────────────

function ReviewStep({
  values, servers, selectedTemplate, activePlugins,
}: {
  values: FormValues
  servers: Server[]
  selectedTemplate: TemplateManifest | undefined
  activePlugins: WizardPlugin[]
}) {
  const server = servers.find((s) => s.id === values.serverId)
  const hints = (RUNTIME_HINTS as Record<string, (typeof RUNTIME_HINTS)[RuntimeKind]>)[values.kind] ?? RUNTIME_HINTS.static

  const siteRows = [
    { label: 'Domain',    value: values.domain },
    { label: 'Site name', value: values.name || values.domain },
    { label: 'Server',    value: server ? `${server.name} (${server.hostname})` : '—' },
    { label: 'Source',    value: values.sourceKind === 'template' && selectedTemplate ? `Template: ${selectedTemplate.name}` : values.sourceKind === 'blank' ? 'Blank site' : `${values.sourceKind}: ${values.repoUrl || '—'} @ ${values.branch}` },
    { label: 'Runtime',   value: hints.label + (values.runtimeVersion ? ` ${values.runtimeVersion}` : '') },
    ...(values.buildCommand  ? [{ label: 'Build', value: values.buildCommand,  mono: true }] : []),
    ...(values.startCommand  ? [{ label: 'Start', value: values.startCommand,  mono: true }] : []),
    ...(values.listenPort    ? [{ label: 'Port',  value: values.listenPort }] : []),
    { label: 'SSL', value: values.enableSsl ? "Enabled (Let's Encrypt)" : 'Disabled' },
  ]

  const hasWp  = activePlugins.some((p) => p.id === 'wordpress')
  const hasGit = activePlugins.some((p) => p.id === 'git')
  const hasEnv = activePlugins.some((p) => p.id === 'env_vars')
  const filledEnvVars = values.envVars.filter((v) => v.key)

  const timelineSteps: Array<{ icon: React.ReactNode; label: string; time: string }> = hasWp
    ? [
        { icon: <Database     className="h-4 w-4" />, label: 'Database and user created',              time: '~5s' },
        { icon: <FolderOpen   className="h-4 w-4" />, label: 'Document root provisioned on server',    time: '~10s' },
        { icon: <Download     className="h-4 w-4" />, label: 'WordPress core downloaded via WP-CLI',   time: '~30s' },
        { icon: <Settings2    className="h-4 w-4" />, label: 'WordPress configured and installed',      time: '~45s' },
        { icon: <ShieldCheck  className="h-4 w-4" />, label: values.enableSsl ? 'SSL certificate issued' : 'HTTP configured', time: '~1min' },
        { icon: <CheckCircle2 className="h-4 w-4" />, label: 'WordPress site live',                    time: '~2min' },
      ]
    : hasGit
    ? [
        { icon: <Key          className="h-4 w-4" />, label: 'Deploy key generated for repository',    time: '~5s' },
        { icon: <FolderOpen   className="h-4 w-4" />, label: 'Document root provisioned',              time: '~10s' },
        { icon: <Download     className="h-4 w-4" />, label: 'Code cloned from repository',            time: '~20s' },
        { icon: <Settings2    className="h-4 w-4" />, label: values.buildCommand ? 'Build command executed' : 'Files deployed', time: '~30s' },
        { icon: <ShieldCheck  className="h-4 w-4" />, label: values.enableSsl ? 'SSL certificate issued' : 'HTTP configured', time: '~45s' },
        { icon: <CheckCircle2 className="h-4 w-4" />, label: 'Site goes live',                         time: '~1min' },
      ]
    : [
        { icon: <Database     className="h-4 w-4" />, label: 'Database and user created',              time: '~5s' },
        { icon: <FolderOpen   className="h-4 w-4" />, label: 'Document root provisioned on server',    time: '~10s' },
        { icon: <Settings2    className="h-4 w-4" />, label: values.buildCommand ? 'Build command executed' : 'Files synced', time: '~30s' },
        { icon: <ShieldCheck  className="h-4 w-4" />, label: values.enableSsl ? 'SSL certificate issued' : 'HTTP configured', time: '~45s' },
        { icon: <CheckCircle2 className="h-4 w-4" />, label: 'Site goes live',                         time: '~1min' },
      ]

  return (
    <div className="space-y-5">
      {/* Site config */}
      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
        <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Deployment configuration</span>
        </div>
        <div className="divide-y divide-tundra-ink-100">
          {siteRows.map(({ label, value, mono }) => (
            <div key={label} className="flex items-start gap-4 px-4 py-2.5 text-sm">
              <span className="w-24 shrink-0 text-tundra-ink-400">{label}</span>
              <span className={`flex-1 ${mono ? 'font-mono text-xs' : ''} text-tundra-ink`}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* WordPress config */}
      {hasWp && (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-lichen/5 px-4 py-2.5 flex items-center gap-2">
            <WordpressIcon size={16} className="text-tundra-lichen-700" />
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-lichen-700">WordPress configuration</span>
          </div>
          <div className="divide-y divide-tundra-ink-100">
            {[
              { label: 'WP Version',  value: values.wpVersion || 'latest' },
              { label: 'Site Title',  value: values.wpSiteTitle },
              { label: 'Admin User',  value: values.wpAdminUser },
              { label: 'Admin Email', value: values.wpAdminEmail },
              { label: 'Password',    value: '••••••••' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start gap-4 px-4 py-2.5 text-sm">
                <span className="w-24 shrink-0 text-tundra-ink-400">{label}</span>
                <span className="flex-1 text-tundra-ink">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Git config */}
      {hasGit && (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5 flex items-center gap-2">
            {values.sourceKind === 'github'
              ? <GithubIcon size={16} className="text-tundra-ink-500" />
              : <GitlabIcon size={16} className="text-tundra-ink-500" />
            }
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">
              {values.sourceKind === 'github' ? 'GitHub' : 'GitLab'} repository
            </span>
          </div>
          <div className="divide-y divide-tundra-ink-100">
            {[
              { label: 'Repo',        value: values.repoUrl || '—' },
              { label: 'Branch',      value: values.branch || 'main' },
              { label: 'Auto-deploy', value: values.gitAutoDeploy ? 'Enabled' : 'Disabled' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start gap-4 px-4 py-2.5 text-sm">
                <span className="w-24 shrink-0 text-tundra-ink-400">{label}</span>
                <span className="flex-1 text-tundra-ink font-mono text-xs">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Env vars summary */}
      {(hasEnv || (hasGit && filledEnvVars.length > 0)) && filledEnvVars.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Environment variables ({filledEnvVars.length})</span>
          </div>
          <div className="divide-y divide-tundra-ink-100">
            {filledEnvVars.map((ev) => (
              <div key={ev.key} className="flex items-center gap-4 px-4 py-2 text-sm">
                <span className="font-mono text-xs text-tundra-ink w-40 shrink-0">{ev.key}</span>
                <span className="flex-1 font-mono text-xs text-tundra-ink-400">{ev.secret ? '••••••••' : ev.value || '(empty)'}</span>
                {ev.secret && <span className="text-[10px] border border-tundra-aurora-300 bg-tundra-aurora-50 text-tundra-aurora-700 rounded px-1.5 py-0.5">secret</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What happens next */}
      <div className="rounded-xl border border-tundra-ink-200 bg-white p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">What happens next</p>
        <div className="space-y-3">
          {timelineSteps.map(({ icon, label, time }, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-500">{icon}</div>
              <span className="flex-1 text-tundra-ink-600">{label}</span>
              <span className="text-xs text-tundra-ink-300">{time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Sidebar summary ───────────────────────────────────────────────────────────

function SidebarSummary({ values, step, servers, selectedTemplate, steps, activePlugins }: {
  values: FormValues; step: number; servers: Server[]
  selectedTemplate: TemplateManifest | undefined
  steps: Array<{ id: number; label: string; desc: string }>
  activePlugins: WizardPlugin[]
}) {
  const server = servers.find((s) => s.id === values.serverId)
  const hints = (RUNTIME_HINTS as Record<string, (typeof RUNTIME_HINTS)[RuntimeKind]>)[values.kind] ?? RUNTIME_HINTS.static

  const items: Array<{ label: string; value: string | undefined }> = [
    { label: 'Domain',  value: values.domain || undefined },
    { label: 'Source',  value: values.sourceKind === 'template' && selectedTemplate ? selectedTemplate.name : values.sourceKind === 'blank' ? 'Blank' : values.sourceKind === 'github' ? `GitHub${values.repoUrl ? ` — ${values.repoUrl.split('/').slice(-1)[0]}` : ''}` : values.sourceKind === 'gitlab' ? 'GitLab' : undefined },
    { label: 'Runtime', value: step >= 1 ? hints.label + (values.runtimeVersion ? ` ${values.runtimeVersion}` : '') : undefined },
    { label: 'Server',  value: step >= 2 && server ? server.name : undefined },
    { label: 'SSL',     value: step >= 2 ? (values.enableSsl ? 'Enabled' : 'Disabled') : undefined },
    ...(activePlugins.some(p => p.id === 'wordpress') && values.wpSiteTitle
      ? [{ label: 'WP Title', value: values.wpSiteTitle }] : []),
    ...(activePlugins.some(p => p.id === 'git') && values.gitAutoDeploy
      ? [{ label: 'Auto-deploy', value: 'Enabled' }] : []),
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
              {items.map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-tundra-ink-400">{label}</p>
                  <p className="mt-0.5 text-sm text-tundra-ink break-all">{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-tundra-ink-100 p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-tundra-ink-400">Progress</p>
          <div className="space-y-2">
            {steps.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${s.id < step ? 'bg-tundra-lichen text-white' : s.id === step ? 'bg-tundra-ink text-white' : 'border border-tundra-ink-200 text-tundra-ink-300'}`}>
                  {s.id < step ? <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg> : s.id + 1}
                </div>
                <span className={`text-xs ${s.id === step ? 'font-semibold text-tundra-ink' : s.id < step ? 'text-tundra-lichen-700' : 'text-tundra-ink-400'}`}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface SitesNewSearch { template?: string }

export const Route = createFileRoute('/_auth/sites/new')({
  validateSearch: (search: Record<string, unknown>): SitesNewSearch => ({
    template: typeof search.template === 'string' ? search.template : undefined,
  }),
  component: CreateSitePage,
})

function CreateSitePage() {
  const router = useRouter()
  const { template: templateId } = Route.useSearch()
  const [step, setStep] = useState(0)
  const [result, setResult] = useState<CreateSiteResponse | null>(null)
  // Mirror of Formik sourceKind for computing active plugins outside render prop
  const [sourceKind, setSourceKind] = useState<string>(templateId ? 'template' : 'blank')

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
  const servers      = serversData?.data ?? []

  const [pickedTemplateId, setPickedTemplateId] = useState<string | undefined>(templateId)
  const selectedTemplate = pickedTemplateId ? allTemplates.find((t) => t.id === pickedTemplateId) : undefined

  const activePlugins = useMemo(
    () => WIZARD_PLUGINS.filter((p) => p.matches(sourceKind, selectedTemplate)),
    [sourceKind, selectedTemplate],
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

  const stepSchemas = useMemo(
    () => [SCHEMA_SOURCE, SCHEMA_APP, SCHEMA_DOMAIN, ...activePlugins.map((p) => p.schema), SCHEMA_REVIEW],
    [activePlugins],
  )

  const reviewStepIndex = STEPS.length - 1

  const initialValues: FormValues = {
    sourceKind: templateId ? 'template' : 'blank',
    repoUrl: '', branch: 'main',
    kind: selectedTemplate ? selectedTemplate.runtime.kind : 'static',
    runtimeVersion: selectedTemplate?.runtime.version ?? '',
    buildCommand: selectedTemplate?.build_command ?? '',
    startCommand: selectedTemplate?.start_command ?? '',
    listenPort: selectedTemplate?.listen_port != null ? String(selectedTemplate.listen_port) : '',
    healthCheckPath: '/',
    domain: '', serverId: '', name: '', enableSsl: true,
    wpSiteTitle: '', wpAdminUser: 'admin', wpAdminEmail: '', wpAdminPassword: '',
    wpVersion: 'latest', wpShowPassword: false,
    envVars: [], gitAutoDeploy: true,
  }

  if (result) {
    return (
      <div className="max-w-lg">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-tundra-lichen/10">
          <svg className="h-8 w-8 text-tundra-lichen" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <h1 className="mb-2 text-2xl font-bold text-tundra-ink">Site created!</h1>
        <p className="mb-1 text-tundra-ink-500"><strong>{result.data.primary_domain}</strong> is now provisioning.</p>
        <p className="mb-6 text-sm text-tundra-ink-400">
          Deployment <code className="rounded bg-tundra-ink-100 px-1 font-mono">{result.deployment.id.slice(0, 8)}</code> is queued.
        </p>
        <div className="flex gap-3">
          <button type="button" onClick={() => { void router.navigate({ to: '/sites/$siteId', params: { siteId: result.data.id } }) }} className="rounded-lg bg-tundra-lichen px-5 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
            View site →
          </button>
          <Link to="/sites" className="rounded-lg border border-tundra-ink-200 px-5 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">All sites</Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-tundra-ink">Create site</h1>
          <p className="mt-0.5 text-sm text-tundra-ink-400">Step {step + 1} of {STEPS.length} — {STEPS[step]?.desc}</p>
        </div>
        <Link to="/sites" className="rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm text-tundra-ink-500 hover:bg-tundra-ink-50 transition-colors">Cancel</Link>
      </div>

      <div className="mb-8 flex gap-1.5">
        {STEPS.map((s) => (
          <div key={s.id} className="flex-1">
            <div className={`h-1 rounded-full transition-colors ${s.id <= step ? 'bg-tundra-lichen' : 'bg-tundra-ink-100'}`} />
            <p className={`mt-1.5 hidden text-xs sm:block ${s.id === step ? 'font-semibold text-tundra-ink' : s.id < step ? 'text-tundra-lichen-600' : 'text-tundra-ink-300'}`}>{s.label}</p>
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
                  source_kind: values.sourceKind,
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

            // Run postCreate for each active plugin in order; first redirect wins
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
              const isAbsolute = redirect.startsWith('/')
              toast.success(activePlugins.some(p => p.id === 'wordpress') ? 'Site created — WordPress installation started' : 'Site created — provisioning started')
              if (isAbsolute) {
                // TanStack Router navigate from path string
                void router.navigate({ to: redirect as never })
              }
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
            <div className="flex gap-8">
              <div className="min-w-0 flex-1">
                <div className="rounded-xl border border-tundra-ink-200 bg-white p-6">
                  <h2 className="mb-5 text-base font-semibold text-tundra-ink">{STEPS[step]?.label}</h2>

                  {step === 0 && (
                    <SourceStep
                      values={values}
                      setFieldValue={setFieldValue}
                      allTemplates={allTemplates}
                      pickedTemplateId={pickedTemplateId}
                      setPickedTemplateId={setPickedTemplateId}
                      setValues={(fn) => { void setValues(fn(values)) }}
                      onSourceKindChange={setSourceKind}
                    />
                  )}
                  {step === 1 && <AppStep values={values} setFieldValue={setFieldValue} />}
                  {step === 2 && <DomainStep values={values} setFieldValue={setFieldValue} servers={servers} />}

                  {/* Plugin steps (dynamic) */}
                  {activePlugins.map((plugin, i) => {
                    const pluginStep = 3 + i
                    if (step !== pluginStep) return null
                    return <plugin.Component key={plugin.id} values={values} setFieldValue={setFieldValue} />
                  })}

                  {step === reviewStepIndex && (
                    <ReviewStep values={values} servers={servers} selectedTemplate={selectedTemplate} activePlugins={activePlugins} />
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <button type="button"
                    onClick={() => { step === 0 ? void router.navigate({ to: '/sites' }) : setStep((s) => s - 1) }}
                    className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
                  >
                    {step === 0 ? 'Cancel' : '← Back'}
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5 sm:hidden">
                      {STEPS.map((s) => (
                        <div key={s.id} className={`h-1.5 rounded-full transition-all ${s.id === step ? 'w-4 bg-tundra-lichen' : s.id < step ? 'w-1.5 bg-tundra-lichen' : 'w-1.5 bg-tundra-ink-200'}`} />
                      ))}
                    </div>
                    <button
                      type="submit"
                      disabled={isSubmitting || (step === 0 && values.sourceKind === 'template' && !pickedTemplateId)}
                      className="rounded-lg bg-tundra-lichen px-6 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
                    >
                      {isSubmitting
                        ? 'Creating…'
                        : step < STEPS.length - 1
                          ? 'Next →'
                          : activePlugins.some(p => p.id === 'wordpress')
                            ? 'Create & Install WordPress'
                            : 'Create site'
                      }
                    </button>
                  </div>
                </div>
              </div>

              <SidebarSummary
                values={values}
                step={step}
                servers={servers}
                selectedTemplate={selectedTemplate}
                steps={STEPS}
                activePlugins={activePlugins}
              />
            </div>
          </Form>
        )}
      </Formik>
    </div>
  )
}
