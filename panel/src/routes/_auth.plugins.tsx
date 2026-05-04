import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_auth/plugins')({
  component: PluginsPage,
})

interface Plugin {
  id: string
  plugin_id: string
  version: string
  source: string
  state: 'installed' | 'granted' | 'enabled' | 'disabled' | 'quarantined'
  signature_verified: boolean
  created_at: string
  manifest: {
    name: string
    description: string
    author: string
  }
}

function stateBadge(state: Plugin['state']) {
  const map: Record<string, string> = {
    enabled: 'bg-tundra-lichen-100 text-tundra-lichen-800',
    disabled: 'bg-tundra-ink-100 text-tundra-ink-600',
    installed: 'bg-tundra-aurora-100 text-tundra-aurora-800',
    granted: 'bg-yellow-100 text-yellow-800',
    quarantined: 'bg-red-100 text-red-800',
  }
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${map[state] ?? ''}`}
    >
      {state}
    </span>
  )
}

function PluginsPage() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => api<{ data: Plugin[] }>('/plugins'),
  })

  const enableMutation = useMutation({
    mutationFn: (id: string) => api(`/plugins/${id}/enable`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plugins'] })
      toast.success('Plugin enabled')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const disableMutation = useMutation({
    mutationFn: (id: string) => api(`/plugins/${id}/disable`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plugins'] })
      toast.success('Plugin disabled')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  if (isLoading) return <p className="text-sm text-tundra-ink-400">Loading…</p>

  const plugins = data?.data ?? []

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Plugins</h1>
      </div>

      {plugins.length === 0 && (
        <p className="py-8 text-center text-sm text-tundra-ink-400">
          No plugins installed.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plugins.map((p) => (
          <div
            key={p.id}
            className="rounded-lg border border-tundra-ink-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <h2 className="font-medium">{p.manifest.name}</h2>
                <p className="text-xs text-tundra-ink-400">
                  {p.plugin_id} v{p.version}
                </p>
              </div>
              {stateBadge(p.state)}
            </div>
            <p className="mb-3 text-sm text-tundra-ink-600">
              {p.manifest.description}
            </p>
            <div className="flex items-center gap-2">
              {p.state === 'enabled' ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    disableMutation.mutate(p.id)
                  }}
                  loading={disableMutation.isPending}
                >
                  Disable
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    enableMutation.mutate(p.id)
                  }}
                  loading={enableMutation.isPending}
                >
                  Enable
                </Button>
              )}
              {!p.signature_verified && (
                <span className="text-xs text-yellow-600">unsigned</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
