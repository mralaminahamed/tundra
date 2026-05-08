import { createFileRoute, Link, Outlet, redirect, useRouterState } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/settings')({
  beforeLoad: ({ location }) => {
    if (location.pathname === '/settings') {
      throw redirect({ to: '/settings/general' })
    }
  },
  component: SettingsShell,
})

const NAV = [
  {
    label: 'Platform',
    items: [
      {
        to: '/settings/general',
        label: 'General',
        desc: 'Platform name, timezone, language',
        icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
      },
      {
        to: '/settings/smtp',
        label: 'Email / SMTP',
        desc: 'Outbound mail configuration',
        icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
      },
      {
        to: '/settings/notifications',
        label: 'Notifications',
        desc: 'Slack, Discord, email alerts',
        icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
      },
      {
        to: '/settings/access',
        label: 'Access & SSL',
        desc: 'Sessions, TOTP policy, ACME',
        icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
      },
      {
        to: '/settings/storage',
        label: 'Backup Storage',
        desc: 'S3-compatible storage, retention',
        icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
      },
      {
        to: '/settings/mcp',
        label: 'AI Agents',
        desc: 'MCP tokens, Claude, Cursor',
        icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
      },
      {
        to: '/settings/branding',
        label: 'Branding',
        desc: 'Logo, company name, footer',
        icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01',
      },
      {
        to: '/settings/dns',
        label: 'DNS defaults',
        desc: 'Nameservers, SOA, DKIM, SPF',
        icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
      },
      {
        to: '/settings/defaults',
        label: 'Defaults',
        desc: 'PHP, quota, retention',
        icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
      },
      {
        to: '/settings/security-policy',
        label: 'Security policy',
        desc: 'Password rules, lockout, maintenance',
        icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
      },
    ],
  },
  {
    label: 'Personal',
    items: [
      {
        to: '/settings/profile',
        label: 'My Profile',
        desc: 'Name, email, timezone, locale',
        icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
      },
      {
        to: '/settings/security',
        label: 'Security',
        desc: 'Password, passkeys, TOTP',
        icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
      },
    ],
  },
]

function NavIcon({ path }: { path: string }) {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px" aria-hidden>
      <path d={path} />
    </svg>
  )
}

function SettingsShell() {
  const { location } = useRouterState()
  const path = location.pathname

  // Derive current page title for header
  const allItems = NAV.flatMap((g) => g.items)
  const current = allItems.find((i) => i.to === path)

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-1.5 mb-1 text-xs text-tundra-ink-400">
          <span>Settings</span>
          <span>/</span>
          <span className="text-tundra-ink font-medium">{current?.label ?? '…'}</span>
        </div>
        <h1 className="text-2xl font-semibold text-tundra-ink">{current?.label ?? 'Settings'}</h1>
        <p className="mt-0.5 text-sm text-tundra-ink-500">
          {current?.desc ?? 'Platform configuration and personal preferences.'}
        </p>
      </div>

      <div className="flex gap-10">
        {/* Left nav */}
        <aside className="w-48 shrink-0">
          <div className="sticky top-6 space-y-5">
            {NAV.map((group) => (
              <div key={group.label}>
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-tundra-ink-300">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = path === item.to
                    return (
                      <li key={item.to}>
                        <Link
                          to={item.to}
                          className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                            active
                              ? 'bg-tundra-lichen-50 text-tundra-lichen font-medium'
                              : 'text-tundra-ink-500 hover:bg-tundra-ink-50 hover:text-tundra-ink font-medium'
                          }`}
                        >
                          <NavIcon path={item.icon} />
                          <span className="leading-tight">{item.label}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        {/* Divider */}
        <div className="w-px bg-tundra-ink-100 shrink-0" />

        {/* Content */}
        <div className="min-w-0 w-full max-w-xl pb-16">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
