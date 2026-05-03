import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Formik, Form, Field, ErrorMessage } from 'formik'
import * as Yup from 'yup'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_auth/backups/targets/new')({
  component: NewBackupTargetPage,
})

const STEPS = ['Target', 'Config'] as const

type TargetKind = 's3' | 'local' | 'sftp' | 'b2' | 'wasabi' | 'r2'

interface FormValues {
  name: string
  kind: TargetKind
  repo_password: string
  is_default: boolean
  // s3 / wasabi / r2
  bucket: string
  prefix: string
  access_key: string
  secret_key: string
  // local
  path: string
  // sftp
  host: string
  sftp_path: string
  user: string
  // b2
  application_key_id: string
  application_key: string
}

const stepSchemas = [
  Yup.object({
    name: Yup.string().required('Name is required'),
    kind: Yup.string().oneOf(['s3', 'local', 'sftp', 'b2', 'wasabi', 'r2']).required(),
    repo_password: Yup.string().required('Repository password is required'),
  }),
  Yup.object({}),
]

function buildConfig(values: FormValues): Record<string, unknown> {
  switch (values.kind) {
    case 's3':
    case 'wasabi':
    case 'r2':
      return {
        bucket: values.bucket,
        prefix: values.prefix || 'tundra',
        access_key: values.access_key,
        secret_key: values.secret_key,
      }
    case 'local':
      return { path: values.path }
    case 'sftp':
      return {
        host: values.host,
        path: values.sftp_path,
        user: values.user,
      }
    case 'b2':
      return {
        bucket: values.bucket,
        application_key_id: values.application_key_id,
        application_key: values.application_key,
      }
  }
}

function NewBackupTargetPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)

  const initialValues: FormValues = {
    name: '',
    kind: 's3',
    repo_password: '',
    is_default: false,
    bucket: '',
    prefix: 'tundra',
    access_key: '',
    secret_key: '',
    path: '',
    host: '',
    sftp_path: '',
    user: '',
    application_key_id: '',
    application_key: '',
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold">Add backup target</h1>

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
        onSubmit={(values, { setSubmitting }) => {
          if (step < STEPS.length - 1) {
            setStep((s) => s + 1)
            setSubmitting(false)
            return
          }
          api('/backups/targets', {
            method: 'POST',
            body: {
              name: values.name,
              kind: values.kind,
              repo_password: values.repo_password,
              is_default: values.is_default,
              config: buildConfig(values),
            },
          })
            .then(() => {
              toast.success('Backup target added')
              void router.navigate({ to: '/backups/targets' })
            })
            .catch((err: unknown) => {
              toast.error(err instanceof Error ? err.message : 'Failed to add backup target')
            })
            .finally(() => { setSubmitting(false) })
        }}
      >
        {({ isSubmitting, values }) => (
          <Form className="flex flex-col gap-5">
            <h2 className="text-lg font-medium">{STEPS[step]}</h2>

            {step === 0 && (
              <>
                <label className="flex flex-col gap-1.5 text-sm">
                  Name
                  <Field
                    name="name"
                    className="rounded border border-tundra-ink-200 px-3 py-2"
                    placeholder="My S3 backup"
                  />
                  <ErrorMessage name="name" component="p" className="text-tundra-rust text-xs" />
                </label>

                <label className="flex flex-col gap-1.5 text-sm">
                  Kind
                  <Field
                    as="select"
                    name="kind"
                    className="rounded border border-tundra-ink-200 px-3 py-2"
                  >
                    <option value="s3">S3</option>
                    <option value="local">Local</option>
                    <option value="sftp">SFTP</option>
                    <option value="b2">Backblaze B2</option>
                    <option value="wasabi">Wasabi</option>
                    <option value="r2">Cloudflare R2</option>
                  </Field>
                </label>

                <label className="flex flex-col gap-1.5 text-sm">
                  Repository password
                  <Field
                    name="repo_password"
                    type="password"
                    className="rounded border border-tundra-ink-200 px-3 py-2"
                    placeholder="Encryption passphrase"
                  />
                  <ErrorMessage name="repo_password" component="p" className="text-tundra-rust text-xs" />
                </label>

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Field type="checkbox" name="is_default" className="h-4 w-4" />
                  Set as default target
                </label>
              </>
            )}

            {step === 1 && (values.kind === 's3' || values.kind === 'wasabi' || values.kind === 'r2') && (
              <>
                <label className="flex flex-col gap-1.5 text-sm">
                  Bucket
                  <Field
                    name="bucket"
                    className="rounded border border-tundra-ink-200 px-3 py-2"
                    placeholder="my-backup-bucket"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  Prefix
                  <Field
                    name="prefix"
                    className="rounded border border-tundra-ink-200 px-3 py-2"
                    placeholder="tundra"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  Access key
                  <Field
                    name="access_key"
                    className="rounded border border-tundra-ink-200 px-3 py-2"
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  Secret key
                  <Field
                    name="secret_key"
                    type="password"
                    className="rounded border border-tundra-ink-200 px-3 py-2"
                  />
                </label>
              </>
            )}

            {step === 1 && values.kind === 'local' && (
              <label className="flex flex-col gap-1.5 text-sm">
                Path
                <Field
                  name="path"
                  className="rounded border border-tundra-ink-200 px-3 py-2"
                  placeholder="/var/backups/tundra"
                />
              </label>
            )}

            {step === 1 && values.kind === 'sftp' && (
              <>
                <label className="flex flex-col gap-1.5 text-sm">
                  Host
                  <Field
                    name="host"
                    className="rounded border border-tundra-ink-200 px-3 py-2"
                    placeholder="backup.example.com"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  Path
                  <Field
                    name="sftp_path"
                    className="rounded border border-tundra-ink-200 px-3 py-2"
                    placeholder="/backups/tundra"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  User
                  <Field
                    name="user"
                    className="rounded border border-tundra-ink-200 px-3 py-2"
                    placeholder="backup"
                  />
                </label>
              </>
            )}

            {step === 1 && values.kind === 'b2' && (
              <>
                <label className="flex flex-col gap-1.5 text-sm">
                  Bucket
                  <Field
                    name="bucket"
                    className="rounded border border-tundra-ink-200 px-3 py-2"
                    placeholder="my-backup-bucket"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  Application key ID
                  <Field
                    name="application_key_id"
                    className="rounded border border-tundra-ink-200 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  Application key
                  <Field
                    name="application_key"
                    type="password"
                    className="rounded border border-tundra-ink-200 px-3 py-2"
                  />
                </label>
              </>
            )}

            <div className="flex gap-3 pt-2">
              {step > 0 && (
                <Button type="button" variant="outline" onClick={() => { setStep((s) => s - 1) }}>
                  Back
                </Button>
              )}
              <Button type="submit" loading={isSubmitting}>
                {step < STEPS.length - 1 ? 'Next' : 'Add target'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => { void router.navigate({ to: '/backups/targets' }) }}
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
