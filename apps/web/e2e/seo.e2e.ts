import { expect, test } from '@playwright/test'
import { routes } from './routes.ts'

for (const route of routes) {
  test.describe(`${route.name} (${route.path})`, () => {
    test('has a unique meta description of 50 to 160 characters', async ({ page }) => {
      await page.goto(route.path)
      await page.getByRole('heading', { level: 1 }).waitFor()

      const descriptions = page.locator('meta[name="description"]')
      await expect(descriptions).toHaveCount(1)
      const content = (await descriptions.getAttribute('content')) ?? ''
      expect(content.length, `"${content}"`).toBeGreaterThanOrEqual(50)
      expect(content.length, `"${content}"`).toBeLessThanOrEqual(160)
    })
  })
}

// Without these files the SPA fallback answers with index.html, which crawlers and
// agents read as an invalid robots.txt / llms.txt.
for (const file of ['/robots.txt', '/llms.txt']) {
  test(`serves ${file} as plain text`, async ({ request }) => {
    const response = await request.get(file)

    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toContain('text/plain')
    expect(await response.text()).not.toContain('<!doctype html>')
  })
}
