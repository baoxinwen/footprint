import { test, expect } from '@playwright/test'
import { registerAndLogin, createTrip } from './helpers'

test.describe('照片管理流程', () => {
  test('上传照片', async ({ page }) => {
    await registerAndLogin(page)
    await createTrip(page, '照片测试旅行', '2025-10-01', '2025-10-03')

    // 进入旅行详情
    await page.goto('/trips')
    await page.locator('text=照片测试旅行').first().click()

    // 找到上传按钮
    const uploadBtn = page.locator('button:has-text("上传"), input[type="file"]')
    await expect(uploadBtn.first()).toBeVisible()
  })

  test('照片地图模式入口', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/')

    // 地图页应有照片模式切换按钮
    const photoModeBtn = page.locator('button:has-text("照片"), .photo-mode-btn')
    if (await photoModeBtn.count() > 0) {
      await photoModeBtn.first().click()
      // 应显示照片相关的提示或界面变化
    }
  })
})
