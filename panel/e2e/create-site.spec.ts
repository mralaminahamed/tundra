import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

const MOCK_SERVERS = {
  data: [
    { id: 'srv-001', name: 'vps-fra', hostname: 'vps.example.com', status: 'active', region: 'eu-central', os: 'ubuntu-24.04', created_at: new Date().toISOString() },
  ],
  next_cursor: null,
}

const MOCK_SITE_RESPONSE = {
  data: {
    id: 'site-001',
    name: 'my-site',
    primary_domain: 'my-site.example.com',
    server_id: 'srv-001',
    status: 'provisioning',
    document_root: '/var/www/my-site',
    created_at: new Date().toISOString(),
  },
  deployment: {
    id: 'dep-001',
    site_id: 'site-001',
    status: 'queued',
    triggered_by: 'manual',
    source_ref: null,
    created_at: new Date().toISOString(),
    log_stream: '/ws/v1/events?subscribe=deployment:dep-001',
  },
}

test.describe('Create site wizard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
    await page.route('**/api/v1/servers**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SERVERS) }),
    )
  })

  test('navigates to create site form from sites list', async ({ page }) => {
    await page.goto('/sites')
    await page.getByRole('link', { name: /create site|new site/i }).click()
    await expect(page).toHaveURL(/\/sites\/new/)
  })

  test('wizard shows all 4 steps in order', async ({ page }) => {
    await page.goto('/sites/new')
    await expect(page.getByText('Source')).toBeVisible()

    await page.getByRole('button', { name: /next/i }).click()
    await expect(page.getByText('Application')).toBeVisible()

    await page.getByText('PHP').click()
    await page.getByPlaceholder(/e\.g\. 8\.4/i).fill('8.4')
    await page.getByRole('button', { name: /next/i }).click()
    await expect(page.getByText('Domain')).toBeVisible()
  })

  test('back button returns to previous step', async ({ page }) => {
    await page.goto('/sites/new')
    await page.getByRole('button', { name: /next/i }).click()
    await expect(page.getByText('Application')).toBeVisible()

    await page.getByRole('button', { name: /back/i }).click()
    await expect(page.getByText('Source')).toBeVisible()
  })

  test('domain step validates domain format', async ({ page }) => {
    await page.goto('/sites/new')
    // Step 0 → 1
    await page.getByRole('button', { name: /next/i }).click()
    // Step 1 → 2: fill required fields
    await page.locator('select[name="kind"]').selectOption('static')
    await page.getByPlaceholder(/e\.g\. 8\.4/i).fill('1.0')
    await page.getByRole('button', { name: /next/i }).click()
    // Step 2: invalid domain
    await page.getByPlaceholder('example.com').fill('not a domain!')
    await page.getByRole('button', { name: /next/i }).click()
    await expect(page.getByText(/invalid domain/i)).toBeVisible()
  })

  test('complete wizard creates site and shows confirmation', async ({ page }) => {
    await page.route('**/api/v1/sites', (route) =>
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(MOCK_SITE_RESPONSE) }),
    )

    await page.goto('/sites/new')
    // Step 0: source (blank default)
    await page.getByRole('button', { name: /next/i }).click()
    // Step 1: application
    await page.locator('select[name="kind"]').selectOption('static')
    await page.getByPlaceholder(/e\.g\. 8\.4/i).fill('1.0')
    await page.getByRole('button', { name: /next/i }).click()
    // Step 2: domain + server
    await page.getByPlaceholder('example.com').fill('my-site.example.com')
    await page.locator('select[name="serverId"]').selectOption('srv-001')
    await page.getByRole('button', { name: /next/i }).click()
    // Step 3: confirm
    await expect(page.getByText('my-site.example.com')).toBeVisible()
    await page.getByRole('button', { name: /create site/i }).click()

    await expect(page.getByRole('heading', { name: /site created/i })).toBeVisible()
    await expect(page.getByText(/provisioning/i)).toBeVisible()
  })
})
