import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

export const Route = createFileRoute('/_auth/sites/$siteId/php')({
  component: SitePhpTab,
})

const PHP_VERSIONS = ['8.4', '8.3', '8.2', '8.1', '8.0', '7.4'] as const

const EXTENSIONS = [
  { name: 'bcmath',     desc: 'Arbitrary precision math' },
  { name: 'gd',         desc: 'Image processing' },
  { name: 'imagick',    desc: 'ImageMagick integration' },
  { name: 'intl',       desc: 'Internationalization' },
  { name: 'mbstring',   desc: 'Multi-byte string support' },
  { name: 'mysqli',     desc: 'MySQL improved extension' },
  { name: 'opcache',    desc: 'Bytecode caching' },
  { name: 'pdo_mysql',  desc: 'MySQL PDO driver' },
  { name: 'pdo_pgsql',  desc: 'PostgreSQL PDO driver' },
  { name: 'redis',      desc: 'Redis client' },
  { name: 'soap',       desc: 'SOAP protocol support' },
  { name: 'xdebug',     desc: 'Debugging & profiling' },
  { name: 'xml',        desc: 'XML processing' },
  { name: 'zip',        desc: 'ZIP archive support' },
] as const

function SitePhpTab() {
  const [phpVersion, setPhpVersion]         = useState('8.3')
  const [memoryLimit, setMemoryLimit]       = useState('256')
  const [maxExecTime, setMaxExecTime]       = useState('30')
  const [maxFileSize, setMaxFileSize]       = useState('64')
  const [postMaxSize, setPostMaxSize]       = useState('64')
  const [displayErrors, setDisplayErrors]   = useState(false)
  const [opcache, setOpcache]               = useState(true)
  const [sessionSave, setSessionSave]       = useState<'files' | 'redis'>('files')
  const [enabledExts, setEnabledExts]       = useState<Set<string>>(
    new Set(['bcmath', 'gd', 'intl', 'mbstring', 'mysqli', 'opcache', 'pdo_mysql', 'xml', 'zip']),
  )

  function toggleExt(name: string) {
    setEnabledExts((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n })
  }

  function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
      <div className="flex items-start justify-between gap-4 py-3">
        <div>
          <p className="text-sm font-medium text-tundra-ink">{label}</p>
          {desc && <p className="text-xs text-tundra-ink-400">{desc}</p>}
        </div>
        <button type="button" role="switch" aria-checked={checked}
          onClick={() => { onChange(!checked) }}
          className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors ${checked ? 'border-tundra-lichen bg-tundra-lichen' : 'border-tundra-ink-300 bg-tundra-ink-100'}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </div>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* PHP version */}
      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
        <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">PHP Version</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            {PHP_VERSIONS.map((v) => (
              <button key={v} type="button" onClick={() => { setPhpVersion(v) }}
                className={`rounded-lg border py-2 font-mono text-sm font-medium transition-colors ${
                  phpVersion === v ? 'border-tundra-lichen bg-tundra-lichen text-white' : 'border-tundra-ink-200 text-tundra-ink-500 hover:border-tundra-lichen'
                }`}>
                PHP {v}
              </button>
            ))}
          </div>
          <button type="button"
            onClick={() => { toast.success(`PHP ${phpVersion} queued for update`) }}
            className="w-full rounded-lg border border-tundra-ink-200 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
            Apply PHP {phpVersion}
          </button>
        </div>
      </div>

      {/* INI settings */}
      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
        <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">PHP Settings (php.ini)</span>
        </div>
        <div className="p-4 space-y-3">
          {[
            { label: 'memory_limit (MB)',          val: memoryLimit, set: setMemoryLimit, hint: '128 – 2048' },
            { label: 'max_execution_time (s)',      val: maxExecTime, set: setMaxExecTime, hint: '30 – 300' },
            { label: 'upload_max_filesize (MB)',    val: maxFileSize, set: setMaxFileSize, hint: '2 – 256' },
            { label: 'post_max_size (MB)',          val: postMaxSize, set: setPostMaxSize, hint: '8 – 256' },
          ].map(({ label, val, set, hint }) => (
            <div key={label} className="flex items-center gap-3">
              <label className="flex-1 text-xs font-medium text-tundra-ink-600 font-mono">{label}</label>
              <input type="number" value={val}
                onChange={(e) => { set(e.target.value) }}
                className="w-24 rounded-lg border border-tundra-ink-200 px-2 py-1 text-right text-sm font-mono focus:border-tundra-lichen focus:outline-none" />
              <span className="w-20 text-xs text-tundra-ink-300">{hint}</span>
            </div>
          ))}
          <div className="divide-y divide-tundra-ink-100">
            <Toggle label="display_errors" desc="Show PHP errors in browser (disable in prod)"
              checked={displayErrors} onChange={setDisplayErrors} />
            <Toggle label="OPcache" desc="Bytecode caching for performance"
              checked={opcache} onChange={setOpcache} />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-tundra-ink-600">session.save_handler</p>
            <div className="flex gap-1">
              {(['files', 'redis'] as const).map((v) => (
                <button key={v} type="button" onClick={() => { setSessionSave(v) }}
                  className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${sessionSave === v ? 'border-tundra-lichen bg-tundra-lichen text-white' : 'border-tundra-ink-200 text-tundra-ink-500'}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => toast.success('PHP settings saved')}
            className="w-full rounded-lg bg-tundra-lichen py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
            Save settings
          </button>
        </div>
      </div>

      {/* Extensions */}
      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white lg:col-span-2">
        <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">PHP Extensions</span>
          <span className="text-xs text-tundra-ink-400">{enabledExts.size} enabled</span>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-tundra-ink-100 sm:grid-cols-3 lg:grid-cols-4">
          {EXTENSIONS.map(({ name, desc }) => {
            const enabled = enabledExts.has(name)
            return (
              <button key={name} type="button" onClick={() => { toggleExt(name) }}
                className={`flex items-start justify-between gap-2 p-3 text-left transition-colors hover:bg-tundra-ink-50 ${enabled ? '' : 'opacity-50'}`}>
                <div>
                  <p className={`font-mono text-xs font-semibold ${enabled ? 'text-tundra-ink' : 'text-tundra-ink-400'}`}>{name}</p>
                  <p className="mt-0.5 text-[10px] text-tundra-ink-400">{desc}</p>
                </div>
                <div className={`mt-0.5 h-4 w-4 shrink-0 rounded border-2 transition-colors ${enabled ? 'border-tundra-lichen bg-tundra-lichen' : 'border-tundra-ink-200'}`}>
                  {enabled && (
                    <svg viewBox="0 0 12 12" className="h-full w-full text-white" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M2 6l3 3 5-5"/>
                    </svg>
                  )}
                </div>
              </button>
            )
          })}
        </div>
        <div className="border-t border-tundra-ink-100 p-3">
          <button type="button" onClick={() => toast.success('Extensions updated')}
            className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
            Apply extension changes
          </button>
        </div>
      </div>
    </div>
  )
}
