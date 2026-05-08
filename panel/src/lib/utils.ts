import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Date/time ─────────────────────────────────────────────────────────────────

// Rust time::OffsetDateTime::to_string() emits "2026-05-08 19:53:42.671394 +00:00:00"
// (space separator; space before tz; microseconds; extra :00 in tz). Normalize to ISO 8601.
function normalizeTs(ts: string): string {
  return ts
    .replace(' ', 'T')                       // first space → T
    .replace(/(\.\d{3})\d*/, '$1')           // truncate sub-ms precision
    .replace(/\s*(\+\d{2}:\d{2}):\d{2}$/, '$1') // strip space + extra :ss from tz offset
}

/** "May 6, 2026" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(normalizeTs(iso))
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** "May 6, 2026, 2:34 PM" */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(normalizeTs(iso))
  return isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

/** Relative for recent dates, absolute for older ones: "3m ago", "2h ago", "3d ago", "May 6, 2026" */
export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(normalizeTs(iso))
  if (isNaN(d.getTime())) return '—'
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// ── Bytes ─────────────────────────────────────────────────────────────────────

/** "1.4 MB", "830 KB", "512 B" */
export function fmtBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes === 0)   return '0 B'
  if (bytes < 1024)  return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

// ── Strings ───────────────────────────────────────────────────────────────────

/** "hello world" → "Hello World" */
export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Truncate with ellipsis */
export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}
