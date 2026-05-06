import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/_auth/sites/$siteId/analytics')({
  component: SiteAnalyticsTab,
})

// Simulated 30-day request data
const DAYS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() - (29 - i))
  return {
    label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    requests: Math.floor(800 + Math.random() * 2400),
    bandwidth: Math.floor(50 + Math.random() * 300),
  }
})

const TOP_PATHS = [
  { path: '/', requests: 12340, pct: 100 },
  { path: '/wp-json/wp/v2/posts', requests: 4821, pct: 39 },
  { path: '/sitemap.xml', requests: 2103, pct: 17 },
  { path: '/wp-login.php', requests: 1847, pct: 15 },
  { path: '/wp-content/uploads/', requests: 1543, pct: 12.5 },
  { path: '/feed/', requests: 982, pct: 8 },
]

const STATUS_CODES = [
  { code: '2xx', label: 'OK',              count: 89432, color: 'bg-tundra-lichen',  pct: 87.4 },
  { code: '3xx', label: 'Redirect',        count: 5821,  color: 'bg-tundra-aurora',  pct: 5.7  },
  { code: '4xx', label: 'Client error',    count: 5213,  color: 'bg-yellow-400',     pct: 5.1  },
  { code: '5xx', label: 'Server error',    count: 1834,  color: 'bg-red-500',        pct: 1.8  },
]

const TOP_COUNTRIES = [
  { country: 'United States', flag: '🇺🇸', pct: 38 },
  { country: 'Germany',       flag: '🇩🇪', pct: 14 },
  { country: 'United Kingdom',flag: '🇬🇧', pct: 11 },
  { country: 'France',        flag: '🇫🇷', pct: 8  },
  { country: 'Canada',        flag: '🇨🇦', pct: 6  },
  { country: 'Other',         flag: '🌍',  pct: 23 },
]

function SiteAnalyticsTab() {
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d')

  const visibleDays = range === '7d' ? DAYS.slice(-7) : range === '90d' ? DAYS : DAYS
  const maxReq = Math.max(...visibleDays.map((d) => d.requests))
  const totalReq = visibleDays.reduce((s, d) => s + d.requests, 0)
  const totalBw = visibleDays.reduce((s, d) => s + d.bandwidth, 0)

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

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total requests', value: totalReq.toLocaleString(), sub: `${range}` },
          { label: 'Bandwidth',      value: `${totalBw.toLocaleString()} MB`, sub: `${range}` },
          { label: 'Avg req/day',    value: Math.round(totalReq / visibleDays.length).toLocaleString(), sub: 'requests' },
          { label: 'Error rate',     value: '1.8%', sub: '5xx responses', warn: true },
        ].map(({ label, value, sub, warn }) => (
          <div key={label} className="rounded-xl border border-tundra-ink-200 bg-white p-4">
            <p className="text-xs text-tundra-ink-400">{label}</p>
            <p className={`mt-1 text-xl font-bold tabular-nums ${warn ? 'text-red-600' : 'text-tundra-ink'}`}>{value}</p>
            <p className="mt-0.5 text-xs text-tundra-ink-300">{sub}</p>
          </div>
        ))}
      </div>

      {/* Request chart */}
      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Requests per day</p>
        <div className="flex items-end gap-0.5" style={{ height: 100 }}>
          {visibleDays.map((d, i) => (
            <div key={i} className="group relative flex flex-1 flex-col items-center justify-end" style={{ height: '100%' }}>
              <div
                className="w-full rounded-t bg-tundra-lichen transition-all group-hover:bg-tundra-lichen-600"
                style={{ height: `${Math.round((d.requests / maxReq) * 100)}%` }}
              />
              {/* tooltip */}
              <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-tundra-ink px-1.5 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                {d.label}: {d.requests.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-tundra-ink-300">
          <span>{visibleDays[0]?.label}</span>
          <span>{visibleDays[visibleDays.length - 1]?.label}</span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Top paths */}
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white lg:col-span-2">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Top Paths</span>
          </div>
          <div className="divide-y divide-tundra-ink-100">
            {TOP_PATHS.map(({ path, requests, pct }) => (
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
        </div>

        <div className="space-y-5">
          {/* Status codes */}
          <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
            <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Response Codes</span>
            </div>
            <div className="divide-y divide-tundra-ink-100">
              {STATUS_CODES.map(({ code, label, color, pct }) => (
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
          </div>

          {/* Top countries */}
          <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
            <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Top Countries</span>
            </div>
            <div className="divide-y divide-tundra-ink-100">
              {TOP_COUNTRIES.map(({ country, flag, pct }) => (
                <div key={country} className="flex items-center gap-3 px-4 py-2">
                  <span className="text-base">{flag}</span>
                  <span className="flex-1 text-xs text-tundra-ink">{country}</span>
                  <span className="text-xs font-medium text-tundra-ink-500">{pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
