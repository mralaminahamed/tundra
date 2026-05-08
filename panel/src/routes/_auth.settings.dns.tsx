import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'

export const Route = createFileRoute('/_auth/settings/dns')({
  component: DnsPage,
})

interface DnsSettings {
  nameserver1?: string | null
  nameserver2?: string | null
  nameserver3?: string | null
  soa_email?: string | null
  default_ttl?: number | null
  default_mx_priority?: number | null
  enable_dkim_by_default?: boolean
  enable_spf_by_default?: boolean
}

const INPUT = 'w-full rounded-lg border border-tundra-ink-200 bg-white px-3.5 py-2.5 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20'
const LABEL = 'block text-sm font-medium text-tundra-ink-700 mb-1.5'

function SectionCard({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-tundra-ink">{title}</h3>
        {desc && <p className="mt-0.5 text-xs text-tundra-ink-400">{desc}</p>}
      </div>
      <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <div className="relative mt-0.5 shrink-0">
        <input type="checkbox" checked={checked} onChange={(e) => { onChange(e.target.checked) }} className="sr-only" />
        <div className={`w-9 h-5 rounded-full transition-colors ${checked ? 'bg-tundra-lichen' : 'bg-tundra-ink-200'}`} />
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </div>
      <div>
        <p className="text-sm font-medium text-tundra-ink">{label}</p>
        {desc && <p className="text-xs text-tundra-ink-400 mt-0.5">{desc}</p>}
      </div>
    </label>
  )
}

function DnsPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'dns'],
    queryFn: () => api<{ data: DnsSettings }>('/settings/dns'),
  })
  const s = data?.data ?? {}

  const [ns1,        setNs1]        = useState('')
  const [ns2,        setNs2]        = useState('')
  const [ns3,        setNs3]        = useState('')
  const [soaEmail,   setSoaEmail]   = useState('')
  const [ttl,        setTtl]        = useState('3600')
  const [mxPriority, setMxPriority] = useState('10')
  const [dkim,       setDkim]       = useState(true)
  const [spf,        setSpf]        = useState(true)

  useEffect(() => {
    if (!data) return
    setNs1(s.nameserver1 ?? '')
    setNs2(s.nameserver2 ?? '')
    setNs3(s.nameserver3 ?? '')
    setSoaEmail(s.soa_email ?? '')
    setTtl(String(s.default_ttl ?? 3600))
    setMxPriority(String(s.default_mx_priority ?? 10))
    setDkim(s.enable_dkim_by_default ?? true)
    setSpf(s.enable_spf_by_default ?? true)
  }, [data])

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api('/settings/dns', { method: 'PATCH', body }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['settings', 'dns'] }); toast.success('DNS settings saved') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    saveMut.mutate({
      nameserver1: ns1.trim() || null,
      nameserver2: ns2.trim() || null,
      nameserver3: ns3.trim() || null,
      soa_email: soaEmail.trim() || null,
      default_ttl: ttl ? parseInt(ttl, 10) : 3600,
      default_mx_priority: mxPriority ? parseInt(mxPriority, 10) : 10,
      enable_dkim_by_default: dkim,
      enable_spf_by_default: spf,
    })
  }

  if (isLoading) return <div className="h-48 rounded-xl bg-tundra-ink-100 animate-pulse" />

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <SectionCard title="Nameservers" desc="Default nameservers added to new domains. Usually your DNS hosting provider's NS records.">
        <div className="space-y-3">
          {[
            { label: 'Primary nameserver', value: ns1, set: setNs1, placeholder: 'ns1.example.com' },
            { label: 'Secondary nameserver', value: ns2, set: setNs2, placeholder: 'ns2.example.com' },
            { label: 'Tertiary nameserver (optional)', value: ns3, set: setNs3, placeholder: 'ns3.example.com' },
          ].map(({ label, value, set, placeholder }) => (
            <div key={label}>
              <label className={LABEL}>{label}</label>
              <input value={value} onChange={(e) => { set(e.target.value) }}
                placeholder={placeholder} className={`${INPUT} font-mono`} />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="SOA &amp; zone defaults" desc="Applied when creating new DNS zones.">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={LABEL}>SOA admin email</label>
            <input type="email" value={soaEmail} onChange={(e) => { setSoaEmail(e.target.value) }}
              placeholder="hostmaster@example.com" className={INPUT} />
            <p className="mt-1 text-xs text-tundra-ink-400">Used in the SOA record. Dots are encoded as per RFC 1035.</p>
          </div>
          <div>
            <label className={LABEL}>Default TTL (seconds)</label>
            <input type="number" value={ttl} onChange={(e) => { setTtl(e.target.value) }}
              min={60} max={86400} placeholder="3600" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Default MX priority</label>
            <input type="number" value={mxPriority} onChange={(e) => { setMxPriority(e.target.value) }}
              min={0} max={65535} placeholder="10" className={INPUT} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Email authentication defaults">
        <div className="space-y-4">
          <Toggle checked={dkim} onChange={setDkim}
            label="Enable DKIM by default"
            desc="Automatically generate and add a DKIM TXT record for new mail domains." />
          <Toggle checked={spf} onChange={setSpf}
            label="Enable SPF by default"
            desc="Automatically add a recommended SPF TXT record for new mail domains." />
        </div>
      </SectionCard>

      <div className="flex justify-end gap-3">
        <button type="submit" disabled={saveMut.isPending}
          className="rounded-lg bg-tundra-lichen px-5 py-2.5 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-40 transition-colors">
          {saveMut.isPending ? 'Saving…' : 'Save DNS settings'}
        </button>
      </div>
    </form>
  )
}
