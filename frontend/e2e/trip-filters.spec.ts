import { test, expect } from '@playwright/test'
import { registerAndLogin, createTrip } from './helpers'

test.describe('旅行筛选和排序', () => {
  test('搜索旅行标题', async ({ page }) => {
    await registerAndLogin(page)
    await createTrip(page, '北京三日游', '2025-03-01', '2025-03-03')
    await createTrip(page, '上海周末游', '2025-04-01', '2025-04-02')

    await page.goto('/trips')

    // 搜索
    await page.fill('input[placeholder*="搜索"]', '北京')
    await page.keyboard.press('Enter')

    await expect(page.locator('text=北京三日游')).toBeVisible()
  })

  test('按名称排序', async ({ page }) => {
    await registerAndLogin(page)
    await createTrip(page, 'AAA旅行', '2025-05-01', '2025-05-02')
    await createTrip(page, 'ZZZ旅行', '2025-06-01', '2025-06-02')

    await page.goto('/trips')

    // 原生 select 元素，按名称排序（默认降序）
    await page.locator('select.sort-select').selectOption('name')

    // 默认降序，ZZZ 应该在前面
    await expect(page.locator('.trip-card, .card').first()).toContainText('ZZZ')
  })

  test('清除筛选', async ({ page }) => {
    await registerAndLogin(page)
    await createTrip(page, '筛选测试', '2025-07-01', '2025-07-02')

    await page.goto('/trips')

    // 输入搜索词
    await page.fill('input[placeholder*="搜索"]', '不存在的关键词xyz')
    await page.keyboard.press('Enter')

    // 应显示无结果
    await expect(page.getByText('没有匹配的旅行')).toBeVisible()

    // 清除搜索
    await page.locator('button:has-text("清除筛选")').click()

    // 应显示旅行
    await expect(page.locator('text=筛选测试')).toBeVisible()
  })
})
