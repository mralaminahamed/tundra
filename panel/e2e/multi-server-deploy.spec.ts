import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

const MOCK_SERVERS = {
  data: [
    {
      id: 'srv-001',
      name: 'eu-web-01',
      hostname: 'eu-web-01.example.com',
      status: 'active',
      region: 'eu-west',
      os: 'ubuntu-24.04',
      agent_last_seen_at: new Date(Date.now() - 30000).toISOString(),
      maintenance_starts_at: null,
      maintenance_ends_at: null,
      created_at: new Date().toISOString(),
    },
    {
      id: 'srv-002',
      name: 'eu-web-02',
      hostname: 'eu-web-02.example.com',
      status: 'degraded',
      region: 'eu-west',
      os: 'ubuntu-24.04',
      agent_last_seen_at: new Date(Date.now() - 120000).toISOString(),
      maintenance_starts_at: new Date(Date.now() - 3600000).toISOString(),
      maintenance_ends_at: new Date(Date.now() + 3600000).toISOString(),
      created_at: new Date().toISOString(),
    },
    {
      id: 'srv-003',
      name: 'us-db-01',
      hostname: 'us-db-01.example.com',
      status: 'offline',
      region: 'us-east',
      os: 'ubuntu-24.04',
      agent_last_seen_at: new Date(Date.now() - 86400000).toISOString(),
      maintenance_starts_at: null,
      maintenance_ends_at: null,
      created_at: new Date().toISOString(),
    },
  ],
}

const MOCK_METRICS = {
  data: [
    {
      server_id: 'srv-001',
      cpu_cores: 4,
      cpu_used_pct: 23.5,
      ram_total_mb: 8192,
      ram_used_mb: 4096,
      disk_total_gb: 100,
      disk_used_gb: 40,
      site_count: 12,
      refreshed_at: new Date(Date.now() - 60000).toISOString(),
    },
    {
      server_id: 'srv-002',
      cpu_cores: 4,
      cpu_used_pct: 88.2,
      ram_total_mb: 8192,
      ram_used_mb: 7864,
      disk_total_gb: 100,
      disk_used_gb: 95,
      site_count: 5,
      refreshed_at: new Date(Date.now() - 60000).toISOString(),
    },
  ],
}

test.describe('Multi-server fleet view', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
    await page.route('**/api/v1/servers', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SERVERS) }),
    )
    await page.route('**/api/v1/servers/metrics-state', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_METRICS) }),
    )
  })

  test('fleet health bar shows active/degraded/offline counts', async ({ page }) => {
    await page.goto('/servers')
    await expect(page.getByText('3 servers')).toBeVisible()
    await expect(page.getByText('1 active')).toBeVisible()
    await expect(page.getByText('1 degraded')).toBeVisible()
    await expect(page.getByText('1 offline')).toBeVisible()
  })

  test('servers are grouped by region', async ({ page }) => {
    await page.goto('/servers')
    await expect(page.getByText('eu-west', { exact: false })).toBeVisible()
    await expect(page.getByText('us-east', { exact: false })).toBeVisible()
    await expect(page.getByText('eu-web-01')).toBeVisible()
    await expect(page.getByText('us-db-01')).toBeVisible()
  })

  test('RAM usage percentage shown from metrics', async ({ page }) => {
    await page.goto('/servers')
    await expect(page.getByText('50%')).toBeVisible()
  })

  test('site count shown from metrics', async ({ page }) => {
    await page.goto('/servers')
    await expect(page.getByText('12')).toBeVisible()
    await expect(page.getByText('5')).toBeVisible()
  })

  test('server with no metrics shows em-dash', async ({ page }) => {
    await page.goto('/servers')
    const rows = page.locator('tbody tr')
    const thirdRow = rows.nth(2)
    await expect(thirdRow.getByText('—').first()).toBeVisible()
  })

  test('maintenance link navigates to maintenance page', async ({ page }) => {
    await page.route('**/api/v1/servers/srv-001', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SERVERS.data[0]),
      }),
    )
    await page.goto('/servers')
    await page.locator('a[href*="maintenance"]').first().click()
    await expect(page).toHaveURL(/\/servers\/srv-001\/maintenance/)
    await expect(page.getByRole('heading', { name: /maintenance window/i })).toBeVisible()
  })
})

