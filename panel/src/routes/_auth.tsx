import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth'

export const Route = createFileRoute('/_auth')({
  beforeLoad: () => {
    const { isAuthenticated } = useAuthStore.getState()
    if (!isAuthenticated()) {
      throw redirect({ to: '/login' })
    }
  },
  component: AuthLayout,
})

function AuthLayout() {
  const operator = useAuthStore((s) => s.operator)

  return (
    <div className="flex min-h-screen bg-tundra-paper">
      {/* Sidebar */}
      <aside className="w-60 border-r border-tundra-ink-200 bg-white p-4 flex flex-col gap-2">
        <div className="mb-6 font-semibold text-tundra-ink text-lg">Tundra</div>
        <nav className="flex flex-col gap-1 text-sm">
          <a href="/dashboard" className="rounded px-3 py-2 hover:bg-tundra-ink-50">
            Dashboard
          </a>
          <a href="/operators" className="rounded px-3 py-2 hover:bg-tundra-ink-50">
            Operators
          </a>
          <a href="/audit-log" className="rounded px-3 py-2 hover:bg-tundra-ink-50">
            Audit Log
          </a>
        </nav>
        <div className="mt-auto text-xs text-tundra-ink-500">{operator?.email}</div>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
