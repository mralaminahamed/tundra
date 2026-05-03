import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

const MOCK_SERVER = { id: 'srv-001', name: 'prod', hostname: 'prod.example.com', status: 'active' }

const MOCK_SITE = {
  id: 'site-001',
  name: 'my-app',
  primary_domain: 'myapp.example.com',
  status: 'active',
  application: { kind: 'nodejs', runtime_version: '22', start_command: 'node dist/index.js', listen_port: 3000 },
}

const MOCK_DEPLOYMENT = {
  id: 'dep-001',
  site_id: 'site-001',
  status: 'queued',
  source_ref: 'main',
  active_slot: null,
}

test.describe('Runtime deploy wizard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
    await page.route('**/api/v1/servers**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [MOCK_SERVER] }) })
    )
    await page.route('**/api/v1/sites', (r) => {
      if (r.request().method() === 'POST') {
        return r.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: MOCK_SITE, deployment: MOCK_DEPLOYMENT }),
        })
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [MOCK_SITE] }) })
    })
  })

  test('create-site wizard shows application types', async ({ page }) => {
    await page.goto('/sites/new')
    await expect(page.getByRole('heading', { name: /create site/i })).toBeVisible()
  })

  test('template picker pre-fills application step', async ({ page }) => {
    await page.goto('/sites/new')
    // Select Template source
    await page.getByRole('combobox').selectOption('template')
    await expect(page.getByText('Next.js')).toBeVisible()
    await expect(page.getByText('Django')).toBeVisible()
    // Click Next.js template
    await page.getByText('Next.js').click()
    // Advance to Application step
    await page.getByRole('button', { name: /next/i }).click()
    // Runtime version should be pre-filled with 22
    await expect(page.getByPlaceholder(/e\.g\. 22/i).or(page.locator('[name=runtimeVersion]'))).toHaveValue('22')
  })

  test('nodejs wizard step shows start command and port fields', async ({ page }) => {
    await page.goto('/sites/new')
    await page.getByRole('button', { name: /next/i }).click()
    // Application step: select nodejs
    const kindSelect = page.locator('[name=kind]')
    await kindSelect.selectOption('nodejs')
    await expect(page.locator('[name=startCommand]')).toBeVisible()
    await expect(page.locator('[name=listenPort]')).toBeVisible()
  })

  test('static type hides start command and port', async ({ page }) => {
    await page.goto('/sites/new')
    await page.getByRole('button', { name: /next/i }).click()
    const kindSelect = page.locator('[name=kind]')
    await kindSelect.selectOption('static')
    await expect(page.locator('[name=startCommand]')).not.toBeVisible()
    await expect(page.locator('[name=listenPort]')).not.toBeVisible()
  })

  test('full create-site flow submits and shows success', async ({ page }) => {
    await page.goto('/sites/new')
    // Step 0: source = blank
    await page.getByRole('button', { name: /next/i }).click()
    // Step 1: application
    await page.locator('[name=kind]').selectOption('nodejs')
    await page.locator('[name=runtimeVersion]').fill('22')
    await page.locator('[name=startCommand]').fill('node dist/index.js')
    await page.locator('[name=listenPort]').fill('3000')
    await page.getByRole('button', { name: /next/i }).click()
    // Step 2: domain + server
    await page.locator('[name=domain]').fill('myapp.example.com')
    await page.locator('[name=serverId]').selectOption('srv-001')
    await page.getByRole('button', { name: /next/i }).click()
    // Step 3: confirm
    await expect(page.getByText('myapp.example.com')).toBeVisible()
    await page.getByRole('button', { name: /create site/i }).click()
    await expect(page.getByText(/provisioning|created/i)).toBeVisible()
  })
})
