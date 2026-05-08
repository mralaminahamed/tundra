import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'

export const Route = createFileRoute('/_auth/settings/notifications')({
  component: NotificationsPage,
})

interface NotificationSettings {
  slack_webhook_url?: string | null
  discord_webhook_url?: string | null
  alert_email?: string | null
  notify_on_deploy?: boolean
  notify_on_backup?: boolean
  notify_on_cert_renewal?: boolean
  notify_on_alert?: boolean
}

const INPUT = 'w-full rounded-lg border border-tundra-ink-200 bg-white px-3.5 py-2.5 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20'
const LABEL = 'block text-sm font-medium text-tundra-ink-700 mb-1.5'

function SectionCard({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-tundra-ink">{title}</h3>
        {desc && <p className="mt-0.5 text-xs text-tundra-ink-400">{desc}</p>}
      </div>
      <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange, label, desc }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  desc?: string
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5 shrink-0">
        <input type="checkbox" checked={checked} onChange={(e) => { onChange(e.target.checked) }}
          className="sr-only" />
        <div className={`w-9 h-5 rounded-full transition-colors ${checked ? 'bg-tundra-lichen' : 'bg-tundra-ink-200'}`} />
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </div>
      <div>
        <p className="text-sm font-medium text-tundra-ink">{label}</p>
        {desc && <p className="text-xs text-tundra-ink-400 mt-0.5">{desc}</p>}
      </div>
    </label>
  )
}

function NotificationsPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'notifications'],
    queryFn: () => api<{ data: NotificationSettings }>('/settings/notifications'),
  })

  const s = data?.data ?? {}

  const [slackUrl,          setSlackUrl]          = useState('')
  const [discordUrl,        setDiscordUrl]         = useState('')
  const [alertEmail,        setAlertEmail]         = useState('')
  const [onDeploy,          setOnDeploy]           = useState(true)
  const [onBackup,          setOnBackup]           = useState(true)
  const [onCert,            setOnCert]             = useState(true)
  const [onAlert,           setOnAlert]            = useState(true)

  useEffect(() => {
    if (!data) return
    setSlackUrl(s.slack_webhook_url ?? '')
    setDiscordUrl(s.discord_webhook_url ?? '')
    setAlertEmail(s.alert_email ?? '')
    setOnDeploy(s.notify_on_deploy ?? true)
    setOnBackup(s.notify_on_backup ?? true)
    setOnCert(s.notify_on_cert_renewal ?? true)
    setOnAlert(s.notify_on_alert ?? true)
  }, [data])

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/settings/notifications', { method: 'PATCH', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings', 'notifications'] })
      toast.success('Notification settings saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    saveMut.mutate({
      slack_webhook_url:      slackUrl.trim() || null,
      discord_webhook_url:    discordUrl.trim() || null,
      alert_email:            alertEmail.trim() || null,
      notify_on_deploy:       onDeploy,
      notify_on_backup:       onBackup,
      notify_on_cert_renewal: onCert,
      notify_on_alert:        onAlert,
    })
  }

  if (isLoading) {
    return <div className="h-64 rounded-xl bg-tundra-ink-100 animate-pulse" />
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <SectionCard title="Channels" desc="Leave a field blank to disable that channel.">
        <div className="space-y-4">
          <div>
            <label className={LABEL}>Alert email</label>
            <input type="email" value={alertEmail} onChange={(e) => { setAlertEmail(e.target.value) }}
              placeholder="ops@example.com" className={INPUT} />
            <p className="mt-1 text-xs text-tundra-ink-400">Requires SMTP to be configured on the Email tab.</p>
          </div>
          <div>
            <label className={LABEL}>Slack webhook URL</label>
            <input value={slackUrl} onChange={(e) => { setSlackUrl(e.target.value) }}
              placeholder="https://hooks.slack.com/services/…" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Discord webhook URL</label>
            <input value={discordUrl} onChange={(e) => { setDiscordUrl(e.target.value) }}
              placeholder="https://discord.com/api/webhooks/…" className={INPUT} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Events">
        <div className="space-y-4">
          <Toggle
            checked={onDeploy}
            onChange={setOnDeploy}
            label="Deployments"
            desc="Notify on deploy start, success, and failure."
          />
          <Toggle
            checked={onBackup}
            onChange={setOnBackup}
            label="Backups"
            desc="Notify on backup completion or failure."
          />
          <Toggle
            checked={onCert}
            onChange={setOnCert}
            label="SSL certificate renewals"
            desc="Notify 30 days before expiry and on renewal."
          />
          <Toggle
            checked={onAlert}
            onChange={setOnAlert}
            label="Alert rule triggers"
            desc="Notify when an alert rule threshold is crossed."
          />
        </div>
      </SectionCard>

      <div className="flex justify-end gap-3">
        <button
          type="submit"
          disabled={saveMut.isPending}
          className="rounded-lg bg-tundra-lichen px-5 py-2.5 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-40 transition-colors"
        >
          {saveMut.isPending ? 'Saving…' : 'Save notification settings'}
        </button>
      </div>
    </form>
  )
}
