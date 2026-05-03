import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/backups')({
  component: BackupsLayout,
})

function BackupsLayout() {
  return <Outlet />
}
