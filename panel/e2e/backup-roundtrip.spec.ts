import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

const MOCK_TARGET = {
  id: 'tgt-001',
  name: 'my-s3-target',
  kind: 's3',
  config: { bucket: 'tundra-backups', prefix: 'prod' },
  is_default: true,
  created_at: new Date().toISOString(),
}

const MOCK_JOB = {
  id: 'job-001',
  name: 'daily-site-backup',
  scope_kind: 'site',
  scope_id: 'site-001',
  target_id: 'tgt-001',
  schedule_cron: '0 2 * * *',
  retention_policy: { keep_daily: 30 },
  is_active: true,
  last_run_at: new Date(Date.now() - 86400000).toISOString(),
  last_status: 'succeeded',
  next_run_at: new Date(Date.now() + 3600000).toISOString(),
  created_at: new Date().toISOString(),
}

const MOCK_SNAPSHOT = {
  id: 'snap-001',
  job_id: 'job-001',
  snapshot_id: 'abc123def456',
  size_bytes: 1048576,
  status: 'succeeded',
  duration_ms: 4200,
  created_at: new Date().toISOString(),
}

const MOCK_RESTORE_PREVIEW = {
  restore_id: 'rst-001',
  preview: {
    snapshot_id: 'abc123def456',
    size_bytes: 1048576,
    job_id: 'job-001',
    created_at: new Date().toISOString(),
  },
  expires_at: new Date(Date.now() + 600000).toISOString(),
}

test.describe('Backup round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
    await page.route('**/api/v1/backups/targets**', (r) => {
      if (r.request().method() === 'POST' && !r.request().url().includes('/test')) {
        return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(MOCK_TARGET) })
      }
      if (r.request().url().includes('/test')) {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [MOCK_TARGET] }) })
    })
    await page.route('**/api/v1/backups/jobs**', (r) => {
      if (r.request().method() === 'POST' && !r.request().url().includes('/run')) {
        return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(MOCK_JOB) })
      }
      if (r.request().url().includes('/run')) {
        return r.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ queued: true, job_id: 'job-001' }) })
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [MOCK_JOB] }) })
    })
    await page.route('**/api/v1/backups/snapshots**', (r) => {
      if (r.request().url().includes('/restore')) {
        return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(MOCK_RESTORE_PREVIEW) })
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [MOCK_SNAPSHOT] }) })
    })
    await page.route('**/api/v1/backups/restores/rst-001/confirm', (r) =>
      r.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ restore_id: 'rst-001', status: 'confirmed' }) })
    )
  })

  test('backup targets list renders', async ({ page }) => {
    await page.goto('/backups/targets')
    await expect(page.getByRole('heading', { name: /backup targets/i })).toBeVisible()
    await expect(page.getByText('my-s3-target')).toBeVisible()
  })

  test('create target navigates to form', async ({ page }) => {
    await page.goto('/backups/targets')
    await page.getByRole('link', { name: /add target|new target/i }).click()
    await expect(page).toHaveURL(/\/backups\/targets\/new/)
  })

  test('backup jobs list renders with last-status badge', async ({ page }) => {
    await page.goto('/backups/jobs')
    await expect(page.getByRole('heading', { name: /backup jobs/i })).toBeVisible()
    await expect(page.getByText('daily-site-backup')).toBeVisible()
    await expect(page.getByText('succeeded')).toBeVisible()
  })

  test('run-now triggers dispatch and shows toast', async ({ page }) => {
    await page.goto('/backups/jobs')
    await page.getByRole('button', { name: /run now/i }).first().click()
    await expect(page.getByText(/queued|dispatched|success/i)).toBeVisible()
  })

  test('snapshots list renders with size and status', async ({ page }) => {
    await page.goto('/backups/snapshots')
    await expect(page.getByRole('heading', { name: /snapshots/i })).toBeVisible()
    await expect(page.getByText('abc123def456').first()).toBeVisible()
    await expect(page.getByText('succeeded')).toBeVisible()
  })

  test('restore preview dialog opens on restore click', async ({ page }) => {
    await page.goto('/backups/snapshots')
    await page.getByRole('button', { name: /restore/i }).first().click()
    // Preview dialog should open
    await expect(page.getByText(/preview|confirm restore/i)).toBeVisible()
    await expect(page.getByText('abc123def456')).toBeVisible()
  })

  test('confirm restore calls API and shows success', async ({ page }) => {
    await page.goto('/backups/snapshots')
    await page.getByRole('button', { name: /restore/i }).first().click()
    await expect(page.getByText(/confirm/i)).toBeVisible()
    await page.getByRole('button', { name: /confirm restore/i }).click()
    await expect(page.getByText(/confirmed|success|queued/i)).toBeVisible()
  })
})
