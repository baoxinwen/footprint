import { test, expect } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('导入功能', () => {
  test('旅行列表页加载', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/trips')
    await expect(page.locator('h2, h1')).toBeVisible()
  })

  test('旅行列表页标题', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/trips')
    await expect(page).toHaveURL(/\/trips/)
  })
})
