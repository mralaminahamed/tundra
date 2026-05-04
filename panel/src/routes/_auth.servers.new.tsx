import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Formik, Form, Field, ErrorMessage } from 'formik'
import * as Yup from 'yup'
import { useState } from 'react'
import { toast } from 'sonner'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  CreateServerResponse,
  WizardFingerprintResponse,
  WizardInstallResponse,
} from '@/lib/api-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export const Route = createFileRoute('/_auth/servers/new')({
  component: AddServerPage,
})

const STEPS = ['Details', 'SSH install', 'Done'] as const
type Step = 0 | 1 | 2

const stepSchemas = [
  Yup.object({
    name: Yup.string().required('Display name is required'),
    hostname: Yup.string().required('Hostname is required'),
    region: Yup.string(),
  }),
  Yup.object({
    sshUser: Yup.string().required('SSH user is required'),
    sshHost: Yup.string().required('SSH host is required'),
  }),
  Yup.object({}),
]

interface FormValues {
  name: string
  hostname: string
  region: string
  sshUser: string
  sshHost: string
}

/** Sub-steps within step 1 (SSH install). */
type SshSubStep = 'idle' | 'fetching' | 'confirm' | 'installing' | 'done'

function AddServerPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(0)
  const [createdServer, setCreatedServer] = useState<CreateServerResponse | null>(null)

  // SSH sub-step state
  const [sshSubStep, setSshSubStep] = useState<SshSubStep>('idle')
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [fingerprintConfirmed, setFingerprintConfirmed] = useState(false)
  const [installLog, setInstallLog] = useState<string[]>([])

  const createServerMutation = useMutation({
    mutationFn: (values: Pick<FormValues, 'name' | 'hostname' | 'region'>) =>
      api<CreateServerResponse>('/servers', {
        method: 'POST',
        body: {
          name: values.name,
          hostname: values.hostname,
          region: values.region || null,
          os: 'ubuntu-24.04',
        },
      }),
    onSuccess: (res) => {
      setCreatedServer(res)
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to add server')
    },
  })

  const fingerprintMutation = useMutation({
    mutationFn: (vars: { user: string; host: string }) =>
      api<WizardFingerprintResponse>('/servers/wizard/fingerprint', {
        method: 'POST',
        body: { user: vars.user, host: vars.host },
      }),
    onSuccess: (res) => {
      setFingerprint(res.fingerprint)
      setSshSubStep('confirm')
    },
    onError: (err: unknown) => {
      setSshSubStep('idle')
      toast.error(err instanceof Error ? err.message : 'Failed to fetch SSH fingerprint')
    },
  })

  const installMutation = useMutation({
    mutationFn: (vars: {
      serverId: string
      user: string
      host: string
      confirmedFingerprint: string
    }) =>
      api<WizardInstallResponse>('/servers/wizard/install', {
        method: 'POST',
        body: {
          server_id: vars.serverId,
          user: vars.user,
          host: vars.host,
          confirmed_fingerprint: vars.confirmedFingerprint,
        },
      }),
    onSuccess: (res) => {
      setInstallLog(res.log)
      setSshSubStep('done')
      if (res.ok) {
        toast.success('Agent installed — server is provisioning')
      } else {
        toast.error('Installer returned a non-zero exit code — check the log')
      }
    },
    onError: (err: unknown) => {
      setSshSubStep('confirm')
      toast.error(err instanceof Error ? err.message : 'SSH install failed')
    },
  })

  const initialValues: FormValues = {
    name: '',
    hostname: '',
    region: '',
    sshUser: 'root',
    sshHost: '',
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Add server</h1>

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
          try {
            if (step === 0) {
              // Create the server record first.
              await createServerMutation.mutateAsync({
                name: values.name,
                hostname: values.hostname,
                region: values.region,
              })
              setStep(1)
            } else if (step === 1) {
              // SSH install is driven by the sub-step buttons below; the
              // "Next" button here is only active once installation is done.
              if (sshSubStep === 'done') {
                setStep(2)
              }
            }
          } catch {
            // errors handled in mutation callbacks
          } finally {
            setSubmitting(false)
          }
        }}
      >
        {({ isSubmitting, values }) => (
          <Form className="flex flex-col gap-5">
            <h2 className="text-lg font-medium">{STEPS[step]}</h2>

            {/* ── Step 0: server details ─────────────────────────────────── */}
            {step === 0 && (
              <>
                <label className="flex flex-col gap-1.5 text-sm">
                  Display name
                  <Field
                    name="name"
                    as={Input}
                    placeholder="vps-fra-01"
                  />
                  <ErrorMessage name="name" component="p" className="text-tundra-rust text-xs" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  Hostname
                  <Field
                    name="hostname"
                    as={Input}
                    placeholder="vps-fra-01.example.com"
                  />
                  <ErrorMessage name="hostname" component="p" className="text-tundra-rust text-xs" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  Region <span className="text-tundra-ink-400">(optional)</span>
                  <Field
                    name="region"
                    as={Input}
                    placeholder="eu-central"
                  />
                </label>
              </>
            )}

            {/* ── Step 1: SSH install ────────────────────────────────────── */}
            {step === 1 && (
              <>
                <p className="text-sm text-tundra-ink-500">
                  Tundra will SSH to your host, upload the agent installer, and run it automatically.
                </p>

                <label className="flex flex-col gap-1.5 text-sm">
                  SSH user
                  <Field name="sshUser" as={Input} placeholder="root" />
                  <ErrorMessage name="sshUser" component="p" className="text-tundra-rust text-xs" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  SSH host (IP or hostname)
                  <Field name="sshHost" as={Input} placeholder="1.2.3.4" />
                  <ErrorMessage name="sshHost" component="p" className="text-tundra-rust text-xs" />
                </label>

                {/* Sub-step: fetch fingerprint */}
                {sshSubStep === 'idle' && (
                  <Button
                    type="button"
                    variant="outline"
                    loading={fingerprintMutation.isPending}
                    onClick={() => {
                      if (!values.sshUser || !values.sshHost) {
                        toast.error('Fill in SSH user and host first')
                        return
                      }
                      setSshSubStep('fetching')
                      fingerprintMutation.mutate({ user: values.sshUser, host: values.sshHost })
                    }}
                  >
                    Check fingerprint
                  </Button>
                )}

                {/* Sub-step: confirm fingerprint */}
                {(sshSubStep === 'confirm' || sshSubStep === 'installing') && fingerprint && (
                  <div className="rounded-lg border border-tundra-ink-200 p-4 flex flex-col gap-3">
                    <p className="text-sm font-medium">Host key fingerprint</p>
                    <pre className="text-xs bg-tundra-ink-900 text-tundra-paper rounded p-3 overflow-x-auto">
                      {fingerprint}
                    </pre>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={fingerprintConfirmed}
                        onChange={(e) => { setFingerprintConfirmed(e.target.checked) }}
                        className="rounded"
                      />
                      I confirm this fingerprint matches my host provider&apos;s console
                    </label>
                    <Button
                      type="button"
                      disabled={!fingerprintConfirmed || installMutation.isPending}
                      loading={installMutation.isPending}
                      onClick={() => {
                        if (!createdServer) return
                        setSshSubStep('installing')
                        installMutation.mutate({
                          serverId: createdServer.server.id,
                          user: values.sshUser,
                          host: values.sshHost,
                          confirmedFingerprint: fingerprint,
                        })
                      }}
                    >
                      Install agent
                    </Button>
                  </div>
                )}

                {/* Sub-step: install log */}
                {sshSubStep === 'done' && installLog.length > 0 && (
                  <div className="rounded-lg border border-tundra-ink-200 p-4 flex flex-col gap-2">
                    <p className="text-sm font-medium">Install log</p>
                    <pre className="text-xs bg-tundra-ink-900 text-tundra-paper rounded p-3 overflow-x-auto whitespace-pre-wrap">
                      {installLog.join('\n')}
                    </pre>
                  </div>
                )}
              </>
            )}

            {/* ── Step 2: done ──────────────────────────────────────────── */}
            {step === 2 && createdServer && (
              <div className="flex flex-col gap-3">
                <p className="text-tundra-ink-500">
                  Server <strong>{createdServer.server.name}</strong> has been added and the agent
                  installer has run. The agent will connect back shortly.
                </p>
                <p className="text-sm text-tundra-ink-400">
                  You can also enrol manually with:
                </p>
                <pre className="overflow-x-auto rounded bg-tundra-ink-900 p-4 text-sm text-tundra-paper">
                  {createdServer.enrolment_command}
                </pre>
              </div>
            )}

            {/* ── Navigation buttons ─────────────────────────────────────── */}
            <div className="flex gap-3 pt-2">
              {step === 2 ? (
                <Button
                  type="button"
                  onClick={() => { void router.navigate({ to: '/servers' }) }}
                >
                  Back to servers
                </Button>
              ) : (
                <>
                  {step > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { setStep((s) => (s - 1) as Step) }}
                    >
                      Back
                    </Button>
                  )}
                  <Button
                    type="submit"
                    loading={isSubmitting || createServerMutation.isPending}
                    disabled={step === 1 && sshSubStep !== 'done'}
                  >
                    {step === 0 ? 'Next' : 'Finish'}
                  </Button>
                  {step === 1 && sshSubStep !== 'done' && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { void router.navigate({ to: '/servers' }) }}
                    >
                      Skip SSH install
                    </Button>
                  )}
                </>
              )}
              {step === 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { void router.navigate({ to: '/servers' }) }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </Form>
        )}
      </Formik>
    </div>
  )
}
