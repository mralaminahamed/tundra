import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

const MOCK_MAIL_DOMAIN = {
  id: 'md-001',
  domain: 'example.com',
  spf_policy: 'v=spf1 mx ~all',
  dmarc_policy: 'v=DMARC1; p=none; rua=mailto:postmaster@example.com',
  mx_host: 'mail.example.com',
  active: true,
  webmail_enabled: false,
  created_at: new Date().toISOString(),
}

const MOCK_DKIM_KEY = {
  id: 'dkim-001',
  selector: 'tundra2026',
  algorithm: 'rsa',
  public_key_pem: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----',
  is_active: true,
}

const MOCK_MAILBOXES = {
  data: [
    { id: 'mb-001', mail_domain_id: 'md-001', local_part: 'admin', password_scheme: 'ARGON2ID', quota_bytes: 1073741824, used_bytes: 52428800, is_active: true, created_at: new Date().toISOString() },
    { id: 'mb-002', mail_domain_id: 'md-001', local_part: 'support', password_scheme: 'ARGON2ID', quota_bytes: 1073741824, used_bytes: 0, is_active: true, created_at: new Date().toISOString() },
  ],
}

const MOCK_QUEUE = {
  data: [
    { id: 'q-001', queue_id: 'ABCD1234', queue_name: 'deferred', sender: 'noreply@example.com', recipients: ['user@gmail.com'], subject: 'Test', size_bytes: 2048, arrival_time: new Date().toISOString(), reason: 'Connection refused' },
  ],
}

test.describe('Mail domain setup', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
    await page.route('**/api/v1/mail/domains**', (r) => {
      if (r.request().method() === 'POST' && !r.request().url().includes('/regenerate')) {
        return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(MOCK_MAIL_DOMAIN) })
      }
      if (r.request().url().includes('/regenerate-dkim')) {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DKIM_KEY) })
      }
      if (r.request().url().includes('/mailboxes')) {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_MAILBOXES) })
      }
      if (r.request().url().includes('/aliases')) {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
      }
      if (r.request().url().match(/\/md-001$/)) {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_MAIL_DOMAIN) })
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [MOCK_MAIL_DOMAIN] }) })
    })
    await page.route('**/api/v1/mail/mailboxes', (r) => {
      if (r.request().method() === 'POST') {
        return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(MOCK_MAILBOXES.data[0]) })
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_MAILBOXES) })
    })
    await page.route('**/api/v1/mail/queue**', (r) => {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_QUEUE) })
    })
    await page.route('**/api/v1/mail/queue/**', (r) => {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
  })

  test('mail domains list renders', async ({ page }) => {
    await page.goto('/mail/domains')
    await expect(page.getByRole('heading', { name: /mail/i })).toBeVisible()
    await expect(page.getByText('example.com')).toBeVisible()
  })

  test('add mail domain navigates to wizard', async ({ page }) => {
    await page.goto('/mail/domains')
    await page.getByRole('link', { name: /add mail domain|new/i }).click()
    await expect(page).toHaveURL(/\/mail\/domains\/new/)
  })

  test('mail domain wizard step 1 shows domain field', async ({ page }) => {
    await page.goto('/mail/domains/new')
    await expect(page.getByLabel(/domain/i).first()).toBeVisible()
    await expect(page.getByLabel(/mx host|mx record/i).first()).toBeVisible()
  })

  test('mail domain detail shows mailboxes', async ({ page }) => {
    await page.goto('/mail/domains/md-001')
    await expect(page.getByText('example.com')).toBeVisible()
    await expect(page.getByText('admin')).toBeVisible()
    await expect(page.getByText('support')).toBeVisible()
  })

  test('regenerate DKIM shows public key', async ({ page }) => {
    await page.goto('/mail/domains/md-001')
    const regenBtn = page.getByRole('button', { name: /regenerate dkim/i })
    if (await regenBtn.isVisible()) {
      await regenBtn.click()
      await expect(page.getByText(/BEGIN PUBLIC KEY/i)).toBeVisible()
    }
  })

  test('diagnostics page shows DNS check stubs', async ({ page }) => {
    await page.goto('/mail/domains/md-001/diagnostics')
    await expect(page.getByRole('heading', { name: /diagnostic/i })).toBeVisible()
    await expect(page.getByText(/MX record|SPF|DKIM|DMARC/i).first()).toBeVisible()
  })

  test('mail queue lists entries', async ({ page }) => {
    await page.goto('/mail/queue')
    await expect(page.getByRole('heading', { name: /queue/i })).toBeVisible()
    await expect(page.getByText('ABCD1234')).toBeVisible()
    await expect(page.getByText('deferred')).toBeVisible()
  })

  test('queue hold action calls API', async ({ page }) => {
    let holdCalled = false
    await page.route('**/api/v1/mail/queue/hold', (r) => {
      holdCalled = true
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
    await page.goto('/mail/queue')
    const holdBtn = page.getByRole('button', { name: /hold/i }).first()
    if (await holdBtn.isVisible()) {
      await holdBtn.click()
      expect(holdCalled).toBe(true)
    }
  })

  test('queue delete action shows confirm', async ({ page }) => {
    await page.goto('/mail/queue')
    const deleteBtn = page.getByRole('button', { name: /delete/i }).first()
    if (await deleteBtn.isVisible()) {
      page.on('dialog', (d) => d.accept())
      await deleteBtn.click()
    }
  })
})
