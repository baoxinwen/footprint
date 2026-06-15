import { test, expect } from '@playwright/test'
import { registerAndLogin, createTrip } from './helpers'

test.describe('时间线页面', () => {
  test('空状态显示', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/timeline')
    await expect(page.locator('text=还没有旅行记录')).toBeVisible()
  })

  test('有数据时显示时间线', async ({ page }) => {
    await registerAndLogin(page)
    await createTrip(page, '时间线测试旅行', '2025-05-01', '2025-05-03')

    await page.goto('/timeline')

    // 应显示旅行卡片
    await expect(page.locator('text=时间线测试旅行')).toBeVisible()
  })

  test('时间线按年月分组', async ({ page }) => {
    await registerAndLogin(page)
    await createTrip(page, '分组测试A', '2025-01-01', '2025-01-03')
    await createTrip(page, '分组测试B', '2025-06-01', '2025-06-03')

    await page.goto('/timeline')

    // 应显示年份标题
    await expect(page.locator('text=2025')).toBeVisible()
  })
})
