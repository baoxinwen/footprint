import { test, expect } from '@playwright/test'
import { registerAndLogin, createTrip } from './helpers'

test.describe('照片管理流程', () => {
  test('旅行详情页加载', async ({ page }) => {
    await registerAndLogin(page)
    await createTrip(page, '照片测试旅行', '2025-10-01', '2025-10-03')

    // 进入旅行详情
    await page.goto('/trips')
    await page.locator('text=照片测试旅行').first().click()

    // 详情页应正常加载
    await expect(page.locator('text=照片测试旅行')).toBeVisible()
  })

  test('地图页加载', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/')

    // 地图容器应存在
    await expect(page.locator('#map-container')).toBeVisible()
  })
})
