import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Formik, Form, Field, ErrorMessage } from 'formik'
import * as Yup from 'yup'
import { useState } from 'react'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CreateSiteResponse, ListResponse, Server, TemplateManifest } from '@/lib/api-types'
import { Button } from '@/components/ui/button'
import { SITE_TEMPLATES } from '@/lib/site-templates'

interface SitesNewSearch {
  template?: string
}

export const Route = createFileRoute('/_auth/sites/new')({
  validateSearch: (search: Record<string, unknown>): SitesNewSearch => ({
    template: typeof search.template === 'string' ? search.template : undefined,
  }),
  component: CreateSitePage,
})

const STEPS = ['Source', 'Application', 'Domain', 'Confirm'] as const

const stepSchemas = [
  Yup.object({
    sourceKind: Yup.string().oneOf(['github', 'gitlab', 'blank', 'template']).required(),
    branch: Yup.string().when('sourceKind', {
      is: (k: string) => k !== 'blank',
      then: (s) => s.required('Branch is required'),
    }),
  }),
  Yup.object({
    kind: Yup.string().required('Application type is required'),
    runtimeVersion: Yup.string().required('Runtime version is required'),
  }),
  Yup.object({
    domain: Yup.string()
      .required('Domain is required')
      .matches(
        /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
        'Invalid domain',
      ),
    serverId: Yup.string().required('Server is required'),
  }),
  Yup.object({}),
]

interface FormValues {
  sourceKind: 'github' | 'gitlab' | 'blank' | 'template'
  branch: string
  kind: string
  runtimeVersion: string
  buildCommand: string
  startCommand: string
  listenPort: string
  domain: string
  serverId: string
  name: string
}

type RuntimeKind = 'static' | 'php' | 'laravel' | 'nodejs' | 'python' | 'go' | 'ruby' | 'dotnet'

const RUNTIME_HINTS: Record<RuntimeKind, { versionPlaceholder: string; buildHint: string; startHint: string; portHint: string; hasPort: boolean }> = {
  static:  { versionPlaceholder: '',           buildHint: '',                            startHint: '',                            portHint: '',     hasPort: false },
  php:     { versionPlaceholder: 'e.g. 8.4',   buildHint: 'composer install --no-dev',   startHint: '',                            portHint: '',     hasPort: false },
  laravel: { versionPlaceholder: 'e.g. 8.4',   buildHint: 'composer install --no-dev',   startHint: '',                            portHint: '',     hasPort: false },
  nodejs:  { versionPlaceholder: 'e.g. 22',    buildHint: 'npm ci && npm run build',      startHint: 'node dist/index.js',           portHint: '3000', hasPort: true  },
  python:  { versionPlaceholder: 'e.g. 3.13',  buildHint: 'pip install -r requirements.txt', startHint: 'gunicorn app:app -b 0.0.0.0:$PORT', portHint: '8000', hasPort: true },
  go:      { versionPlaceholder: 'e.g. 1.24',  buildHint: 'go build -o app .',            startHint: './app',                        portHint: '8080', hasPort: true  },
  ruby:    { versionPlaceholder: 'e.g. 3.4',   buildHint: 'bundle install --without dev test', startHint: 'bundle exec puma -C config/puma.rb', portHint: '3000', hasPort: true },
  dotnet:  { versionPlaceholder: 'e.g. 9.0',   buildHint: 'dotnet publish -c Release',    startHint: 'dotnet publish/MyApp.dll',      portHint: '5000', hasPort: true  },
}

