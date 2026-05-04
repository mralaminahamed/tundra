import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

const MOCK_TEMPLATES = {
  data: [
    {
      id: 'nextjs',
      name: 'Next.js',
      description: 'Next.js 15 React framework with SSR.',
      version: '1.0.0',
      runtime: { kind: 'nodejs', version: '22' },
      source: { kind: 'skeleton' },
      build_command: 'npm run build',
      start_command: 'node .next/standalone/server.js',
      listen_port: 3000,
      env: { NODE_ENV: 'production' },
      post_create: ['npm install', 'npm run build'],
      tags: ['nodejs', 'react', 'ssr'],
      icon: 'nextjs',
    },
    {
      id: 'django',
      name: 'Django',
      description: 'Django 5.x Python web framework.',
      version: '1.0.0',
      runtime: { kind: 'python', version: '3.13' },
      source: { kind: 'skeleton' },
      build_command: 'pip install -r requirements.txt',
      start_command: 'gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 2',
      listen_port: 8000,
      env: {},
      post_create: ['pip install -r requirements.txt'],
      tags: ['python', 'django', 'web'],
      icon: 'django',
    },
    {
      id: 'static',
      name: 'Static Site',
      description: 'Plain HTML/CSS/JS — no build step required.',
      version: '1.0.0',
      runtime: { kind: 'static', version: '' },
      source: { kind: 'skeleton' },
      build_command: null,
      start_command: null,
      listen_port: null,
      env: {},
      post_create: [],
      tags: ['html', 'css', 'static'],
      icon: 'static',
    },
  ],
}

test.describe('Templates gallery', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
    await page.route('**/api/v1/templates**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_TEMPLATES),
      }),
    )
  })

  test('templates page loads and shows all template cards', async ({ page }) => {
    await page.goto('/templates')
    await expect(page.getByRole('heading', { name: /templates/i })).toBeVisible()
    await expect(page.getByText('Next.js')).toBeVisible()
    await expect(page.getByText('Django')).toBeVisible()
    await expect(page.getByText('Static Site')).toBeVisible()
  })

  test('search box filters templates by name', async ({ page }) => {
    await page.goto('/templates')
    await page.getByRole('searchbox', { name: /search templates/i }).fill('django')
    await expect(page.getByText('Django')).toBeVisible()
    await expect(page.getByText('Next.js')).not.toBeVisible()
    await expect(page.getByText('Static Site')).not.toBeVisible()
  })

  test('search box filters templates by tag', async ({ page }) => {
    await page.goto('/templates')
    await page.getByRole('searchbox', { name: /search templates/i }).fill('python')
    await expect(page.getByText('Django')).toBeVisible()
    await expect(page.getByText('Next.js')).not.toBeVisible()
  })

  test('empty search shows all templates', async ({ page }) => {
    await page.goto('/templates')
    const searchbox = page.getByRole('searchbox', { name: /search templates/i })
    await searchbox.fill('xyz-no-match')
    await expect(page.getByText(/no templates match/i)).toBeVisible()
    await searchbox.clear()
    await expect(page.getByText('Next.js')).toBeVisible()
  })

  test('"Use this template" navigates to /sites/new with template param', async ({ page }) => {
    await page.goto('/templates')
    // Click the "Use this template" button for Next.js
    const nextjsCard = page.locator('div').filter({ hasText: /^NE/ }).first()
    await page.getByText('Next.js').waitFor()

    // Find the button within the Next.js card section
    const buttons = page.getByRole('button', { name: /use this template/i })
    await buttons.first().click()

    await expect(page).toHaveURL(/\/sites\/new\?template=nextjs/)
  })
})
