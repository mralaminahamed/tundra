import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

export const Route = createFileRoute('/_auth/sites/$siteId/logs')({
  component: SiteLogsTab,
})

const SAMPLE_ACCESS = `127.0.0.1 - - [11/May/2025:07:14:22 +0000] "GET / HTTP/1.1" 200 2563 "-" "Mozilla/5.0"
127.0.0.1 - - [11/May/2025:07:14:23 +0000] "GET /wp-json/wp/v2/posts HTTP/1.1" 200 4812 "-" "curl/8.2.1"
10.0.0.4 - - [11/May/2025:07:14:25 +0000] "GET /favicon.ico HTTP/1.1" 404 209 "/" "Chrome/123"
10.0.0.4 - - [11/May/2025:07:14:28 +0000] "POST /wp-login.php HTTP/1.1" 302 0 "-" "Mozilla/5.0"
10.0.0.5 - - [11/May/2025:07:14:31 +0000] "GET /sitemap.xml HTTP/1.1" 200 1824 "-" "Googlebot/2.1"
`

const SAMPLE_ERROR = `[11/May/2025:07:12:01 +0000] [error] PHP Warning: Undefined variable $config in /var/www/html/wp-config.php on line 42
[11/May/2025:07:12:44 +0000] [error] PHP Fatal error: Uncaught Error: Call to undefined function get_theme_file_path() in /var/www/html/wp-content/themes/astra/header.php:18
[11/May/2025:07:13:01 +0000] [notice] Nginx reload signal sent by root
[11/May/2025:07:13:02 +0000] [notice] Using Nginx version: 1.27.0
`

function SiteLogsTab() {
  const [logType, setLogType] = useState<'access' | 'error'>('access')
  const [lines, setLines] = useState(100)

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
          <button type="button" onClick={() => toast.info('Log refresh coming soon')}
            className="rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm text-tundra-ink-500 hover:bg-tundra-ink-50 transition-colors">
            Refresh
          </button>
          <button type="button" onClick={() => toast.info('Log download coming soon')}
            className="rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm text-tundra-ink-500 hover:bg-tundra-ink-50 transition-colors">
            Download
          </button>
          <button type="button" onClick={() => toast.info('Live stream coming soon')}
            className="flex items-center gap-1.5 rounded-lg bg-tundra-lichen px-3 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            Live tail
          </button>
        </div>
      </div>

      {/* Log viewer */}
      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-[#0f1117]">
        <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-tundra-lichen" />
          <span className="text-xs text-white/60 font-mono">
            /var/log/nginx/{logType}.log — {lines} lines
          </span>
        </div>
        <pre className="max-h-[28rem] overflow-auto p-4 text-xs leading-relaxed text-green-300 font-mono whitespace-pre-wrap">
          {logType === 'access' ? SAMPLE_ACCESS : SAMPLE_ERROR}
          <span className="text-white/30 italic"># Live log data will stream here</span>
        </pre>
      </div>

      {/* PHP error log */}
      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
        <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">PHP Error Log</span>
        </div>
        <div className="p-4 text-center text-sm text-tundra-ink-400">
          <button type="button" onClick={() => toast.info('PHP error log coming soon')}
            className="text-sm font-medium text-tundra-lichen hover:underline">
            View PHP error log →
          </button>
        </div>
      </div>
    </div>
  )
}
