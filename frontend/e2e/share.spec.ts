import { test, expect } from '@playwright/test'
import { registerAndLogin, createTrip } from './helpers'

test.describe('分享功能', () => {
  test('分享旅行生成链接', async ({ page }) => {
    await registerAndLogin(page)
    await createTrip(page, '分享测试旅行', '2025-12-01', '2025-12-03')

    await page.goto('/trips')
    await page.getByRole('button', { name: '查看旅行：分享测试旅行' }).click()

    // 点击分享按钮
    await page.locator('button:has-text("分享")').click()

    // 铁律 10：复制成功走按钮内对勾反馈（aria-label 切换），不弹 toast
    await expect(page.locator('button[aria-label="分享链接已复制"]')).toBeVisible()
  })

  test('访问无效分享链接显示错误', async ({ page }) => {
    await page.goto('/share/invalid-token-12345')
    await expect(page.getByText('分享链接不存在或已失效')).toBeVisible()
  })

  test('分享过期页显示提示和返回按钮', async ({ page }) => {
    await page.goto('/share/expired')
    await expect(page.getByText('该分享链接已过期')).toBeVisible()
    await expect(page.getByText('返回首页')).toBeVisible()
  })

  test('分享过期页返回首页按钮', async ({ page }) => {
    await page.goto('/share/expired')
    await page.getByText('返回首页').click()
    // 未登录应跳转到登录页
    await expect(page).toHaveURL(/\/login/)
  })
})
