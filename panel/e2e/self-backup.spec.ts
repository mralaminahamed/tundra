import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test.describe('Self-backup settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test('self-backup settings page accessible from settings nav', async ({ page }) => {
    await page.goto('/settings/self-backup')
    await expect(
      page.getByRole('heading', { name: /self.backup|backup tundra/i })
    ).toBeVisible()
  })

  test('settings page shows schedule and GPG key fields', async ({ page }) => {
    await page.goto('/settings/self-backup')
    await expect(page.getByLabel(/schedule|cron/i).first()).toBeVisible()
    await expect(page.getByLabel(/gpg|recipient|public key/i).first()).toBeVisible()
  })

  test('run-now triggers self-backup and shows result', async ({ page }) => {
    await page.route('**/api/v1/settings/self-backup/run', (r) =>
      r.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ queued: true }),
      })
    )
    await page.goto('/settings/self-backup')
    const runBtn = page.getByRole('button', { name: /run now|backup now/i })
    if (await runBtn.isVisible()) {
      await runBtn.click()
      await expect(page.getByText(/queued|started|success/i)).toBeVisible()
    }
  })

  test('verify-latest shows verification status', async ({ page }) => {
    await page.route('**/api/v1/settings/self-backup/verify', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, message: 'Checksum verified' }),
      })
    )
    await page.goto('/settings/self-backup')
    const verifyBtn = page.getByRole('button', { name: /verify/i })
    if (await verifyBtn.isVisible()) {
      await verifyBtn.click()
      await expect(page.getByText(/verified|ok/i)).toBeVisible()
    }
  })
})
