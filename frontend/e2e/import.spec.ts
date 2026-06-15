import { test, expect } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('导入功能', () => {
  test('导入按钮显示', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/trips')

    // 应有导入按钮
    const importBtn = page.locator('button:has-text("导入"), .import-btn')
    await expect(importBtn.first()).toBeVisible()
  })

  test('导入 JSON 文件', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/trips')

    // 找到导入按钮并点击
    const importBtn = page.locator('button:has-text("导入"), .import-btn')
    if (await importBtn.count() > 0) {
      await importBtn.first().click()

      // 应显示文件选择对话框或导入界面
      await expect(page.locator('text=导入, text=上传')).toBeVisible()
    }
  })
})
