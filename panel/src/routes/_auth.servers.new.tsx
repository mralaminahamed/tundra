import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { CreateServerResponse } from '@/lib/api-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export const Route = createFileRoute('/_auth/servers/new')({
  component: AddServerPage,
})

function AddServerPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [hostname, setHostname] = useState('')
  const [region, setRegion] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CreateServerResponse | null>(null)

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>): void {
    e.preventDefault()
    setLoading(true)
    api<CreateServerResponse>('/servers', {
      method: 'POST',
      body: { name, hostname, region: region || null, os: 'ubuntu-24.04' },
    })
      .then((res) => {
        setResult(res)
        toast.success('Server added — run the enrolment command on the host')
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to add server')
      })
      .finally(() => { setLoading(false) })
  }

  if (result) {
    return (
      <div className="max-w-2xl">
        <h1 className="mb-6 text-2xl font-semibold">Server added</h1>
        <p className="mb-4 text-tundra-ink-500">
          Run this command on <strong>{result.server.hostname}</strong> to enrol the agent:
        </p>
        <pre className="mb-6 overflow-x-auto rounded bg-tundra-ink-900 p-4 text-sm text-tundra-paper">
          {result.enrolment_command}
        </pre>
        <p className="mb-6 text-sm text-tundra-ink-400">
          The setup token expires in 24 hours. It will not be shown again.
        </p>
        <Button onClick={() => { void router.navigate({ to: '/servers' }) }}>
          Back to servers
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold">Add server</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Display name</label>
          <Input
            value={name}
            onChange={(e) => { setName(e.target.value) }}
            placeholder="vps-fra-01"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Hostname</label>
          <Input
            value={hostname}
            onChange={(e) => { setHostname(e.target.value) }}
            placeholder="vps-fra-01.example.com"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Region (optional)</label>
          <Input
            value={region}
            onChange={(e) => { setRegion(e.target.value) }}
            placeholder="eu-central"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={loading}>
            Add server
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => { void router.navigate({ to: '/servers' }) }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
