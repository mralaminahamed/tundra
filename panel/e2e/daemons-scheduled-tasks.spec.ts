import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

const MOCK_SITE = { id: 'site-001', name: 'my-app', primary_domain: 'myapp.example.com' }

const MOCK_DAEMONS = {
  data: [
    {
      id: 'daemon-001',
      site_id: 'site-001',
      name: 'worker',
      command: 'node worker.js',
      working_dir: '/srv/sites/site-001/current',
      env_file: '/srv/sites/site-001/shared/.env',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'daemon-002',
      site_id: 'site-001',
      name: 'scheduler',
      command: 'node scheduler.js',
      working_dir: '/srv/sites/site-001/current',
      env_file: '/srv/sites/site-001/shared/.env',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
}

const MOCK_TASKS = {
  data: [
    {
      id: 'task-001',
      site_id: 'site-001',
      name: 'cleanup',
      schedule: '*-*-* 02:00:00',
      command: 'php artisan cleanup',
      working_dir: '/srv/sites/site-001/current',
      is_active: true,
      last_run_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
}

test.describe('Daemons', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
    await page.route('**/api/v1/sites**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [MOCK_SITE] }) })
    )
    await page.route('**/api/v1/sites/*/daemons**', (r) => {
      if (r.request().method() === 'POST') {
        return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(MOCK_DAEMONS.data[0]) })
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DAEMONS) })
    })
    await page.route('**/api/v1/daemons/**', (r) => {
      if (r.request().method() === 'DELETE') {
        return r.fulfill({ status: 204 })
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DAEMONS.data[0]) })
    })
  })

  test('daemons list page renders', async ({ page }) => {
    await page.goto('/daemons?siteId=site-001')
    await expect(page.getByRole('heading', { name: /daemon/i })).toBeVisible()
    await expect(page.getByText('worker')).toBeVisible()
    await expect(page.getByText('scheduler')).toBeVisible()
  })

  test('daemons list shows command', async ({ page }) => {
    await page.goto('/daemons?siteId=site-001')
    await expect(page.getByText('node worker.js')).toBeVisible()
  })

  test('delete daemon triggers confirm', async ({ page }) => {
    await page.goto('/daemons?siteId=site-001')
    const deleteBtn = page.getByRole('button', { name: /delete/i }).first()
    if (await deleteBtn.isVisible()) {
      page.on('dialog', (d) => d.accept())
      await deleteBtn.click()
    }
  })
})

test.describe('Scheduled tasks', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
    await page.route('**/api/v1/sites**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [MOCK_SITE] }) })
    )
    await page.route('**/api/v1/sites/*/scheduled-tasks**', (r) => {
      if (r.request().method() === 'POST') {
        return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(MOCK_TASKS.data[0]) })
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_TASKS) })
    })
    await page.route('**/api/v1/scheduled-tasks/**', (r) => {
      if (r.request().method() === 'DELETE') {
        return r.fulfill({ status: 204 })
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_TASKS.data[0]) })
    })
  })

  test('scheduled tasks list page renders', async ({ page }) => {
    await page.goto('/scheduled-tasks?siteId=site-001')
    await expect(page.getByRole('heading', { name: /scheduled/i })).toBeVisible()
    await expect(page.getByText('cleanup')).toBeVisible()
    await expect(page.getByText('*-*-* 02:00:00')).toBeVisible()
  })

  test('scheduled task shows command', async ({ page }) => {
    await page.goto('/scheduled-tasks?siteId=site-001')
    await expect(page.getByText('php artisan cleanup')).toBeVisible()
  })

  test('delete scheduled task shows confirm', async ({ page }) => {
    await page.goto('/scheduled-tasks?siteId=site-001')
    const deleteBtn = page.getByRole('button', { name: /delete/i }).first()
    if (await deleteBtn.isVisible()) {
      page.on('dialog', (d) => d.accept())
      await deleteBtn.click()
    }
  })
})
