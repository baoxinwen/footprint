import { test, expect } from '@playwright/test'

async function registerAndLogin(page: any): Promise<string> {
  const username = `e2euser_${Date.now()}`
  await page.goto('/login')
  await page.locator('.tab-btn', { hasText: '注册' }).click()
  await page.fill('input[placeholder*="3-50个字符"]', username)
  await page.fill('input[placeholder="至少6位"]', 'Test@123456')
  await page.fill('input[placeholder="再次输入密码"]', 'Test@123456')
  await page.locator('.submit-btn').click()
  await expect(page.locator('.el-message')).toContainText('注册成功')

  await page.locator('.tab-btn', { hasText: '登录' }).click()
  await page.fill('input[placeholder="请输入用户名"]', username)
  await page.fill('input[placeholder="请输入密码"]', 'Test@123456')
  await page.locator('.submit-btn').click()
  await expect(page).toHaveURL('/')
  return username
}

test.describe('旅行管理流程', () => {
  test('旅行列表页加载', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/trips')
    // 空状态应显示引导文案
    await expect(page.locator('text=还没有旅行记录')).toBeVisible()
  })

  test('时间线页加载', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/timeline')
    await expect(page.locator('text=还没有旅行记录')).toBeVisible()
  })

  test('统计页加载', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/stats')
    await expect(page.locator('text=记录你的第一次旅行')).toBeVisible()
  })
})
