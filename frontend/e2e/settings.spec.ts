import { test, expect } from '@playwright/test'
import { registerAndLogin, TEST_PASSWORD } from './helpers'

const NEW_PASSWORD = crypto.randomUUID().replaceAll('-', '')

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
    await passwordInputs.nth(1).fill(NEW_PASSWORD)
    await passwordInputs.nth(2).fill(NEW_PASSWORD)

    await page.locator('.password-form button[type="submit"]').click()
    await expect(page.locator('.el-message--error').first()).toBeVisible()
  })

  test('修改密码 - 两次输入不一致', async ({ page }) => {
    await registerAndLogin(page)
    await page.goto('/settings')

    const passwordInputs = page.locator('input[type="password"]')
    await passwordInputs.nth(0).fill(TEST_PASSWORD)
    await passwordInputs.nth(1).fill(NEW_PASSWORD)
    await passwordInputs.nth(2).fill('DifferentPass')

    await page.locator('.password-form button[type="submit"]').click()
    await expect(page.locator('.el-message')).toBeVisible()
  })

  test('修改密码成功后跳转登录页', async ({ page }) => {
    // 回归（评审 I-20）：曾填入与注册无关的随机口令，后端必然 400，
    // 用例只断言了错误提示可见——改密从未成功，跳转从未被验证
    await registerAndLogin(page)
    await page.goto('/settings')

    const passwordInputs = page.locator('input[type="password"]')
    await passwordInputs.nth(0).fill(TEST_PASSWORD)
    await passwordInputs.nth(1).fill(NEW_PASSWORD)
    await passwordInputs.nth(2).fill(NEW_PASSWORD)

    await page.locator('.password-form button[type="submit"]').click()
    // 密码修改成功后跳转登录页
    await expect(page).toHaveURL(/\/login/)
  })
})
