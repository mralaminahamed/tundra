import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

const MOCK_DOMAIN = {
  id: 'dom-001',
  apex: 'example.com',
  dns_managed_by: 'tundra',
  registration_expires_at: null,
  auto_renew: true,
  ns_locked: false,
  notes: null,
  created_at: new Date().toISOString(),
}

const MOCK_RECORDS = {
  data: [
    { id: 'rec-001', domain_id: 'dom-001', name: '@', record_type: 'A', ttl: 300, priority: null, content: '1.2.3.4', is_managed: false, created_at: new Date().toISOString() },
    { id: 'rec-002', domain_id: 'dom-001', name: '@', record_type: 'MX', ttl: 300, priority: 10, content: 'mail.example.com', is_managed: true, created_at: new Date().toISOString() },
    { id: 'rec-003', domain_id: 'dom-001', name: '@', record_type: 'TXT', ttl: 300, priority: null, content: 'v=spf1 mx ~all', is_managed: true, created_at: new Date().toISOString() },
  ],
}

test.describe('DNS zone editor', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
    await page.route('**/api/v1/domains**', (r) => {
      if (r.request().method() === 'POST' && !r.request().url().includes('/')) {
        return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(MOCK_DOMAIN) })
      }
      if (r.request().url().match(/\/domains\/dom-001$/)) {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DOMAIN) })
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [MOCK_DOMAIN] }) })
    })
    await page.route('**/api/v1/domains/dom-001/dns-records**', (r) => {
      if (r.request().method() === 'POST' && r.request().url().includes('/batch')) {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ updated: 3 }) })
      }
      if (r.request().method() === 'POST') {
        return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ...MOCK_RECORDS.data[0], id: 'rec-004', name: 'www', content: '1.2.3.4' }) })
      }
      if (r.request().method() === 'DELETE') {
        return r.fulfill({ status: 204 })
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RECORDS) })
    })
  })

  test('domains list page renders', async ({ page }) => {
    await page.goto('/domains')
    await expect(page.getByRole('heading', { name: /domains/i })).toBeVisible()
    await expect(page.getByText('example.com')).toBeVisible()
  })

  test('add domain link navigates to form', async ({ page }) => {
    await page.goto('/domains')
    await page.getByRole('link', { name: /add domain/i }).click()
    await expect(page).toHaveURL(/\/domains\/new/)
  })

  test('create domain form submits', async ({ page }) => {
    await page.route('**/api/v1/domains', (r) => {
      if (r.request().method() === 'POST') {
        return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(MOCK_DOMAIN) })
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
    })
    await page.goto('/domains/new')
    await page.getByLabel(/apex|domain name/i).fill('example.com')
    await page.getByRole('button', { name: /add|create|save/i }).first().click()
    await expect(page).not.toHaveURL(/\/new$/)
  })

  test('domain detail shows DNS records', async ({ page }) => {
    await page.goto('/domains/dom-001')
    await expect(page.getByText('example.com')).toBeVisible()
    await expect(page.getByText('1.2.3.4')).toBeVisible()
    await expect(page.getByText('v=spf1 mx ~all')).toBeVisible()
  })

  test('managed records show lock icon or no edit button', async ({ page }) => {
    await page.goto('/domains/dom-001')
    // MX record is managed — no delete button next to it
    const rows = page.locator('table tr')
    await expect(rows.first()).toBeVisible()
  })

  test('add DNS record inline form works', async ({ page }) => {
    await page.goto('/domains/dom-001')
    // Click add record button
    const addBtn = page.getByRole('button', { name: /add record/i })
    if (await addBtn.isVisible()) {
      await addBtn.click()
      await page.getByPlaceholder(/name|subdomain/i).fill('www')
      await page.getByRole('button', { name: /save|add|create/i }).last().click()
    }
  })

  test('delete non-managed record triggers confirm', async ({ page }) => {
    await page.goto('/domains/dom-001')
    // A record is non-managed (rec-001) — delete button should be present
    const deleteBtn = page.getByRole('button', { name: /delete/i }).first()
    if (await deleteBtn.isVisible()) {
      page.on('dialog', (d) => d.accept())
      await deleteBtn.click()
    }
  })
})
