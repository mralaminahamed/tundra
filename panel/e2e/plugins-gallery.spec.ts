import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

const MOCK_PLUGINS = {
  data: [
    {
      id: 'plg-001',
      plugin_id: 'com.tundra.namecheap',
      version: '1.0.0',
      source: 'core',
      state: 'enabled',
      signature_verified: true,
      created_at: new Date().toISOString(),
      manifest: {
        name: 'Namecheap',
        description: 'Connect a Namecheap account to manage domain registrations.',
        author: 'Tundra Team',
        license: 'Apache-2.0',
      },
    },
    {
      id: 'plg-002',
      plugin_id: 'com.tundra.github',
      version: '1.0.0',
      source: 'core',
      state: 'disabled',
      signature_verified: true,
      created_at: new Date().toISOString(),
      manifest: {
        name: 'GitHub',
        description: 'Connect a GitHub account via the Tundra GitHub App.',
        author: 'Tundra Team',
        license: 'Apache-2.0',
      },
    },
    {
      id: 'plg-003',
      plugin_id: 'com.example.unsigned',
      version: '0.1.0',
      source: 'sideload',
      state: 'installed',
      signature_verified: false,
      created_at: new Date().toISOString(),
      manifest: {
        name: 'Community Plugin',
        description: 'An unsigned community plugin.',
        author: 'Community',
        license: 'MIT',
      },
    },
  ],
}

test.describe('Plugins gallery', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
    await page.route('**/api/v1/plugins', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_PLUGINS),
      }),
    )
  })

  test('shows all installed plugins', async ({ page }) => {
    await page.goto('/plugins')
    await expect(page.getByRole('heading', { name: /plugins/i })).toBeVisible()
    await expect(page.getByText('Namecheap')).toBeVisible()
    await expect(page.getByText('GitHub')).toBeVisible()
    await expect(page.getByText('Community Plugin')).toBeVisible()
  })

  test('enabled plugin shows disable button', async ({ page }) => {
    await page.goto('/plugins')
    const cards = page.locator('.rounded-lg.border').filter({ hasText: 'Namecheap' })
    await expect(cards.getByRole('button', { name: /disable/i })).toBeVisible()
  })

  test('disabled plugin shows enable button', async ({ page }) => {
    await page.goto('/plugins')
    const cards = page.locator('.rounded-lg.border').filter({ hasText: 'GitHub' })
    await expect(cards.getByRole('button', { name: /enable/i })).toBeVisible()
  })

  test('unsigned plugin shows warning', async ({ page }) => {
    await page.goto('/plugins')
    await expect(page.getByText(/unsigned/i)).toBeVisible()
  })

  test('enabled state badge displays correctly', async ({ page }) => {
    await page.goto('/plugins')
    const enabledBadges = page.getByText('enabled')
    await expect(enabledBadges.first()).toBeVisible()
  })

  test('enable plugin calls API', async ({ page }) => {
    let enableCalled = false
    await page.route('**/api/v1/plugins/plg-002/enable', async (route) => {
      enableCalled = true
      await route.fulfill({ status: 204 })
    })
    await page.goto('/plugins')
    const githubCard = page.locator('.rounded-lg.border').filter({ hasText: 'GitHub' })
    await githubCard.getByRole('button', { name: /enable/i }).click()
    expect(enableCalled).toBe(true)
  })
})
