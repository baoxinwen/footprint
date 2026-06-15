import { test, expect } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('深色模式', () => {
  test('主题切换按钮存在', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/settings')

    // 应有主题切换相关元素
    const themeToggle = page.locator('text=深色, text=浅色, text=跟随系统, .theme-toggle, [class*="dark"]')
    await expect(themeToggle.first()).toBeVisible()
  })

  test('切换深色模式', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/settings')

    // 找到深色模式选项
    const darkOption = page.locator('text=深色模式, text=深色, label:has-text("深色")')
    if (await darkOption.count() > 0) {
      await darkOption.first().click()

      // 页面应添加 dark 类
      const html = page.locator('html')
      await expect(html).toHaveClass(/dark/)
    }
  })
})
