import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Formik, Form, Field, ErrorMessage } from 'formik'
import * as Yup from 'yup'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_auth/mail/domains/new')({
  component: NewMailDomainPage,
})

const step1Schema = Yup.object({
  domain: Yup.string().required('Domain is required'),
  mx_host: Yup.string().required('MX host is required'),
  spf_policy: Yup.string(),
})

const step2Schema = Yup.object({
  dmarc_policy: Yup.string(),
})

interface FormValues {
  domain: string
  mx_host: string
  spf_policy: string
  dmarc_policy: string
}

function NewMailDomainPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)

  const initialValues: FormValues = {
    domain: '',
    mx_host: '',
    spf_policy: '',
    dmarc_policy: '',
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-2 text-2xl font-semibold">Add mail domain</h1>

      {/* Step indicator */}
      <div className="mb-6 flex items-center gap-2 text-sm">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
            step === 1
              ? 'bg-tundra-lichen text-white'
              : 'bg-tundra-lichen-100 text-tundra-lichen-800'
          }`}
        >
          1
        </span>
        <span className={step === 1 ? 'font-medium' : 'text-tundra-ink-500'}>Domain</span>
        <span className="text-tundra-ink-300">→</span>
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
            step === 2
              ? 'bg-tundra-lichen text-white'
              : 'bg-tundra-ink-100 text-tundra-ink-500'
          }`}
        >
          2
        </span>
        <span className={step === 2 ? 'font-medium' : 'text-tundra-ink-500'}>DMARC &amp; DNS</span>
      </div>

      <Formik
        initialValues={initialValues}
        validationSchema={step === 1 ? step1Schema : step2Schema}
        validateOnBlur
        onSubmit={(values, { setSubmitting }) => {
          if (step === 1) {
            setStep(2)
            setSubmitting(false)
            return
          }

          api('/mail/domains', {
            method: 'POST',
            body: {
              domain: values.domain,
              mx_host: values.mx_host,
              spf_policy: values.spf_policy || null,
              dmarc_policy: values.dmarc_policy || null,
            },
          })
            .then(() => {
              toast.success('Mail domain added — DKIM key generated. Publish DNS records to activate.')
              void router.navigate({ to: '/mail/domains' })
            })
            .catch((err: unknown) => {
              toast.error(err instanceof Error ? err.message : 'Failed to add mail domain')
            })
            .finally(() => { setSubmitting(false) })
        }}
      >
        {({ isSubmitting, values }) => (
          <Form className="flex flex-col gap-5">
            {step === 1 && (
              <>
                <label className="flex flex-col gap-1.5 text-sm">
                  Domain
                  <Field
                    name="domain"
                    className="rounded border border-tundra-ink-200 px-3 py-2"
                    placeholder="mail.example.com"
                  />
                  <ErrorMessage name="domain" component="p" className="text-tundra-rust text-xs" />
                </label>

                <label className="flex flex-col gap-1.5 text-sm">
                  MX host
                  <Field
                    name="mx_host"
                    className="rounded border border-tundra-ink-200 px-3 py-2"
                    placeholder="mail.example.com"
                  />
                  <ErrorMessage name="mx_host" component="p" className="text-tundra-rust text-xs" />
                </label>

                <label className="flex flex-col gap-1.5 text-sm">
                  SPF policy (optional)
                  <Field
                    name="spf_policy"
                    className="rounded border border-tundra-ink-200 px-3 py-2"
                    placeholder="v=spf1 mx ~all"
                  />
                  <span className="text-xs text-tundra-ink-400">
                    Leave blank to use the default SPF policy
                  </span>
                </label>

                <div className="flex gap-3 pt-2">
                  <Button type="submit">
                    Next: DMARC &amp; DNS →
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { void router.navigate({ to: '/mail/domains' }) }}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <label className="flex flex-col gap-1.5 text-sm">
                  DMARC policy (optional)
                  <Field
                    name="dmarc_policy"
                    className="rounded border border-tundra-ink-200 px-3 py-2"
                    placeholder="v=DMARC1; p=none; rua=mailto:dmarc@example.com"
                  />
                  <span className="text-xs text-tundra-ink-400">
                    Leave blank to use a permissive default
                  </span>
                </label>

                {/* Suggested DNS records */}
                <div className="rounded-lg border border-tundra-ink-200 p-4 flex flex-col gap-3">
                  <p className="text-sm font-medium">Suggested DNS records to publish</p>
                  <p className="text-xs text-tundra-ink-400">
                    Publish these records for{' '}
                    <span className="font-mono font-medium">{values.domain || 'your domain'}</span>{' '}
                    to activate mail delivery.
                  </p>

                  <div className="flex flex-col gap-2 text-xs font-mono">
                    <div className="rounded bg-tundra-ink-50 p-2">
                      <span className="text-tundra-ink-500">; MX record</span>
                      <br />
                      <span>{values.domain || 'domain'}</span>
                      {' IN MX 10 '}
                      <span>{values.mx_host || 'mx_host'}</span>
                    </div>

                    <div className="rounded bg-tundra-ink-50 p-2">
                      <span className="text-tundra-ink-500">; SPF record (TXT)</span>
                      <br />
                      <span>{values.domain || 'domain'}</span>
                      {' IN TXT "'}
                      <span>{values.spf_policy || 'v=spf1 mx ~all'}</span>
                      {'"'}
                    </div>

                    <div className="rounded bg-tundra-ink-50 p-2">
                      <span className="text-tundra-ink-500">; DKIM selector (TXT) — key generated on save</span>
                      <br />
                      {'default._domainkey.'}
                      <span>{values.domain || 'domain'}</span>
                      {' IN TXT "v=DKIM1; k=rsa; p=<public_key>"'}
                    </div>

                    <div className="rounded bg-tundra-ink-50 p-2">
                      <span className="text-tundra-ink-500">; DMARC record (TXT)</span>
                      <br />
                      {'_dmarc.'}
                      <span>{values.domain || 'domain'}</span>
                      {' IN TXT "'}
                      <span>{values.dmarc_policy || 'v=DMARC1; p=none'}</span>
                      {'"'}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="submit" loading={isSubmitting}>
                    Add mail domain
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setStep(1) }}
                  >
                    ← Back
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => { void router.navigate({ to: '/mail/domains' }) }}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </Form>
        )}
      </Formik>
    </div>
  )
}
