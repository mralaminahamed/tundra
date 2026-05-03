import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/mail')({
  component: MailLayout,
})

function MailLayout() {
  return <Outlet />
}
