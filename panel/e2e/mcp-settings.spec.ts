import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test.describe('MCP Settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test('MCP settings page loads', async ({ page }) => {
    await page.goto('/settings/mcp')
    await expect(page.getByRole('heading', { name: /AI Agents/i })).toBeVisible()
  })

  test('shows HTTP endpoint info', async ({ page }) => {
    await page.goto('/settings/mcp')
    await expect(page.getByText('/mcp')).toBeVisible()
  })

  test('shows quick connect sections', async ({ page }) => {
    await page.goto('/settings/mcp')
    await expect(page.getByText('Claude Desktop')).toBeVisible()
    await expect(page.getByText('Claude Code')).toBeVisible()
  })
})
