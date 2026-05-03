import { Page } from '@playwright/test'

export async function loginAs(page: Page, email = 'admin@example.com', password = 'Test1234!') {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/dashboard/)
}