test.describe('Maintenance window', () => {
  const SERVER = MOCK_SERVERS.data[0]

  test.beforeEach(async ({ page }) => {
    await loginAs(page)
    await page.route('**/api/v1/servers/srv-001', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SERVER) }),
    )
  })

  test('shows datetime inputs for start and end', async ({ page }) => {
    await page.goto('/servers/srv-001/maintenance')
    await expect(page.getByLabel(/starts at/i)).toBeVisible()
    await expect(page.getByLabel(/ends at/i)).toBeVisible()
  })

  test('no clear button when no active window', async ({ page }) => {
    await page.goto('/servers/srv-001/maintenance')
    await expect(page.getByRole('button', { name: /clear window/i })).not.toBeVisible()
  })

  test('clear window button visible when maintenance active', async ({ page }) => {
    const serverWithWindow = {
      ...SERVER,
      maintenance_starts_at: new Date(Date.now() - 3600000).toISOString(),
      maintenance_ends_at: new Date(Date.now() + 3600000).toISOString(),
    }
    await page.route('**/api/v1/servers/srv-001', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(serverWithWindow),
      }),
    )
    await page.goto('/servers/srv-001/maintenance')
    await expect(page.getByRole('button', { name: /clear window/i })).toBeVisible()
    await expect(page.getByText(/active maintenance window/i)).toBeVisible()
  })

  test('save window calls PATCH and shows success toast', async ({ page }) => {
    let patchBody: unknown
    await page.route('**/api/v1/servers/srv-001', async (route) => {
      if (route.request().method() === 'PATCH') {
        patchBody = JSON.parse(route.request().postData() ?? '{}') as unknown
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SERVER) })
      } else {
        await route.continue()
      }
    })

    await page.goto('/servers/srv-001/maintenance')
    await page.getByLabel(/starts at/i).fill('2026-06-01T10:00')
    await page.getByLabel(/ends at/i).fill('2026-06-01T12:00')
    await page.getByRole('button', { name: /save window/i }).click()
    await expect(page.getByText(/maintenance window updated/i)).toBeVisible()
    expect(patchBody).toMatchObject({
      maintenance_starts_at: expect.stringContaining('2026-06-01'),
      maintenance_ends_at: expect.stringContaining('2026-06-01'),
    })
  })
})

test.describe('SSH installer wizard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test('step 0 collects name and hostname', async ({ page }) => {
    await page.goto('/servers/new')
    await expect(page.getByLabel(/display name/i)).toBeVisible()
    await expect(page.getByLabel(/hostname/i)).toBeVisible()
  })

  test('step 1 fetches SSH fingerprint on next', async ({ page }) => {
    await page.route('**/api/v1/servers', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            server: { id: 'srv-new', name: 'test', hostname: 'test.example.com', status: 'pending', region: null, os: null, created_at: new Date().toISOString() },
            enrolment_command: '',
          }),
        })
      } else {
        route.continue()
      }
    })
    await page.route('**/api/v1/servers/wizard/fingerprint', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ host: 'test.example.com', fingerprint: 'SHA256:abcdef1234567890' }),
      }),
    )

    await page.goto('/servers/new')
    await page.getByLabel(/display name/i).fill('test-vps')
    await page.getByLabel(/hostname/i).fill('test.example.com')
    await page.getByRole('button', { name: /next/i }).click()

    await expect(page.getByText(/SHA256:abcdef/i)).toBeVisible()
    await expect(page.getByLabel(/ssh user/i)).toBeVisible()
  })
})
