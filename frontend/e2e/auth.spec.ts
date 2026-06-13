import { test, expect } from '@playwright/test'

test.describe('用户认证流程', () => {
  test('访问受保护页面应跳转到登录页', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('注册新用户', async ({ page }) => {
    await page.goto('/login')
    // 点击注册 Tab
    await page.locator('.tab-btn', { hasText: '注册' }).click()

    // 注册表单 placeholder
    await page.fill('input[placeholder*="3-50个字符"]', `testuser_${Date.now()}`)
    await page.fill('input[placeholder="至少6位"]', 'Test@123456')
    await page.fill('input[placeholder="再次输入密码"]', 'Test@123456')
    await page.locator('.submit-btn').click()

    await expect(page.locator('.el-message')).toContainText('注册成功')
  })

  test('登录成功后跳转到地图页', async ({ page }) => {
    const username = `loginuser_${Date.now()}`

    // 先注册
    await page.goto('/login')
    await page.locator('.tab-btn', { hasText: '注册' }).click()
    await page.fill('input[placeholder*="3-50个字符"]', username)
    await page.fill('input[placeholder="至少6位"]', 'Test@123456')
    await page.fill('input[placeholder="再次输入密码"]', 'Test@123456')
    await page.locator('.submit-btn').click()
    await expect(page.locator('.el-message')).toContainText('注册成功')

    // 切换到登录
    await page.locator('.tab-btn', { hasText: '登录' }).click()
    await page.fill('input[placeholder="请输入用户名"]', username)
    await page.fill('input[placeholder="请输入密码"]', 'Test@123456')
    await page.locator('.submit-btn').click()

    await expect(page).toHaveURL('/')
  })

  test('登录失败显示错误提示', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[placeholder="请输入用户名"]', 'nonexistent')
    await page.fill('input[placeholder="请输入密码"]', 'wrongpass')
    await page.locator('.submit-btn').click()

    await expect(page.locator('.el-message--error')).toBeVisible()
  })
})
