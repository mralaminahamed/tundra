import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/mail')({
  beforeLoad: ({ location }) => {
    if (location.pathname === '/mail') {
      throw redirect({ to: '/mail/domains' })
    }
  },
  component: () => <Outlet />,
})
