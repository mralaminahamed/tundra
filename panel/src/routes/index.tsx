import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    try {
      const res = await fetch('/api/v1/setup/status')
      if (res.ok) {
        const data = await res.json() as { needs_setup: boolean }
        if (data.needs_setup) {
          throw redirect({ to: '/setup' })
        }
      }
    } catch (e) {
      // If it's our redirect, re-throw it
      if (e && typeof e === 'object' && 'to' in e) throw e
      // Network error or API down — fall through to login
    }
    throw redirect({ to: '/login' })
  },
  component: () => null,
})
