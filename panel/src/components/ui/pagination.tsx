import { useMemo, useState } from 'react'

// ─── Constants ────────────────────────────────────────────────────────────────

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePagination<T>(items: T[], defaultPageSize = 25) {
  const [page, setPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(defaultPageSize)

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const paged = items.slice(start, start + pageSize)

  function goPage(p: number) { setPage(Math.max(1, Math.min(p, totalPages))) }
  function goPageSize(n: number) { setPageSize(n); setPage(1) }

  return { page: safePage, setPage: goPage, pageSize, setPageSize: goPageSize, paged, total: items.length, totalPages }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PaginationProps {
  total: number
  page: number
  pageSize: number
  onPage: (p: number) => void
  onPageSize: (n: number) => void
}

export function Pagination({ total, page, pageSize, onPage, onPageSize }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize)
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  const pages = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (page <= 4) return [1, 2, 3, 4, 5, '…', totalPages]
    if (page >= totalPages - 3) return [1, '…', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [1, '…', page - 1, page, page + 1, '…', totalPages]
  }, [page, totalPages])

  if (total === 0) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-tundra-ink-100 bg-tundra-ink-50 px-4 py-3">
      {/* Count + page size */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-tundra-ink-500">
          Showing <span className="font-medium text-tundra-ink">{from}–{to}</span> of{' '}
          <span className="font-medium text-tundra-ink">{total}</span>
        </span>
        <div className="flex items-center gap-1.5 text-xs text-tundra-ink-400">
          <span>Show:</span>
          {PAGE_SIZE_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => { onPageSize(n); onPage(1) }}
              className={`rounded px-2 py-0.5 font-medium transition-colors ${
                pageSize === n
                  ? 'bg-tundra-lichen text-white'
                  : 'text-tundra-ink-500 hover:bg-tundra-ink-200'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Page navigation */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" disabled={page === 1} onClick={() => { onPage(1) }}
            className="rounded border border-tundra-ink-200 px-2 py-1 text-xs font-medium text-tundra-ink-500 hover:bg-tundra-ink-100 disabled:opacity-40 transition-colors"
            title="First page">«</button>
          <button type="button" disabled={page === 1} onClick={() => { onPage(page - 1) }}
            className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-500 hover:bg-tundra-ink-100 disabled:opacity-40 transition-colors">
            ‹ Prev
          </button>

          {pages.map((p, i) =>
            p === '…' ? (
              <span key={`e${i}`} className="px-1.5 text-xs text-tundra-ink-300">…</span>
            ) : (
              <button key={p} type="button" onClick={() => { onPage(p as number) }}
                className={`min-w-[28px] rounded border px-2 py-1 text-xs font-medium transition-colors ${
                  p === page
                    ? 'border-tundra-lichen bg-tundra-lichen text-white'
                    : 'border-tundra-ink-200 text-tundra-ink-500 hover:bg-tundra-ink-100'
                }`}>
                {p}
              </button>
            ),
          )}

          <button type="button" disabled={page === totalPages} onClick={() => { onPage(page + 1) }}
            className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-500 hover:bg-tundra-ink-100 disabled:opacity-40 transition-colors">
            Next ›
          </button>
          <button type="button" disabled={page === totalPages} onClick={() => { onPage(totalPages) }}
            className="rounded border border-tundra-ink-200 px-2 py-1 text-xs font-medium text-tundra-ink-500 hover:bg-tundra-ink-100 disabled:opacity-40 transition-colors"
            title="Last page">»</button>
        </div>
      )}
    </div>
  )
}