function CreateSitePage() {
  const router = useRouter()
  const { template: templateId } = Route.useSearch()
  const [step, setStep] = useState(0)
  const [result, setResult] = useState<CreateSiteResponse | null>(null)

  const { data: serversData } = useQuery({
    queryKey: ['servers'],
    queryFn: () => api<ListResponse<Server>>('/servers'),
  })

  // Fetch templates so we can pre-fill values from the ?template= search param.
  const { data: templatesData } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api<{ data: TemplateManifest[] }>('/templates'),
    staleTime: Infinity,
    enabled: !!templateId,
  })

  const selectedTemplate = templateId
    ? (templatesData?.data ?? []).find((t) => t.id === templateId)
    : undefined

  const initialValues: FormValues = {
    sourceKind: selectedTemplate ? 'template' : 'blank',
    branch: 'main',
    kind: selectedTemplate
      ? (selectedTemplate.runtime.kind === 'static' ? 'static' : selectedTemplate.runtime.kind)
      : 'static',
    runtimeVersion: selectedTemplate?.runtime.version ?? '',
    buildCommand: selectedTemplate?.build_command ?? '',
    startCommand: selectedTemplate?.start_command ?? '',
    listenPort: selectedTemplate?.listen_port != null ? String(selectedTemplate.listen_port) : '',
    domain: '',
    serverId: '',
    name: '',
  }

  if (result) {
    return (
      <div className="max-w-lg">
        <h1 className="mb-4 text-2xl font-semibold">Site created</h1>
        <p className="mb-2 text-tundra-ink-500">
          <strong>{result.data.primary_domain}</strong> is provisioning.
        </p>
        <p className="mb-6 text-sm text-tundra-ink-400">
          Deployment <code>{result.deployment.id.slice(0, 8)}</code> is queued.
        </p>
        <Button onClick={() => { void router.navigate({ to: '/sites/$siteId', params: { siteId: result.data.id } }) }}>
          View site
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Create site</h1>

      {/* Step indicator */}
      <div className="mb-8 flex gap-2">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`flex-1 rounded-full h-1.5 ${i <= step ? 'bg-tundra-lichen' : 'bg-tundra-ink-100'}`}
          />
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
                  health_check_path: '/',
                  source_kind: values.sourceKind,
                  source_config: {
                    branch: values.branch || undefined,
                    template_id: values.sourceKind === 'template' && selectedTemplate
                      ? selectedTemplate.id
                      : undefined,
                  },
                },
              },
            })
            setResult(res)
            toast.success('Site created')
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to create site')
          } finally {
            setSubmitting(false)
          }
        }}
      >
        {({ isSubmitting, values, setValues }) => (
          <Form className="flex flex-col gap-5">
            <h2 className="text-lg font-medium">{STEPS[step]}</h2>

            {step === 0 && (
              <>
                <label className="flex flex-col gap-1.5 text-sm">
                  Source type
                  <Field as="select" name="sourceKind"
                    className="rounded border border-tundra-ink-200 px-3 py-2">
                    <option value="blank">Blank (empty)</option>
                    <option value="github">GitHub</option>
                    <option value="gitlab">GitLab</option>
                    <option value="template">Template</option>
                  </Field>
                </label>

                {values.sourceKind === 'template' && (
                  <div>
                    <p className="mb-2 text-sm text-tundra-ink-500">Pick a starter template — fields on the next step will be pre-filled.</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {SITE_TEMPLATES.map((tmpl) => (
                        <button
                          key={tmpl.id}
                          type="button"
                          className="rounded-lg border border-tundra-ink-200 p-3 text-left hover:border-tundra-lichen hover:bg-tundra-lichen/5 transition-colors"
                          onClick={() => {
                            void setValues((prev) => ({
                              ...prev,
                              kind: tmpl.kind,
                              runtimeVersion: tmpl.runtimeVersion,
                              buildCommand: tmpl.buildCommand,
                              startCommand: tmpl.startCommand,
                              listenPort: tmpl.listenPort,
                            }))
                          }}
                        >
                          <p className="font-medium text-sm">{tmpl.label}</p>
                          <p className="text-xs text-tundra-ink-400 mt-0.5">{tmpl.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {values.sourceKind !== 'blank' && values.sourceKind !== 'template' && (
                  <label className="flex flex-col gap-1.5 text-sm">
                    Branch
                    <Field name="branch"
                      className="rounded border border-tundra-ink-200 px-3 py-2"
                      placeholder="main" />
                    <ErrorMessage name="branch" component="p" className="text-tundra-rust text-xs" />
                  </label>
                )}
              </>
            )}

            {step === 1 && (() => {
              const hints = (RUNTIME_HINTS as Record<string, typeof RUNTIME_HINTS.static>)[values.kind] ?? RUNTIME_HINTS.static
              return (
                <>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Application type
                    <Field as="select" name="kind"
                      className="rounded border border-tundra-ink-200 px-3 py-2">
                      <option value="static">Static</option>
                      <option value="php">PHP</option>
                      <option value="laravel">Laravel (PHP)</option>
                      <option value="nodejs">Node.js</option>
                      <option value="python">Python</option>
                      <option value="go">Go</option>
                      <option value="ruby">Ruby</option>
                      <option value="dotnet">.NET</option>
                    </Field>
                  </label>

                  {values.kind !== 'static' && (
                    <label className="flex flex-col gap-1.5 text-sm">
                      Runtime version
                      <Field name="runtimeVersion"
                        className="rounded border border-tundra-ink-200 px-3 py-2"
                        placeholder={hints.versionPlaceholder} />
                      <ErrorMessage name="runtimeVersion" component="p" className="text-tundra-rust text-xs" />
                    </label>
                  )}

                  <label className="flex flex-col gap-1.5 text-sm">
                    Build command <span className="text-tundra-ink-400">(optional)</span>
                    <Field name="buildCommand"
                      className="rounded border border-tundra-ink-200 px-3 py-2"
                      placeholder={hints.buildHint || 'e.g. npm ci && npm run build'} />
                  </label>

                  {hints.hasPort && (
                    <>
                      <label className="flex flex-col gap-1.5 text-sm">
                        Start command
                        <Field name="startCommand"
                          className="rounded border border-tundra-ink-200 px-3 py-2"
                          placeholder={hints.startHint} />
                      </label>
                      <label className="flex flex-col gap-1.5 text-sm">
                        Listen port
                        <Field name="listenPort"
                          className="rounded border border-tundra-ink-200 px-3 py-2"
                          placeholder={hints.portHint} />
                      </label>
                    </>
                  )}
                </>
              )
            })()}

            {step === 2 && (
              <>
                <label className="flex flex-col gap-1.5 text-sm">
                  Primary domain
                  <Field name="domain"
                    className="rounded border border-tundra-ink-200 px-3 py-2"
                    placeholder="example.com" />
                  <ErrorMessage name="domain" component="p" className="text-tundra-rust text-xs" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  Server
                  <Field as="select" name="serverId"
                    className="rounded border border-tundra-ink-200 px-3 py-2">
                    <option value="">— select a server —</option>
                    {serversData?.data.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.hostname})</option>
                    ))}
                  </Field>
                  <ErrorMessage name="serverId" component="p" className="text-tundra-rust text-xs" />
                </label>
              </>
            )}

            {step === 3 && (
              <dl className="grid grid-cols-2 gap-3 text-sm rounded-lg border border-tundra-ink-200 p-4">
                <dt className="font-medium">Domain</dt><dd>{values.domain}</dd>
                <dt className="font-medium">Source</dt><dd>{values.sourceKind}{values.branch ? ` @ ${values.branch}` : ''}</dd>
                <dt className="font-medium">App type</dt><dd>{values.kind}</dd>
                {values.runtimeVersion && <><dt className="font-medium">Runtime</dt><dd>{values.runtimeVersion}</dd></>}
                {values.buildCommand && <><dt className="font-medium">Build</dt><dd className="truncate">{values.buildCommand}</dd></>}
                {values.startCommand && <><dt className="font-medium">Start</dt><dd className="truncate">{values.startCommand}</dd></>}
                {values.listenPort && <><dt className="font-medium">Port</dt><dd>{values.listenPort}</dd></>}
              </dl>
            )}

            <div className="flex gap-3 pt-2">
              {step > 0 && (
                <Button type="button" variant="outline" onClick={() => { setStep((s) => s - 1); }}>
                  Back
                </Button>
              )}
              <Button type="submit" loading={isSubmitting}>
                {step < STEPS.length - 1 ? 'Next' : 'Create site'}
              </Button>
            </div>
          </Form>
        )}
      </Formik>
    </div>
  )
}
