import { test, expect } from '@playwright/test'
import { registerAndLogin, createTrip } from './helpers'

test.describe('统计页面', () => {
  test('空状态显示', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/stats')
    await expect(page.locator('text=记录你的第一次旅行')).toBeVisible()
  })

  test('有数据时显示统计', async ({ page }) => {
    await registerAndLogin(page)
    await createTrip(page, '统计测试旅行', '2025-06-01', '2025-06-03')

    await page.goto('/stats')

    // 应显示统计卡片
    await expect(page.locator('text=旅行次数, text=到访城市')).toBeVisible()
  })

  test('年度统计显示', async ({ page }) => {
    await registerAndLogin(page)
    await createTrip(page, '年度测试', '2025-08-01', '2025-08-03')

    await page.goto('/stats')

    // 应有年度统计区域
    await expect(page.locator('text=年度统计, text=年度')).toBeVisible()
  })

  test('城市排行显示', async ({ page }) => {
    await registerAndLogin(page)
    await createTrip(page, '城市排行测试', '2025-09-01', '2025-09-03')

    await page.goto('/stats')

    // 应有城市排行区域
    await expect(page.locator('text=城市排行, text=到访城市')).toBeVisible()
  })
})
