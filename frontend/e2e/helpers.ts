import { expect, Page } from '@playwright/test'

export async function registerAndLogin(page: Page): Promise<string> {
  const username = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
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

export async function createTrip(page: Page, title: string, startDate: string, endDate: string) {
  await page.goto('/trips/new')
  await page.fill('input[placeholder*="旅行标题"]', title)

  const dateInputs = page.locator('.el-date-editor input')
  await dateInputs.nth(0).fill(startDate)
  await dateInputs.nth(1).fill(endDate)

  await page.locator('button:has-text("创建")').click()
  await expect(page.locator('.el-message--success')).toContainText('创建成功')
}
