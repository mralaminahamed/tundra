import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'

export const Route = createFileRoute('/_auth/settings/branding')({
  component: BrandingPage,
})

interface BrandingSettings {
  company_name?: string | null
  support_email?: string | null
  support_url?: string | null
  logo_url?: string | null
  favicon_url?: string | null
  custom_footer?: string | null
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

function BrandingPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'branding'],
    queryFn: () => api<{ data: BrandingSettings }>('/settings/branding'),
  })
  const s = data?.data ?? {}

  const [companyName,  setCompanyName]  = useState('')
  const [supportEmail, setSupportEmail] = useState('')
  const [supportUrl,   setSupportUrl]   = useState('')
  const [logoUrl,      setLogoUrl]      = useState('')
  const [faviconUrl,   setFaviconUrl]   = useState('')
  const [footer,       setFooter]       = useState('')

  useEffect(() => {
    if (!data) return
    setCompanyName(s.company_name ?? '')
    setSupportEmail(s.support_email ?? '')
    setSupportUrl(s.support_url ?? '')
    setLogoUrl(s.logo_url ?? '')
    setFaviconUrl(s.favicon_url ?? '')
    setFooter(s.custom_footer ?? '')
  }, [data])

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api('/settings/branding', { method: 'PATCH', body }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['settings', 'branding'] }); toast.success('Branding saved') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  const isDirty = data && (
    companyName  !== (s.company_name ?? '')  ||
    supportEmail !== (s.support_email ?? '') ||
    supportUrl   !== (s.support_url ?? '')   ||
    logoUrl      !== (s.logo_url ?? '')      ||
    faviconUrl   !== (s.favicon_url ?? '')   ||
    footer       !== (s.custom_footer ?? '')
  )

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    saveMut.mutate({
      company_name:  companyName.trim()  || null,
      support_email: supportEmail.trim() || null,
      support_url:   supportUrl.trim()   || null,
      logo_url:      logoUrl.trim()      || null,
      favicon_url:   faviconUrl.trim()   || null,
      custom_footer: footer.trim()       || null,
    })
  }

  if (isLoading) return <div className="h-48 rounded-xl bg-tundra-ink-100 animate-pulse" />

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <SectionCard title="Company identity" desc="Shown in emails, the panel header, and error pages.">
        <div className="space-y-4">
          <div>
            <label className={LABEL}>Company name</label>
            <input value={companyName} onChange={(e) => { setCompanyName(e.target.value) }}
              placeholder="Acme Hosting" className={INPUT} />
            <p className="mt-1 text-xs text-tundra-ink-400">Overrides "Tundra" in outgoing emails and the browser tab.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Support email</label>
              <input type="email" value={supportEmail} onChange={(e) => { setSupportEmail(e.target.value) }}
                placeholder="support@example.com" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Support URL</label>
              <input value={supportUrl} onChange={(e) => { setSupportUrl(e.target.value) }}
                placeholder="https://help.example.com" className={INPUT} />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Assets" desc="URLs must be publicly accessible (HTTPS recommended).">
        <div className="space-y-4">
          <div>
            <label className={LABEL}>Logo URL</label>
            <div className="flex gap-3 items-start">
              <input value={logoUrl} onChange={(e) => { setLogoUrl(e.target.value) }}
                placeholder="https://example.com/logo.svg" className={INPUT} />
              {logoUrl && (
                <img src={logoUrl} alt="Logo preview" className="h-10 w-auto rounded border border-tundra-ink-200 shrink-0 object-contain bg-white p-1" />
              )}
            </div>
            <p className="mt-1 text-xs text-tundra-ink-400">SVG or PNG, shown in the sidebar. Recommended: 160×40 px.</p>
          </div>
          <div>
            <label className={LABEL}>Favicon URL</label>
            <div className="flex gap-3 items-start">
              <input value={faviconUrl} onChange={(e) => { setFaviconUrl(e.target.value) }}
                placeholder="https://example.com/favicon.ico" className={INPUT} />
              {faviconUrl && (
                <img src={faviconUrl} alt="Favicon preview" className="h-8 w-8 rounded border border-tundra-ink-200 shrink-0 object-contain bg-white p-0.5" />
              )}
            </div>
            <p className="mt-1 text-xs text-tundra-ink-400">ICO or PNG, 32×32 px.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Custom footer">
        <textarea value={footer} onChange={(e) => { setFooter(e.target.value) }} rows={3}
          placeholder="© 2026 Acme Hosting · Terms · Privacy"
          className={`${INPUT} resize-y`} />
        <p className="mt-1 text-xs text-tundra-ink-400">Plain text or basic HTML. Shown at the bottom of the panel.</p>
      </SectionCard>

      <div className="flex justify-end gap-3">
        <button type="button" disabled={!isDirty || saveMut.isPending}
          onClick={() => { setCompanyName(s.company_name ?? ''); setSupportEmail(s.support_email ?? ''); setSupportUrl(s.support_url ?? ''); setLogoUrl(s.logo_url ?? ''); setFaviconUrl(s.favicon_url ?? ''); setFooter(s.custom_footer ?? '') }}
          className="rounded-lg border border-tundra-ink-200 px-5 py-2.5 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-40 transition-colors">
          Discard
        </button>
        <button type="submit" disabled={!isDirty || saveMut.isPending}
          className="rounded-lg bg-tundra-lichen px-5 py-2.5 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-40 transition-colors">
          {saveMut.isPending ? 'Saving…' : 'Save branding'}
        </button>
      </div>
    </form>
  )
}
