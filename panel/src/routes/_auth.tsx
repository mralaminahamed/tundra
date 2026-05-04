import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'
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

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/servers', label: 'Servers' },
      { to: '/sites', label: 'Sites' },
    ],
  },
  {
    label: 'Data',
    items: [
      { to: '/database-servers', label: 'DB Servers' },
      { to: '/databases', label: 'Databases' },
      { to: '/backups', label: 'Backups' },
    ],
  },
  {
    label: 'Services',
    items: [
      { to: '/domains', label: 'Domains' },
      { to: '/mail', label: 'Mail' },
      { to: '/daemons', label: 'Daemons' },
      { to: '/scheduled-tasks', label: 'Scheduled Tasks' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { to: '/templates', label: 'Templates' },
      { to: '/plugins', label: 'Plugins' },
      { to: '/alerts', label: 'Alerts' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/operators', label: 'Operators' },
      { to: '/audit-log', label: 'Audit Log' },
      { to: '/settings', label: 'Settings' },
      { to: '/settings/security', label: 'Security' },
    ],
  },
] as const

function AuthLayout() {
  const operator = useAuthStore((s) => s.operator)

  return (
    <div className="flex min-h-screen bg-tundra-paper">
      <aside className="w-60 shrink-0 border-r border-tundra-ink-200 bg-white flex flex-col">
        <div className="px-4 py-4 flex items-center gap-2.5">
          <TundraMark size={20} color="#1C1F1A" />
          <span className="font-black text-base tracking-tight text-tundra-ink" style={{ fontFamily: "'Inter Display', 'Inter', sans-serif", letterSpacing: '-0.5px' }}>tundra</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-4 text-sm">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-tundra-ink-400">
                {group.label}
              </div>
              {group.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="block rounded px-3 py-2 transition-colors"
                  activeProps={{ className: 'bg-tundra-lichen-50 text-tundra-lichen font-medium' }}
                  inactiveProps={{ className: 'text-tundra-ink-600 hover:bg-tundra-ink-50 hover:text-tundra-ink' }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-tundra-ink-100 text-xs text-tundra-ink-500 truncate">
          {operator?.email}
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
