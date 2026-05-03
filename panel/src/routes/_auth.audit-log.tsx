import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/audit-log')({
  component: AuditLogPage,
})

function AuditLogPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Audit Log</h1>
      <p className="text-tundra-ink-500">Audit log viewer coming soon.</p>
    </div>
  )
}
