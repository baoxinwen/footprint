import { test, expect } from '@playwright/test'
import { registerAndLogin, createTrip } from './helpers'

test.describe('统计页面', () => {
  test('空状态显示', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/stats')
    await expect(page.locator('text=记录你的第一次旅行')).toBeVisible()
  })

  test('统计页面加载', async ({ page }) => {
    await registerAndLogin(page)
    await createTrip(page, '统计测试旅行', '2025-06-01', '2025-06-03')

    await page.goto('/stats')

    // 页面应正常加载
    await expect(page.locator('h2')).toBeVisible()
  })
})
