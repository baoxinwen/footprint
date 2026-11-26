import { test, expect } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('导航和路由守卫', () => {
  test('未登录访问受保护页面跳转登录页', async ({ page }) => {
    const protectedRoutes = ['/', '/trips', '/trips/new', '/timeline', '/stats', '/settings']

    for (const route of protectedRoutes) {
      await page.goto(route)
      await expect(page).toHaveURL(/\/login/)
    }
  })

  test('未登录可访问分享页面', async ({ page }) => {
    await page.goto('/share/some-token')
    // 不应跳转到登录页
    await expect(page).toHaveURL(/\/share/)
  })

  test('未登录可访问过期分享页', async ({ page }) => {
    await page.goto('/share/expired')
    await expect(page).toHaveURL(/\/share\/expired/)
  })

  test('登录后可访问所有页面', async ({ page }) => {
    await registerAndLogin(page)

    const routes = ['/trips', '/timeline', '/stats', '/settings']
    for (const route of routes) {
      await page.goto(route)
      await expect(page).toHaveURL(route)
    }
  })

  test('退出登录', async ({ page }) => {
    // 回归（评审 I-20）：旧定位器匹配不到任何元素，整条用例空转恒通过。
    // 桌面顶栏与移动端顶栏都在 DOM 里渲染（CSS 按视口显隐），共 2 个按钮
    await registerAndLogin(page)

    const logoutBtn = page.locator('[aria-label="退出登录"]')
    await expect(logoutBtn).toHaveCount(2)
    await logoutBtn.first().click()
    await expect(page).toHaveURL(/\/login/)
    // 回到登录页后退出按钮不再可见
    await expect(logoutBtn).toHaveCount(0)
  })

  test('从地图页导航到旅行列表', async ({ page }) => {
    await registerAndLogin(page)

    // 点击导航栏的"旅行"
    await page.locator('a:has-text("旅行"), nav a:has-text("旅行")').first().click()
    await expect(page).toHaveURL(/\/trips/)
  })

  test('从旅行列表导航到时间线', async ({ page }) => {
    await registerAndLogin(page)

    await page.locator('a:has-text("时间线"), nav a:has-text("时间线")').first().click()
    await expect(page).toHaveURL(/\/timeline/)
  })

  test('从时间线导航到统计', async ({ page }) => {
    await registerAndLogin(page)

    await page.locator('a:has-text("统计"), nav a:has-text("统计")').first().click()
    await expect(page).toHaveURL(/\/stats/)
  })
})
