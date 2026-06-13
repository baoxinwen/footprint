import { test, expect } from '@playwright/test'

async function registerAndLogin(page: any): Promise<string> {
  const username = `mapuser_${Date.now()}`
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

test.describe('地图首页', () => {
  test('地图容器正确渲染', async ({ page }) => {
    await registerAndLogin(page)
    await expect(page.locator('#map-container')).toBeVisible()
  })

  test('统计面板显示', async ({ page }) => {
    await registerAndLogin(page)
    await expect(page.locator('text=统计概览')).toBeVisible()
  })

  test('空状态引导显示', async ({ page }) => {
    await registerAndLogin(page)
    await expect(page.locator('text=标记你的第一个旅行目的地')).toBeVisible()
  })
})

test.describe('设置页面', () => {
  test('设置页加载', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: '修改密码' })).toBeVisible()
  })
})
