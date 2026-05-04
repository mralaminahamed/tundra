import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/backups')({
  beforeLoad: ({ location }) => {
    if (location.pathname === '/backups') {
      throw redirect({ to: '/backups/targets' })
    }
  },
  component: () => <Outlet />,
})
