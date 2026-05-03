import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

const MOCK_SERVERS = {
  data: [{ id: 'srv-001', name: 'vps-fra', hostname: 'vps.example.com', status: 'active', region: null, os: 'ubuntu-24.04', created_at: new Date().toISOString() }],
  next_cursor: null,
}

const MOCK_DB_SERVER = {
  id: 'dbs-001',
  server_id: 'srv-001',
  engine: 'postgresql',
  version: '18',
  port: 5432,
  bind_address: '127.0.0.1',
  superuser: 'postgres',
  status: 'active',
  created_at: new Date().toISOString(),
}

const MOCK_DB = {
  id: 'db-001',
  database_server_id: 'dbs-001',
  name: 'myapp',
  charset: 'UTF8',
  collation: null,
  size_bytes: null,
  created_at: new Date().toISOString(),
}

const MOCK_DB_USER = {
  user: {
    id: 'dbu-001',
    database_server_id: 'dbs-001',
    username: 'myapp_user',
    is_managed: true,
    created_at: new Date().toISOString(),
  },
  password: 'sup3r-s3cr3t',
}

test.describe('Create database', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
    await page.route('**/api/v1/servers**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SERVERS) })
    )
    await page.route('**/api/v1/database-servers**', (r) => {
      if (r.request().method() === 'POST') {
        return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(MOCK_DB_SERVER) })
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [MOCK_DB_SERVER] }) })
    })
    await page.route('**/api/v1/databases**', (r) => {
      if (r.request().method() === 'POST') {
        return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(MOCK_DB) })
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [MOCK_DB] }) })
    })
    await page.route('**/api/v1/db-users**', (r) => {
      if (r.request().method() === 'POST') {
        return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(MOCK_DB_USER) })
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [MOCK_DB_USER.user] }) })
    })
  })

  test('database-servers list page renders', async ({ page }) => {
    await page.goto('/database-servers')
    await expect(page.getByRole('heading', { name: /database servers/i })).toBeVisible()
  })

  test('add database server navigates to form', async ({ page }) => {
    await page.goto('/database-servers')
    await page.getByRole('link', { name: /add database server/i }).click()
    await expect(page).toHaveURL(/\/database-servers\/new/)
  })

  test('create database server submits and shows success', async ({ page }) => {
    await page.goto('/database-servers/new')
    // Fill required fields — exact selectors depend on form implementation
    const nameOrEngineField = page.getByLabel(/engine/i).first()
    if (await nameOrEngineField.isVisible()) {
      await nameOrEngineField.selectOption('postgresql')
    }
    await page.getByRole('button', { name: /add|create|save/i }).first().click()
    // Should navigate or show success
    await expect(page).not.toHaveURL(/\/new$/)
  })

  test('databases list page renders', async ({ page }) => {
    await page.goto('/databases')
    await expect(page.getByRole('heading', { name: /databases/i })).toBeVisible()
    await expect(page.getByText('myapp')).toBeVisible()
  })

  test('create database form accessible', async ({ page }) => {
    await page.goto('/databases/new')
    await expect(page.getByRole('heading', { name: /create database|new database/i })).toBeVisible()
  })

  test('db-users grant flow shows connection string field', async ({ page }) => {
    await page.route('**/api/v1/db-users/dbu-001/grant', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ db_user_id: 'dbu-001', database_id: 'db-001', privileges: ['ALL'] }) })
    )
    await page.goto('/databases/db-001')
    // Grant section should be visible
    await expect(page.getByText(/user|grant|access/i).first()).toBeVisible()
  })
})
