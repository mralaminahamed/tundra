import { createFileRoute, Link, Outlet, redirect, useRouterState } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth'
import { TundraMark } from '@/components/TundraLogo'

export const Route = createFileRoute('/_auth')({
  beforeLoad: () => {
    const { isAuthenticated } = useAuthStore.getState()
    if (!isAuthenticated()) {
      throw redirect({ to: '/login' })
    }
  },
  component: AuthLayout,
})

// ─── Icons ────────────────────────────────────────────────────────────────────

function Icon({ path, size = 16 }: { path: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}

const ICONS = {
  dashboard: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  servers: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01',
  sites: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
  'db-servers': 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4',
  databases: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4',
  backups: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
  domains: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  daemons: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  'scheduled-tasks': 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  wordpress: 'M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zM3.6 12c0-1.33.286-2.594.8-3.733L7.93 18.86A8.406 8.406 0 013.6 12zm8.4 8.4a8.413 8.413 0 01-2.393-.347l2.54-7.384 2.603 7.13a.735.735 0 00.055.107A8.41 8.41 0 0112 20.4zm1.16-12.397c.506-.027.962-.08.962-.08.453-.054.4-.72-.054-.693 0 0-1.36.107-2.24.107-.825 0-2.213-.107-2.213-.107-.453-.027-.507.666-.054.693 0 0 .43.053.882.08l1.31 3.59-1.84 5.516-3.063-9.106c.507-.027.963-.08.963-.08.453-.054.4-.72-.054-.693 0 0-1.36.107-2.24.107-.157 0-.343-.004-.54-.01A8.404 8.404 0 0112 3.6a8.4 8.4 0 016.4 2.97l-.107-.006c-.825 0-1.41.72-1.41 1.493 0 .693.4 1.28.827 1.973.32.56.694 1.28.694 2.32 0 .72-.277 1.556-.64 2.716l-.84 2.806-3.044-9.069 -.72.001zm6.193 9.703a8.405 8.405 0 01-3.07 2.534l2.594-7.493c.483-1.214.644-2.183.644-3.047 0-.313-.02-.604-.057-.877A8.394 8.394 0 0120.4 12a8.38 8.38 0 01-.647 3.306v-.6z',
  templates: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z',
  plugins: 'M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z',
  alerts: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  operators: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  files: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z',
  'audit-log': 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  settings: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  security: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  chevronLeft: 'M15 19l-7-7 7-7',
  chevronRight: 'M9 5l7 7-7 7',
  logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
} as const

type IconKey = keyof typeof ICONS

// ─── Nav definition ───────────────────────────────────────────────────────────

const NAV_GROUPS: {
  label: string
  items: { to: string; label: string; icon: IconKey }[]
}[] = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
      { to: '/servers', label: 'Servers', icon: 'servers' },
      { to: '/sites', label: 'Sites', icon: 'sites' },
    ],
  },
  {
    label: 'Data',
    items: [
      { to: '/database-servers', label: 'DB Servers', icon: 'db-servers' },
      { to: '/databases', label: 'Databases', icon: 'databases' },
      { to: '/backups', label: 'Backups', icon: 'backups' },
    ],
  },
  {
    label: 'Services',
    items: [
      { to: '/files', label: 'Files', icon: 'files' },
      { to: '/domains', label: 'Domains', icon: 'domains' },
      { to: '/mail', label: 'Mail', icon: 'mail' },
      { to: '/daemons', label: 'Daemons', icon: 'daemons' },
      { to: '/scheduled-tasks', label: 'Scheduled Tasks', icon: 'scheduled-tasks' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { to: '/templates', label: 'Templates', icon: 'templates' },
      { to: '/plugins', label: 'Plugins', icon: 'plugins' },
      { to: '/alerts', label: 'Alerts', icon: 'alerts' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/operators', label: 'Operators', icon: 'operators' },
      { to: '/audit-log', label: 'Audit Log', icon: 'audit-log' },
      { to: '/settings', label: 'Settings', icon: 'settings' },
      { to: '/settings/security', label: 'Security', icon: 'security' },
    ],
  },
]

// ─── Layout ───────────────────────────────────────────────────────────────────

function AuthLayout() {
  const operator = useAuthStore((s) => s.operator)
  const setOperator = useAuthStore((s) => s.setOperator)

  const { data: installedPlugins = [] } = useQuery<{ plugin_id: string; state: string }[]>({
    queryKey: ['plugins-nav'],
    queryFn: () =>
      fetch('/api/v1/plugins')
        .then((r) => r.json())
        .then((r: { data: { plugin_id: string; state: string }[] }) => r.data),
    staleTime: 30_000,
  })

  const wordpressEnabled = installedPlugins.some(
    (p) => p.plugin_id === 'com.tundra.wordpress' && p.state === 'enabled',
  )

  const navGroups = NAV_GROUPS.map((group) => {
    if (group.label !== 'Services') return group
    const wpItem = { to: '/wordpress', label: 'WordPress', icon: 'wordpress' } as const
    const items = wordpressEnabled
      ? [group.items[0]!, group.items[1]!, wpItem, ...group.items.slice(2)]
      : group.items
    return { ...group, items }
  })

  const { location } = useRouterState()
  const isFullscreen =
    location.pathname.startsWith('/editor/') ||
    /^\/files\/[^/]+/.test(location.pathname)

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('tundra-sidebar-collapsed') === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    localStorage.setItem('tundra-sidebar-collapsed', String(collapsed))
  }, [collapsed])

  return (
    <div className="flex min-h-screen bg-tundra-paper">
      {/* Sidebar */}
      <aside
        className={`${collapsed ? 'w-14' : 'w-60'} shrink-0 border-r border-tundra-ink-200 bg-white flex flex-col transition-[width] duration-200`}
      >
        {/* Logo + collapse toggle */}
        <div className={`flex items-center border-b border-tundra-ink-100 ${collapsed ? 'justify-center px-3 py-4' : 'gap-2.5 px-4 py-4'}`}>
          <TundraMark size={20} color="#1C1F1A" />
          {!collapsed && (
            <span
              className="font-black text-base text-tundra-ink flex-1"
              style={{ fontFamily: "'Inter Display', 'Inter', sans-serif", letterSpacing: '-0.5px' }}
            >
              tundra
            </span>
          )}
          <button
            onClick={() => { setCollapsed((c) => !c) }}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="rounded-md p-1 text-tundra-ink-300 hover:bg-tundra-ink-50 hover:text-tundra-ink transition-colors"
          >
            <Icon path={collapsed ? ICONS.chevronRight : ICONS.chevronLeft} size={14} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 flex flex-col gap-1">
          {navGroups.map((group) => (
            <div key={group.label} className={collapsed ? 'px-2' : 'px-3'}>
              {!collapsed && (
                <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-tundra-ink-300">
                  {group.label}
                </div>
              )}
              {collapsed && <div className="my-1 border-t border-tundra-ink-100" />}
              {group.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-2.5 rounded-md transition-colors text-sm ${collapsed ? 'justify-center px-0 py-2.5' : 'px-2 py-2'}`}
                  activeProps={{ className: 'bg-tundra-lichen-50 text-tundra-lichen font-medium' }}
                  inactiveProps={{ className: 'text-tundra-ink-500 hover:bg-tundra-ink-50 hover:text-tundra-ink' }}
                >
                  <Icon path={ICONS[item.icon]} size={16} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className={`border-t border-tundra-ink-100 ${collapsed ? 'flex flex-col items-center gap-2 py-3' : 'px-4 py-3'}`}>
          {!collapsed && (
            <div className="text-xs text-tundra-ink-500 truncate mb-2">{operator?.email}</div>
          )}
          {/* Logout */}
          <button
            title="Sign out"
            onClick={() => { setOperator(null) }}
            className={`flex items-center gap-2 rounded-md text-tundra-ink-400 hover:text-tundra-rust hover:bg-tundra-rust-50 transition-colors text-xs ${collapsed ? 'justify-center p-2' : 'w-full px-2 py-1.5'}`}
          >
            <Icon path={ICONS.logout} size={14} />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      <main className={`flex-1 ${isFullscreen ? 'overflow-hidden h-screen' : 'overflow-auto p-6'}`}>
        <Outlet />
      </main>
    </div>
  )
}
