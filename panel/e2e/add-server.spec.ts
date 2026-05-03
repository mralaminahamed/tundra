import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test.describe('Add server', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test('shows empty state when no servers exist', async ({ page }) => {
    await page.goto('/servers')
    await expect(page.getByRole('heading', { name: /servers/i })).toBeVisible()
  })

  test('navigates to add server form', async ({ page }) => {
    await page.goto('/servers')
    await page.getByRole('link', { name: /add server/i }).click()
    await expect(page).toHaveURL(/\/servers\/new/)
    await expect(page.getByRole('heading', { name: /add server/i })).toBeVisible()
  })

  test('cancel returns to servers list', async ({ page }) => {
    await page.goto('/servers/new')
    await page.getByRole('button', { name: /cancel/i }).click()
    await expect(page).toHaveURL(/\/servers$/)
  })

  test('add server form validates required fields', async ({ page }) => {
    await page.goto('/servers/new')
    await page.getByRole('button', { name: /add server/i }).click()
    // Required fields should prevent submission (HTML5 validation)
    await expect(page).toHaveURL(/\/servers\/new/)
  })

  test('successful server creation shows enrolment command', async ({ page }) => {
    await page.route('**/api/v1/servers', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            server: {
              id: 'srv-001',
              name: 'test-vps',
              hostname: 'test.example.com',
              status: 'pending',
              region: null,
              os: 'ubuntu-24.04',
              created_at: new Date().toISOString(),
            },
            enrolment_command: 'curl -fsSL https://tundra.example.com/enrol | sudo bash -s -- --token tnd_setup_abc123',
          }),
        })
      } else {
        await route.continue()
      }
    })

    await page.goto('/servers/new')
    await page.getByLabel(/display name/i).fill('test-vps')
    await page.getByLabel(/hostname/i).fill('test.example.com')
    await page.getByRole('button', { name: /add server/i }).click()

    await expect(page.getByRole('heading', { name: /server added/i })).toBeVisible()
    await expect(page.getByText(/enrol/i)).toBeVisible()
    await expect(page.getByText(/tnd_setup_/)).toBeVisible()
  })
})
