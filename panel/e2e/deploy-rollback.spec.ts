import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

const MOCK_SITE = {
  id: 'site-001',
  name: 'my-site',
  primary_domain: 'my-site.example.com',
  server_id: 'srv-001',
  status: 'active',
  document_root: '/var/www/my-site',
  created_at: new Date().toISOString(),
}

const MOCK_DEPLOYS = {
  data: [
    {
      id: 'dep-002',
      site_id: 'site-001',
      status: 'success',
      triggered_by: 'manual',
      source_ref: 'main@abc1234',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      log_stream: '/ws/v1/events?subscribe=deployment:dep-002',
    },
    {
      id: 'dep-001',
      site_id: 'site-001',
      status: 'success',
      triggered_by: 'manual',
      source_ref: 'main@deadbeef',
      created_at: new Date(Date.now() - 7200000).toISOString(),
      log_stream: '/ws/v1/events?subscribe=deployment:dep-001',
    },
  ],
}

test.describe('Deploy and rollback', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
    await page.route('**/api/v1/sites/site-001', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SITE) }),
    )
    await page.route('**/api/v1/sites/site-001/deployments', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DEPLOYS) }),
    )
  })

  test('site detail shows deployment history', async ({ page }) => {
    await page.goto('/sites/site-001')
    await expect(page.getByRole('heading', { name: 'my-site' })).toBeVisible()
    await expect(page.getByText('dep-002')).toBeVisible()
    await expect(page.getByText('dep-001')).toBeVisible()
  })

  test('deploy button triggers new deployment', async ({ page }) => {
    const NEW_DEPLOY = {
      id: 'dep-003',
      site_id: 'site-001',
      status: 'queued',
      triggered_by: 'manual',
      source_ref: null,
      created_at: new Date().toISOString(),
      log_stream: '/ws/v1/events?subscribe=deployment:dep-003',
    }
    await page.route('**/api/v1/sites/site-001/deploy', (route) =>
      route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify(NEW_DEPLOY) }),
    )

    await page.goto('/sites/site-001')
    await page.getByRole('button', { name: /deploy/i }).click()
    await expect(page.getByText(/queued|deploying/i)).toBeVisible()
  })

  test('deployment status badges render correctly', async ({ page }) => {
    await page.goto('/sites/site-001')
    const badges = page.getByText('success')
    await expect(badges.first()).toBeVisible()
  })
})
