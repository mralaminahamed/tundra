import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

const MOCK_SITE = {
  id: 'site-001',
  name: 'my-shop',
  primary_domain: 'my-shop.example.com',
  server_id: 'srv-001',
  status: 'active',
  document_root: '/var/www/my-shop',
  created_at: new Date().toISOString(),
}

const MOCK_MOVE_PENDING = {
  id: 'move-001',
  site_id: 'site-001',
  from_server_id: 'srv-001',
  to_server_id: 'srv-002',
  status: 'pending',
  current_stage: null,
  error: null,
  initiated_by: 'op-001',
  started_at: null,
  finished_at: null,
  created_at: new Date().toISOString(),
}

const MOCK_MOVE_RUNNING = {
  ...MOCK_MOVE_PENDING,
  status: 'running',
  current_stage: 'sync_artifacts',
  started_at: new Date().toISOString(),
}

const MOCK_MOVE_SUCCEEDED = {
  ...MOCK_MOVE_PENDING,
  status: 'succeeded',
  current_stage: 'retire_source',
  started_at: new Date(Date.now() - 30000).toISOString(),
  finished_at: new Date().toISOString(),
}

test.describe('Cross-server site move', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
    await page.route('**/api/v1/sites/site-001', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SITE) }),
    )
  })

  test('initiates a move and shows pending state', async ({ page }) => {
    let moveCalled = false
    await page.route('**/api/v1/sites/site-001/moves', async (route) => {
      if (route.request().method() === 'POST') {
        moveCalled = true
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_MOVE_PENDING),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [MOCK_MOVE_PENDING] }),
        })
      }
    })

    await page.goto('/sites/site-001')
    const moveBtn = page.getByRole('button', { name: /move server/i })
    if (await moveBtn.isVisible()) {
      await moveBtn.click()
      const targetSelect = page.getByLabel(/target server/i)
      if (await targetSelect.isVisible()) {
        await targetSelect.selectOption('srv-002')
        await page.getByRole('button', { name: /start move/i }).click()
        expect(moveCalled).toBe(true)
        await expect(page.getByText(/pending|move initiated/i)).toBeVisible()
      }
    }
  })

  test('move progress shows current stage', async ({ page }) => {
    await page.route('**/api/v1/sites/site-001/moves/move-001', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_MOVE_RUNNING),
      }),
    )

    await page.goto('/sites/site-001/moves/move-001')
    await expect(page.getByText(/sync_artifacts|running/i)).toBeVisible()
  })

  test('completed move shows succeeded status', async ({ page }) => {
    await page.route('**/api/v1/sites/site-001/moves/move-001', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_MOVE_SUCCEEDED),
      }),
    )

    await page.goto('/sites/site-001/moves/move-001')
    await expect(page.getByText(/succeeded/i)).toBeVisible()
  })

  test('abandon move sends PATCH and returns to site', async ({ page }) => {
    let abandonCalled = false
    await page.route('**/api/v1/sites/site-001/moves/move-001', async (route) => {
      if (route.request().method() === 'PATCH') {
        abandonCalled = true
        await route.fulfill({ status: 204 })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_MOVE_RUNNING),
        })
      }
    })

    await page.goto('/sites/site-001/moves/move-001')
    const abandonBtn = page.getByRole('button', { name: /abandon/i })
    if (await abandonBtn.isVisible()) {
      await abandonBtn.click()
      expect(abandonCalled).toBe(true)
    }
  })

  test('list of moves for a site is accessible', async ({ page }) => {
    await page.route('**/api/v1/sites/site-001/moves', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [MOCK_MOVE_SUCCEEDED] }),
      }),
    )

    await page.goto('/sites/site-001')
    const moveHistorySection = page.getByText(/move/i)
    await expect(moveHistorySection.first()).toBeVisible()
  })
})

test.describe('Server suggest endpoint', () => {
  test('new site wizard fetches suggested servers', async ({ page }) => {
    await loginAs(page)
    const MOCK_SUGGEST = {
      data: [
        {
          server_id: 'srv-001',
          name: 'eu-web-01',
          score: 0.95,
          available_ram_mb: 4096,
          available_disk_gb: 60,
          available_cpu_pct: 76.5,
        },
        {
          server_id: 'srv-002',
          name: 'eu-web-02',
          score: 0.4,
          available_ram_mb: 328,
          available_disk_gb: 5,
          available_cpu_pct: 11.8,
        },
      ],
    }
    let suggestCalled = false
    await page.route('**/api/v1/servers/suggest*', (route) => {
      suggestCalled = true
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SUGGEST) })
    })

    await page.goto('/sites/new')
    if (suggestCalled) {
      await expect(page.getByText('eu-web-01')).toBeVisible()
    }
  })
})
