import { test, expect } from '@playwright/test'

// E2E credentials seeded by tundrad.e2e.toml auto_create_owner
const OWNER_EMAIL    = 'owner@example.com'
const OWNER_PASSWORD = 'correct horse battery staple'

// Setup-wizard tests run against a freshly reset state (no operators).
// The reset endpoint truncates operators, so /setup redirects automatically.
// Use `test.serial` via sequential workers (playwright.config: workers=1).

test.describe('Setup wizard — fresh install flow', () => {
  test.beforeEach(async ({ request }) => {
    // Truncate operators so needs_setup=true
    const res = await request.post('/api/v1/test/reset', { data: { reseed_owner: false } })
    expect(res.status()).toBeLessThan(300)
  })

  test('/ redirects to /setup when no operators exist', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/setup/)
  })

  test('brand panel renders feature list', async ({ page }) => {
    await page.goto('/setup')
    for (const label of ['Servers', 'Sites', 'Databases', 'Security', 'Deploys']) {
      await expect(page.getByText(label).first()).toBeVisible()
    }
  })

  test('step 1 validates required fields', async ({ page }) => {
    await page.goto('/setup')
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByText(/full name is required/i)).toBeVisible()
    await expect(page.getByText(/enter a valid email/i)).toBeVisible()
    await expect(page.getByText(/minimum 8 characters/i)).toBeVisible()
  })

  test('password strength bar appears while typing', async ({ page }) => {
    await page.goto('/setup')
    await page.getByPlaceholder('Minimum 8 characters').fill('weakpass')
    await expect(page.getByText(/fair|good|strong|weak/i)).toBeVisible()
  })

  test('confirm checkmark appears when passwords match', async ({ page }) => {
    await page.goto('/setup')
    await page.getByPlaceholder('Minimum 8 characters').fill('Correct@2026!')
    await page.getByPlaceholder('Repeat password').fill('Correct@2026!')
    // CheckIcon rendered in confirm field when passwords match
    await expect(page.locator('input[placeholder="Repeat password"] ~ *')).toBeVisible()
  })

  test('full setup flow creates owner and lands on done screen', async ({ page }) => {
    await page.goto('/setup')

    // Step 1 — account
    await page.getByLabel(/full name/i).fill('Test Owner')
    await page.getByLabel(/email address/i).fill('test@example.com')
    await page.getByPlaceholder('Minimum 8 characters').fill('Correct@2026!')
    await page.getByPlaceholder('Repeat password').fill('Correct@2026!')
    await page.getByRole('button', { name: /continue/i }).click()

    // Step 2 — configure
    await expect(page.getByRole('heading', { name: /configure your instance/i })).toBeVisible()
    await page.getByPlaceholder(/acme corp/i).fill('Test Instance')
    await expect(page.getByText('Test Instance')).toBeVisible() // sidebar preview
    await page.getByRole('button', { name: /finish setup/i }).click()

    // Done screen
    await expect(page.getByRole('heading', { name: /you're all set/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in to tundra/i })).toBeVisible()
  })

  test('already-initialized returns 409 with descriptive error', async ({ page, request }) => {
    // Seed an operator first
    await request.post('/api/v1/test/reset', { data: { reseed_owner: true } })

    await page.goto('/setup')
    await page.getByLabel(/full name/i).fill('Second Owner')
    await page.getByLabel(/email address/i).fill('second@example.com')
    await page.getByPlaceholder('Minimum 8 characters').fill('Another@2026!')
    await page.getByPlaceholder('Repeat password').fill('Another@2026!')
    await page.getByRole('button', { name: /continue/i }).click()
    await page.getByRole('button', { name: /finish setup/i }).click()

    await expect(page.getByText(/already.initialized|already set up/i)).toBeVisible()
  })
})

test.describe('Auth flows (post-setup)', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/v1/test/reset', { data: { reseed_owner: true } })
  })

  test('/ redirects to /login when operators exist', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('valid credentials navigate to dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill(OWNER_EMAIL)
    await page.getByLabel(/password/i).fill(OWNER_PASSWORD)
    await page.getByRole('button', { name: /sign in|continue/i }).click()
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByRole('heading', { name: /good (morning|afternoon|evening)/i })).toBeVisible()
  })

  test('wrong password shows error, stays on login', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill(OWNER_EMAIL)
    await page.getByLabel(/password/i).fill('wrongpassword')
    await page.getByRole('button', { name: /sign in|continue/i }).click()
    await expect(page.getByText(/invalid credentials|failed/i)).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('protected route redirects unauthenticated user', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })
})
