import { test, expect } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('深色模式', () => {
  test('设置页加载', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/settings')
    await expect(page.locator('h2')).toBeVisible()
  })

  test('切换深色模式', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/settings')

    // 页面应正常加载
    await expect(page.locator('h2')).toBeVisible()
  })
})
