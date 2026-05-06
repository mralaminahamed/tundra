// Shared types and components for the site detail sub-routes.
import { toast } from 'sonner'
import type { Site, Deployment } from '@/lib/api-types'

export type { Site, Deployment }

// ── Status pills ──────────────────────────────────────────────────────────────

const SITE_STATUS_MAP: Record<string, string> = {
  active:       'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-800',
  provisioning: 'border-tundra-aurora-300 bg-tundra-aurora-50 text-tundra-aurora-800',
  suspended:    'border-yellow-300 bg-yellow-50 text-yellow-800',
  migrating:    'border-tundra-aurora-300 bg-tundra-aurora-50 text-tundra-aurora-700',
  archived:     'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-400',
}
const SITE_DOT_MAP: Record<string, string> = {
  active:       'bg-tundra-lichen',
  provisioning: 'bg-tundra-aurora animate-pulse',
  suspended:    'bg-yellow-400',
  migrating:    'bg-tundra-aurora animate-pulse',
  archived:     'bg-tundra-ink-300',
}

export function SiteStatusPill({ status }: { status: Site['status'] }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${SITE_STATUS_MAP[status] ?? ''}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${SITE_DOT_MAP[status] ?? ''}`} />
      {status}
    </span>
  )
}

const DEPLOY_MAP: Record<string, string> = {
  succeeded: 'bg-tundra-lichen-100 text-tundra-lichen-800',
  failed:    'bg-red-100 text-red-800',
  running:   'bg-tundra-aurora-100 text-tundra-aurora-800',
  queued:    'bg-tundra-ink-100 text-tundra-ink-500',
  cancelled: 'bg-tundra-ink-100 text-tundra-ink-400',
}

export function DeployStatusBadge({ status }: { status: Deployment['status'] }) {
  const pulse = status === 'running' || status === 'queued'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium ${DEPLOY_MAP[status] ?? ''}`}>
      {pulse && (
        <span className={`h-1.5 w-1.5 rounded-full ${status === 'running' ? 'bg-tundra-aurora animate-pulse' : 'bg-tundra-ink-300 animate-pulse'}`} />
      )}
      {status}
    </span>
  )
}

// ── Layout helpers ────────────────────────────────────────────────────────────

export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-tundra-ink-100 py-2.5 last:border-0">
      <span className="shrink-0 text-sm text-tundra-ink-400">{label}</span>
      <span className="text-right text-sm font-medium text-tundra-ink">{children}</span>
    </div>
  )
}

export function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
      {title && (
        <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">{title}</span>
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => { void navigator.clipboard.writeText(value).then(() => { toast.success(`${label} copied`) }) }}
      className="ml-1.5 rounded p-0.5 text-tundra-ink-300 transition-colors hover:bg-tundra-ink-100 hover:text-tundra-ink"
      title={`Copy ${label}`}
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7.414A2 2 0 0 0 11.414 6L8 2.586A2 2 0 0 0 6.586 2H4Zm0 1.5h2V6a1 1 0 0 0 1 1h2.5V12a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Zm3.5.621L9.879 6.5H8a.5.5 0 0 1-.5-.5V4.121Z"/>
      </svg>
    </button>
  )
}

export function EmptyState({ message, action, onAction }: { message: string; action?: string; onAction?: () => void }) {
  return (
    <div className="rounded-xl border border-tundra-ink-200 py-14 text-center">
      <svg className="mx-auto mb-3 h-8 w-8 text-tundra-ink-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01" strokeLinecap="round"/>
      </svg>
      <p className="text-sm text-tundra-ink-400">{message}</p>
      {action && onAction && (
        <button type="button" onClick={onAction}
          className="mt-3 text-sm font-medium text-tundra-lichen hover:underline">
          {action}
        </button>
      )}
    </div>
  )
}
