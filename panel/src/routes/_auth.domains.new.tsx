import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Domain } from '@/lib/api-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export const Route = createFileRoute('/_auth/domains/new')({
  component: AddDomainPage,
})

function AddDomainPage() {
  const router = useRouter()
  const [apex, setApex] = useState('')
  const [dnsManagedBy, setDnsManagedBy] = useState<Domain['dns_managed_by']>('tundra')
  const [autoRenew, setAutoRenew] = useState(true)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>): void {
    e.preventDefault()
    setLoading(true)
    api<Domain>('/domains', {
      method: 'POST',
      body: {
        apex,
        dns_managed_by: dnsManagedBy,
        auto_renew: autoRenew,
        notes: notes || null,
      },
    })
      .then(() => {
        toast.success('Domain added successfully')
        void router.navigate({ to: '/domains' })
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to add domain')
      })
      .finally(() => { setLoading(false) })
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold">Add domain</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Apex domain</label>
          <Input
            value={apex}
            onChange={(e) => { setApex(e.target.value) }}
            placeholder="example.com"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">DNS managed by</label>
          <select
            value={dnsManagedBy}
            onChange={(e) => { setDnsManagedBy(e.target.value as Domain['dns_managed_by']) }}
            className="rounded border border-tundra-ink-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tundra-aurora"
          >
            <option value="tundra">Tundra DNS</option>
            <option value="external">External</option>
            <option value="registrar">Registrar</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <input
            id="auto-renew"
            type="checkbox"
            checked={autoRenew}
            onChange={(e) => { setAutoRenew(e.target.checked) }}
            className="h-4 w-4 rounded border-tundra-ink-300 text-tundra-lichen focus:ring-tundra-aurora"
          />
          <label htmlFor="auto-renew" className="text-sm font-medium">
            Auto-renew registration
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value) }}
            placeholder="Any notes about this domain…"
            rows={3}
            className="rounded border border-tundra-ink-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tundra-aurora"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={loading}>
            Add domain
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => { void router.navigate({ to: '/domains' }) }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
