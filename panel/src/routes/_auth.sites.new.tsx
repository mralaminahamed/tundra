import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Formik, Form, Field, ErrorMessage } from 'formik'
import * as Yup from 'yup'
import { useState } from 'react'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CreateSiteResponse, ListResponse, Server } from '@/lib/api-types'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_auth/sites/new')({
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
  domain: string
  serverId: string
  name: string
}

function CreateSitePage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [result, setResult] = useState<CreateSiteResponse | null>(null)

  const { data: serversData } = useQuery({
    queryKey: ['servers'],
    queryFn: () => api<ListResponse<Server>>('/servers'),
  })

  const initialValues: FormValues = {
    sourceKind: 'blank',
    branch: 'main',
    kind: 'static',
    runtimeVersion: '',
    buildCommand: '',
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
                  runtime_version: values.runtimeVersion || '1.0',
                  build_command: values.buildCommand || null,
                  health_check_path: '/',
                  source_kind: values.sourceKind,
                  source_config: { branch: values.branch },
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
        {({ isSubmitting, values }) => (
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
                {values.sourceKind !== 'blank' && (
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

            {step === 1 && (
              <>
                <label className="flex flex-col gap-1.5 text-sm">
                  Application type
                  <Field as="select" name="kind"
                    className="rounded border border-tundra-ink-200 px-3 py-2">
                    <option value="static">Static</option>
                    <option value="php">PHP</option>
                    <option value="laravel">Laravel</option>
                    <option value="nodejs">Node.js</option>
                    <option value="python">Python</option>
                    <option value="go">Go</option>
                  </Field>
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  Runtime version
                  <Field name="runtimeVersion"
                    className="rounded border border-tundra-ink-200 px-3 py-2"
                    placeholder="e.g. 8.4 / 22 / 3.13" />
                  <ErrorMessage name="runtimeVersion" component="p" className="text-tundra-rust text-xs" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  Build command (optional)
                  <Field name="buildCommand"
                    className="rounded border border-tundra-ink-200 px-3 py-2"
                    placeholder="npm ci && npm run build" />
                </label>
              </>
            )}

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
                <dt className="font-medium">Source</dt><dd>{values.sourceKind}</dd>
                <dt className="font-medium">App type</dt><dd>{values.kind}</dd>
                <dt className="font-medium">Runtime</dt><dd>{values.runtimeVersion || '—'}</dd>
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
