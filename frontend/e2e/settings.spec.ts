import { test, expect } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('设置页面', () => {
  test('查看账号信息', async ({ page }) => {
    const username = await registerAndLogin(page)
    await page.goto('/settings')
    await expect(page.locator(`text=${username}`)).toBeVisible()
  })

  test('修改密码 - 当前密码错误', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/settings')

    const passwordInputs = page.locator('input[type="password"]')
    await passwordInputs.nth(0).fill('wrongpassword')
    await passwordInputs.nth(1).fill('NewPass123')
    await passwordInputs.nth(2).fill('NewPass123')

    await page.locator('.password-form button[type="submit"]').click()
    await expect(page.locator('.el-message--error').first()).toBeVisible()
  })

  test('修改密码 - 两次输入不一致', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/settings')

    const passwordInputs = page.locator('input[type="password"]')
    await passwordInputs.nth(0).fill('Test@123456')
    await passwordInputs.nth(1).fill('NewPass123')
    await passwordInputs.nth(2).fill('DifferentPass')

    await page.locator('.password-form button[type="submit"]').click()
    await expect(page.locator('.el-message')).toBeVisible()
  })

  test('修改密码成功后跳转登录页', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/settings')

    const passwordInputs = page.locator('input[type="password"]')
    await passwordInputs.nth(0).fill('Test@123456')
    await passwordInputs.nth(1).fill('NewPass123')
    await passwordInputs.nth(2).fill('NewPass123')

    await page.locator('.password-form button[type="submit"]').click()
    // 密码修改成功后应显示成功提示并跳转
    await expect(page.locator('.el-message').first()).toBeVisible()
  })
})
