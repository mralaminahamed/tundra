import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/settings')({
  beforeLoad: ({ location }) => {
    if (location.pathname === '/settings') {
      throw redirect({ to: '/settings/mcp' })
    }
  },
  component: () => <Outlet />,
})
