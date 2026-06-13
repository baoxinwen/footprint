import { test, expect } from '@playwright/test'
import { registerAndLogin, createTrip } from './helpers'

test.describe('旅行 CRUD 流程', () => {
  test('创建新旅行', async ({ page }) => {
    await registerAndLogin(page)

    await page.goto('/trips/new')
    await expect(page.locator('h2')).toContainText('新建旅行')

    // 填写表单
    await page.fill('input[placeholder*="旅行标题"]', 'E2E测试旅行')
    await page.fill('textarea[placeholder*="旅行简述"]', '这是一次自动化测试旅行')

    const dateInputs = page.locator('.el-date-editor input')
    await dateInputs.nth(0).fill('2025-10-01')
    await dateInputs.nth(1).fill('2025-10-05')

    await page.locator('button:has-text("创建")').click()
    await expect(page.locator('.el-message--success')).toContainText('创建成功')
  })

  test('旅行列表显示已创建的旅行', async ({ page }) => {
    await registerAndLogin(page)
    await createTrip(page, '列表测试旅行', '2025-06-01', '2025-06-03')

    await page.goto('/trips')
    await expect(page.locator('text=列表测试旅行')).toBeVisible()
  })

  test('进入旅行详情页', async ({ page }) => {
    await registerAndLogin(page)
    await createTrip(page, '详情测试旅行', '2025-07-01', '2025-07-03')

    await page.goto('/trips')
    await page.locator('text=详情测试旅行').first().click()

    await expect(page.locator('text=详情测试旅行').first()).toBeVisible()
  })

  test('编辑旅行标题', async ({ page }) => {
    await registerAndLogin(page)
    await createTrip(page, '编辑前标题', '2025-08-01', '2025-08-03')

    await page.goto('/trips')
    await page.locator('text=编辑前标题').first().click()

    // 点击编辑按钮
    await page.locator('button:has-text("编辑")').click()
    await expect(page).toHaveURL(/\/edit/)

    // 修改标题
    await page.fill('input[placeholder*="旅行标题"]', '编辑后标题')
    await page.locator('button:has-text("保存")').click()
    await expect(page.locator('.el-message--success')).toContainText('保存成功')
  })

  test('删除旅行', async ({ page }) => {
    await registerAndLogin(page)
    await createTrip(page, '待删除旅行', '2025-09-01', '2025-09-03')

    await page.goto('/trips')
    await page.locator('text=待删除旅行').first().click()

    // 点击删除按钮
    await page.locator('button:has-text("删除")').click()

    // 确认删除对话框
    await page.locator('.el-message-box__btns button:has-text("确定")').click()

    // 应跳转回旅行列表
    await expect(page).toHaveURL(/\/trips/)
  })

  test('导出 JSON', async ({ page }) => {
    await registerAndLogin(page)
    await createTrip(page, '导出测试旅行', '2025-11-01', '2025-11-03')

    await page.goto('/trips')
    await page.locator('text=导出测试旅行').first().click()

    // 点击导出按钮
    await page.locator('button:has-text("导出")').click()

    // 选择 JSON 格式
    const downloadPromise = page.waitForEvent('download')
    await page.locator('text=导出为 JSON').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('.json')
  })
})
