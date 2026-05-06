import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/_auth/sites/$siteId/files')({
  component: SiteFilesRedirect,
})

function SiteFilesRedirect() {
  const { siteId } = Route.useParams()
  const navigate = useNavigate()

  useEffect(() => {
    void navigate({
      to: '/files/$siteId',
      params: { siteId },
      search: { path: '/' },
      replace: true,
    })
  }, [siteId, navigate])

  return null
}
