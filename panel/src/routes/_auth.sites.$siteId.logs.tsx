import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export const Route = createFileRoute('/_auth/sites/$siteId/logs')({
  component: SiteLogsTab,
})

function SiteLogsTab() {
  const { siteId } = Route.useParams()
  const [logType, setLogType] = useState<'access' | 'error'>('access')
  const [lines, setLines] = useState(100)

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['sites', siteId, 'logs', logType, lines],
    queryFn: () => api<{ content: string }>(`/sites/${siteId}/logs?type=${logType}&lines=${lines}`),
    retry: false,
    refetchInterval: (query) => (query.state.data ? 10000 : false),
  })

  function handleDownload() {
    if (!data?.content) return
    const blob = new Blob([data.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${logType}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-tundra-ink-200">
          {(['access', 'error'] as const).map((t, i) => (
            <button key={t} type="button" onClick={() => { setLogType(t) }}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${i > 0 ? 'border-l border-tundra-ink-200' : ''} ${logType === t ? 'bg-tundra-lichen text-white' : 'bg-white text-tundra-ink-500 hover:bg-tundra-ink-50'}`}>
              {t} log
            </button>
          ))}
        </div>

        <select value={lines} onChange={(e) => { setLines(Number(e.target.value)) }}
          className="h-9 rounded-lg border border-tundra-ink-200 px-3 text-sm focus:outline-none">
          {[50, 100, 200, 500].map((n) => <option key={n} value={n}>Last {n} lines</option>)}
        </select>

        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => void refetch()}
            disabled={isFetching}
            className="rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm text-tundra-ink-500 hover:bg-tundra-ink-50 transition-colors disabled:opacity-50">
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button"
            onClick={handleDownload}
            disabled={!data?.content}
            className="rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm text-tundra-ink-500 hover:bg-tundra-ink-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            Download
          </button>
          <div className="relative group">
            <button type="button" disabled
              className="flex items-center gap-1.5 rounded-lg bg-tundra-lichen px-3 py-2 text-sm font-medium text-white opacity-60 cursor-not-allowed">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              Live tail
            </button>
            <div className="pointer-events-none absolute bottom-full right-0 mb-1.5 w-max rounded bg-tundra-ink px-2 py-1 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap">
              WebSocket live tail coming soon
            </div>
          </div>
        </div>
      </div>

      {/* Log viewer */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-tundra-ink-200 bg-[#0f1117]">
          <span className="text-xs text-white/40 font-mono animate-pulse">Loading logs…</span>
        </div>
      ) : isError || !data?.content ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-tundra-ink-200 bg-tundra-ink-50 p-10 text-center">
          <svg className="h-8 w-8 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <p className="text-sm font-semibold text-tundra-ink-600">Log streaming not configured</p>
          <p className="max-w-sm text-xs text-tundra-ink-400">
            Enable nginx access logging on the server to stream logs here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-[#0f1117]">
          <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-tundra-lichen" />
            <span className="text-xs text-white/60 font-mono">
              /var/log/nginx/{logType}.log — {lines} lines
            </span>
            <span className="ml-auto text-[10px] text-white/30 font-mono">auto-refresh 10s</span>
          </div>
          <pre className="max-h-[28rem] overflow-auto p-4 text-xs leading-relaxed text-green-300 font-mono whitespace-pre-wrap">
            {data.content}
          </pre>
        </div>
      )}
    </div>
  )
}
