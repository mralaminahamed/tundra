import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Formik, Form, Field, ErrorMessage } from 'formik'
import * as Yup from 'yup'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { BackupTarget, ListResponse } from '@/lib/api-types'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_auth/backups/jobs/new')({
  component: NewBackupJobPage,
})

const schema = Yup.object({
  name: Yup.string().required('Name is required'),
  scope_kind: Yup.string()
    .oneOf(['site', 'application', 'database', 'server', 'custom'])
    .required('Scope is required'),
  target_id: Yup.string().required('Target is required'),
  schedule_cron: Yup.string().nullable(),
  keep_daily: Yup.number().min(0).integer(),
  keep_weekly: Yup.number().min(0).integer(),
})

interface FormValues {
  name: string
  scope_kind: 'site' | 'application' | 'database' | 'server' | 'custom'
  target_id: string
  schedule_cron: string
  keep_daily: number
  keep_weekly: number
}

function NewBackupJobPage() {
  const router = useRouter()

  const { data: targetsData } = useQuery({
    queryKey: ['backup-targets'],
    queryFn: () => api<ListResponse<BackupTarget>>('/backups/targets'),
  })

  const initialValues: FormValues = {
    name: '',
    scope_kind: 'server',
    target_id: '',
    schedule_cron: '',
    keep_daily: 7,
    keep_weekly: 4,
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold">Create backup job</h1>

      <Formik
        initialValues={initialValues}
        validationSchema={schema}
        onSubmit={(values, { setSubmitting }) => {
          api('/backups/jobs', {
            method: 'POST',
            body: {
              name: values.name,
              scope_kind: values.scope_kind,
              target_id: values.target_id,
              schedule_cron: values.schedule_cron || null,
              retention_policy: {
                keep_daily: values.keep_daily,
                keep_weekly: values.keep_weekly,
              },
            },
          })
            .then(() => {
              toast.success('Backup job created')
              void router.navigate({ to: '/backups/jobs' })
            })
            .catch((err: unknown) => {
              toast.error(err instanceof Error ? err.message : 'Failed to create job')
            })
            .finally(() => { setSubmitting(false) })
        }}
      >
        {({ isSubmitting }) => (
          <Form className="flex flex-col gap-5">
            <label className="flex flex-col gap-1.5 text-sm">
              Name
              <Field
                name="name"
                className="rounded border border-tundra-ink-200 px-3 py-2"
                placeholder="Daily server backup"
              />
              <ErrorMessage name="name" component="p" className="text-tundra-rust text-xs" />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              Scope kind
              <Field
                as="select"
                name="scope_kind"
                className="rounded border border-tundra-ink-200 px-3 py-2"
              >
                <option value="site">Site</option>
                <option value="application">Application</option>
                <option value="database">Database</option>
                <option value="server">Server</option>
                <option value="custom">Custom</option>
              </Field>
              <ErrorMessage name="scope_kind" component="p" className="text-tundra-rust text-xs" />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              Backup target
              <Field
                as="select"
                name="target_id"
                className="rounded border border-tundra-ink-200 px-3 py-2"
              >
                <option value="">— select a target —</option>
                {targetsData?.data.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.kind})
                  </option>
                ))}
              </Field>
              <ErrorMessage name="target_id" component="p" className="text-tundra-rust text-xs" />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              Schedule (cron, optional)
              <Field
                name="schedule_cron"
                className="rounded border border-tundra-ink-200 px-3 py-2"
                placeholder="0 2 * * *"
              />
              <span className="text-xs text-tundra-ink-400">Leave blank for manual runs only</span>
            </label>

            <div className="rounded-lg border border-tundra-ink-200 p-4 flex flex-col gap-4">
              <p className="text-sm font-medium">Retention policy</p>
              <label className="flex flex-col gap-1.5 text-sm">
                Keep daily snapshots
                <Field
                  name="keep_daily"
                  type="number"
                  min="0"
                  className="rounded border border-tundra-ink-200 px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                Keep weekly snapshots
                <Field
                  name="keep_weekly"
                  type="number"
                  min="0"
                  className="rounded border border-tundra-ink-200 px-3 py-2"
                />
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={isSubmitting}>
                Create job
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => { void router.navigate({ to: '/backups/jobs' }) }}
              >
                Cancel
              </Button>
            </div>
          </Form>
        )}
      </Formik>
    </div>
  )
}
