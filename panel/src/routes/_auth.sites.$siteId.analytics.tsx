import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export const Route = createFileRoute('/_auth/sites/$siteId/analytics')({
  component: SiteAnalyticsTab,
})

interface DayBucket {
  label: string
  requests: number
  bandwidth: number
}

interface TopPath {
  path: string
  requests: number
  pct: number
}

interface StatusCode {
  code: string
  label: string
  count: number
  color: string
  pct: number
}

interface TopCountry {
  country: string
  flag: string
  pct: number
}

interface AnalyticsData {
  total_requests: number
  total_bandwidth_mb: number
  error_rate_pct: number
  days: DayBucket[]
  top_paths: TopPath[]
  status_codes: StatusCode[]
  top_countries: TopCountry[]
}

function SkeletonBar({ width }: { width: string }) {
  return <div className={`h-2 rounded bg-tundra-ink-100 animate-pulse ${width}`} />
}

function SiteAnalyticsTab() {
  const { siteId } = Route.useParams()
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sites', siteId, 'analytics', range],
    queryFn: () => api<AnalyticsData>(`/sites/${siteId}/analytics?range=${range}`),
    retry: false,
  })

  const days = data?.days ?? []
  const maxReq = days.length > 0 ? Math.max(...days.map((d) => d.requests)) : 1

  return (
    <div className="space-y-5">
      {/* Range selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-tundra-ink">Traffic analytics</h2>
        <div className="flex overflow-hidden rounded-lg border border-tundra-ink-200">
          {(['7d', '30d', '90d'] as const).map((r, i) => (
            <button key={r} type="button" onClick={() => { setRange(r) }}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${i > 0 ? 'border-l border-tundra-ink-200' : ''} ${range === r ? 'bg-tundra-lichen text-white' : 'bg-white text-tundra-ink-500 hover:bg-tundra-ink-50'}`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Empty / error state */}
      {!isLoading && (isError || !data) ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-tundra-ink-200 bg-tundra-ink-50 p-12 text-center">
          <svg className="h-8 w-8 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <p className="text-sm font-semibold text-tundra-ink-600">Analytics not available</p>
          <p className="max-w-sm text-xs text-tundra-ink-400">
            Traffic analytics will appear here once the site receives requests and analytics collection is enabled.
          </p>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-tundra-ink-200 bg-white p-4 space-y-2">
                  <SkeletonBar width="w-20" />
                  <SkeletonBar width="w-12" />
                  <SkeletonBar width="w-16" />
                </div>
              ))
            ) : (
              [
                { label: 'Total requests', value: (data!.total_requests).toLocaleString(), sub: range },
                { label: 'Bandwidth',      value: `${data!.total_bandwidth_mb.toLocaleString()} MB`, sub: range },
                { label: 'Avg req/day',    value: days.length > 0 ? Math.round(data!.total_requests / days.length).toLocaleString() : '—', sub: 'requests' },
                { label: 'Error rate',     value: `${data!.error_rate_pct.toFixed(1)}%`, sub: '5xx responses', warn: data!.error_rate_pct > 1 },
              ].map(({ label, value, sub, warn }) => (
                <div key={label} className="rounded-xl border border-tundra-ink-200 bg-white p-4">
                  <p className="text-xs text-tundra-ink-400">{label}</p>
                  <p className={`mt-1 text-xl font-bold tabular-nums ${warn ? 'text-red-600' : 'text-tundra-ink'}`}>{value}</p>
                  <p className="mt-0.5 text-xs text-tundra-ink-300">{sub}</p>
                </div>
              ))
            )}
          </div>

          {/* Request chart */}
          <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Requests per day</p>
            {isLoading ? (
              <div className="flex items-end gap-0.5 animate-pulse" style={{ height: 100 }}>
                {Array.from({ length: 30 }).map((_, i) => (
                  <div key={i} className="flex-1 rounded-t bg-tundra-ink-100"
                    style={{ height: `${20 + Math.random() * 70}%` }} />
                ))}
              </div>
            ) : days.length > 0 ? (
              <>
                <div className="flex items-end gap-0.5" style={{ height: 100 }}>
                  {days.map((d, i) => (
                    <div key={i} className="group relative flex flex-1 flex-col items-center justify-end" style={{ height: '100%' }}>
                      <div
                        className="w-full rounded-t bg-tundra-lichen transition-all group-hover:bg-tundra-lichen-600"
                        style={{ height: `${Math.round((d.requests / maxReq) * 100)}%` }}
                      />
                      <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-tundra-ink px-1.5 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                        {d.label}: {d.requests.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-tundra-ink-300">
                  <span>{days[0]?.label}</span>
                  <span>{days[days.length - 1]?.label}</span>
                </div>
              </>
            ) : (
              <div className="flex h-24 items-center justify-center text-xs text-tundra-ink-300">No data for this period</div>
            )}
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {/* Top paths */}
            <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white lg:col-span-2">
              <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Top Paths</span>
              </div>
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="space-y-1.5">
                      <SkeletonBar width={i % 2 === 0 ? 'w-48' : 'w-36'} />
                      <div className="h-1 rounded-full bg-tundra-ink-100 animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : (data?.top_paths ?? []).length > 0 ? (
                <div className="divide-y divide-tundra-ink-100">
                  {data!.top_paths.map(({ path, requests, pct }) => (
                    <div key={path} className="px-4 py-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs text-tundra-ink truncate mr-3" title={path}>{path}</span>
                        <span className="shrink-0 text-xs text-tundra-ink-500">{requests.toLocaleString()}</span>
                      </div>
                      <div className="h-1 rounded-full bg-tundra-ink-100">
                        <div className="h-full rounded-full bg-tundra-lichen" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-20 items-center justify-center text-xs text-tundra-ink-300">No path data</div>
              )}
            </div>

            <div className="space-y-5">
              {/* Status codes */}
              <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
                <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Response Codes</span>
                </div>
                {isLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => <SkeletonBar key={i} width="w-full" />)}
                  </div>
                ) : (data?.status_codes ?? []).length > 0 ? (
                  <div className="divide-y divide-tundra-ink-100">
                    {data!.status_codes.map(({ code, label, color, pct }) => (
                      <div key={code} className="flex items-center gap-3 px-4 py-2.5">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />
                        <span className="w-8 shrink-0 font-mono text-xs font-bold text-tundra-ink">{code}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-tundra-ink-500 truncate">{label}</span>
                            <span className="shrink-0 ml-1 text-tundra-ink-400">{pct}%</span>
                          </div>
                          <div className="h-1 rounded-full bg-tundra-ink-100">
                            <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-16 items-center justify-center text-xs text-tundra-ink-300">No data</div>
                )}
              </div>

              {/* Top countries */}
              <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
                <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Top Countries</span>
                </div>
                {isLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => <SkeletonBar key={i} width="w-full" />)}
                  </div>
                ) : (data?.top_countries ?? []).length > 0 ? (
                  <div className="divide-y divide-tundra-ink-100">
                    {data!.top_countries.map(({ country, flag, pct }) => (
                      <div key={country} className="flex items-center gap-3 px-4 py-2">
                        <span className="text-base">{flag}</span>
                        <span className="flex-1 text-xs text-tundra-ink">{country}</span>
                        <span className="text-xs font-medium text-tundra-ink-500">{pct}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-16 items-center justify-center text-xs text-tundra-ink-300">No data</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
