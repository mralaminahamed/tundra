import { createFileRoute } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth'

export const Route = createFileRoute('/_auth/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const operator = useAuthStore((s) => s.operator)
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
      <p className="text-tundra-ink-500">Welcome back, {operator?.full_name}.</p>
    </div>
  )
}
