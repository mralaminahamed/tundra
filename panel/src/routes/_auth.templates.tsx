import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import type { ListResponse, TemplateManifest } from '@/lib/api-types'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_auth/templates')({
  component: TemplatesGalleryPage,
})

const RUNTIME_LABELS: Record<string, string> = {
  nodejs: 'Node.js',
  python: 'Python',
  php: 'PHP',
  ruby: 'Ruby',
  go: 'Go',
  rust: 'Rust',
  static: 'Static',
  dotnet: '.NET',
}

function TemplateCard({ template }: { template: TemplateManifest }) {
  const navigate = useNavigate()

  function handleUse() {
    void navigate({
      to: '/sites/new',
      search: { template: template.id },
    })
  }

  const runtimeLabel = RUNTIME_LABELS[template.runtime.kind] ?? template.runtime.kind
  const runtimeBadge = template.runtime.version
    ? `${runtimeLabel} ${template.runtime.version}`
    : runtimeLabel

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-tundra-ink-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* Icon placeholder + name */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-tundra-ink-50 text-lg font-bold text-tundra-ink-400 select-none">
          {template.name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-tundra-ink-900">{template.name}</p>
          <span className="inline-block rounded-full bg-tundra-lichen/15 px-2 py-0.5 text-xs font-medium text-tundra-lichen-700">
            {runtimeBadge}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="flex-1 text-sm text-tundra-ink-500 leading-relaxed line-clamp-3">
        {template.description}
      </p>

      {/* Tags */}
      {template.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {template.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-tundra-ink-150 px-2 py-0.5 text-xs text-tundra-ink-500"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <Button size="sm" className="mt-auto w-full" onClick={handleUse}>
        Use this template
      </Button>
    </div>
  )
}

function TemplatesGalleryPage() {
  const [search, setSearch] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api<ListResponse<TemplateManifest>>('/templates'),
    staleTime: Infinity, // templates never change at runtime
  })

  const templates = data?.data ?? []

  const filtered = search.trim()
    ? templates.filter((t) => {
        const q = search.trim().toLowerCase()
        return (
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
          t.runtime.kind.toLowerCase().includes(q)
        )
      })
    : templates

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Templates</h1>
        <p className="text-sm text-tundra-ink-500">
          Choose a starter template to scaffold a new site with pre-configured runtime settings.
        </p>
      </div>

      {/* Search */}
      <div className="max-w-sm">
        <input
          type="search"
          placeholder="Search templates…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); }}
          className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-2 text-sm placeholder:text-tundra-ink-400 focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
          aria-label="Search templates"
        />
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-52 animate-pulse rounded-xl border border-tundra-ink-100 bg-tundra-ink-50"
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && (
        <p className="text-sm text-tundra-rust">Failed to load templates. Please try again.</p>
      )}

      {/* Results */}
      {!isLoading && !isError && (
        <>
          {filtered.length === 0 ? (
            <p className="text-sm text-tundra-ink-400">
              No templates match &ldquo;{search}&rdquo;.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((tmpl) => (
                <TemplateCard key={tmpl.id} template={tmpl} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
