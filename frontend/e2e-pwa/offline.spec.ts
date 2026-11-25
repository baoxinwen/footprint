import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerAndLogin } from '../e2e/helpers'
import { API_DATA_CACHE, THUMBNAIL_CACHE } from '../src/pwa/cachePolicy'
import { cacheNames, createTripThroughApi, fetchUncached, goOffline, registerUserThroughApi, waitUntilControlled } from './helpers'

// 上传用的真实图片：仓库里现成的图标，省得在测试里内嵌二进制
const sampleImage = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/icons/icon-192.png'))

/** 是否有私人数据留在离线缓存里 */
async function hasPrivateCache(page: Page): Promise<boolean> {
  const names = await cacheNames(page)
  return names.includes(API_DATA_CACHE) || names.includes(THUMBNAIL_CACHE)
}

/** 断言某张图确实解码出了像素——光有「就绪」标记不够，那只能说明状态位变了 */
async function expectDecoded(page: Page, selector: string): Promise<void> {
  await expect(page.locator(selector).first()).toHaveAttribute('data-image-state', 'ready')
  const width = await page.locator(selector).first().evaluate((img: HTMLImageElement) => img.naturalWidth)
  expect(width, `${selector} 应解码出像素`).toBeGreaterThan(0)
}

test.describe('离线使用', () => {
  test('应用壳缓存完成后提示一次，断网重新打开仍是应用', async ({ page }) => {
    await page.goto('/login')

    await expect(page.locator('.el-message')).toContainText('已可离线使用')
    await waitUntilControlled(page)

    await goOffline(page.context())
    await page.reload()

    await expect(page.locator('.submit-btn')).toBeVisible()
    await expect(page.locator('.offline-banner')).toHaveAttribute('role', 'status')
    // 对照一：Service Worker 没有规则的请求必须失败
    expect(await fetchUncached(page, '/api/no-such-endpoint')).toBe('failed')
    // 对照二：缓存里没有的页面（分享页不在缓存范围）打不开——说明上面那份页面确实来自缓存
    await expect(page.goto('/share/no-such-token', { waitUntil: 'domcontentloaded' })).rejects.toThrow()
  })

  test('断网后看过的页面显示上次的内容，没看过的内容不会凭空出现', async ({ page }) => {
    await page.goto('/login')
    await waitUntilControlled(page)
    await registerAndLogin(page)
    const viewed = await createTripThroughApi(page, '离线前打开过的旅行')
    const unviewed = await createTripThroughApi(page, '离线前没打开过的旅行')

    await page.goto('/trips')
    await expect(page.getByRole('button', { name: '查看旅行：离线前打开过的旅行' })).toBeVisible()
    await page.goto(`/trips/${viewed.id}`)
    await expect(page.locator('.hero-title')).toHaveText('离线前打开过的旅行')
    await expect(page.getByText('西湖').first()).toBeVisible()

    await goOffline(page.context())

    await page.goto('/trips')
    await expect(page.locator('.offline-banner')).toBeVisible()
    await expect(page.getByRole('button', { name: '查看旅行：离线前打开过的旅行' })).toBeVisible()
    await page.goto(`/trips/${viewed.id}`)
    await expect(page.locator('.hero-title')).toHaveText('离线前打开过的旅行')
    await expect(page.getByText('西湖').first()).toBeVisible()

    // 对照：没打开过的旅行离线时拿不到，显示失败状态
    await page.goto(`/trips/${unviewed.id}`)
    await expect(page.getByRole('heading', { name: '旅行详情加载失败' })).toBeVisible()
  })

  test('看过的照片缩略图断网后仍然显示', async ({ page }) => {
    await page.goto('/login')
    await waitUntilControlled(page)
    await registerAndLogin(page)
    const trip = await createTripThroughApi(page, '带照片的旅行', { photo: sampleImage })

    // 照片条在首屏内；照片网格里的缩略图是懒加载，进入视口才会去取
    const stripImage = '.strip-item img'
    const gridImage = '.photos-grid img'
    await page.goto(`/trips/${trip.id}`)
    await expectDecoded(page, stripImage)
    await page.locator(gridImage).first().scrollIntoViewIfNeeded()
    await expectDecoded(page, gridImage)
    expect(await cacheNames(page)).toContain(THUMBNAIL_CACHE)

    await goOffline(page.context())
    await page.reload()

    await expectDecoded(page, stripImage)
    await page.locator(gridImage).first().scrollIntoViewIfNeeded()
    await expectDecoded(page, gridImage)
  })

  test('退出登录会清掉缓存里的私人数据，换账号后离线也看不到上一个人的旅行', async ({ page }) => {
    await page.goto('/login')
    await waitUntilControlled(page)
    await registerAndLogin(page)
    await createTripThroughApi(page, '上一个人的旅行')
    await page.goto('/trips')
    await expect(page.getByText('上一个人的旅行').first()).toBeVisible()
    expect(await cacheNames(page)).toContain(API_DATA_CACHE)

    await page.locator('.nav-btn-logout').first().click()
    await expect(page).toHaveURL(/\/login$/)
    await expect.poll(() => hasPrivateCache(page), { message: '私人数据缓存应被清掉' }).toBe(false)
    // 只清私人数据：应用壳的预缓存保留，离线仍能打开
    expect(await cacheNames(page)).toEqual(expect.arrayContaining([expect.stringMatching(/^workbox-precache/)]))

    await registerAndLogin(page)
    await page.goto('/trips')
    await expect(page.getByText('还没有旅行记录')).toBeVisible()

    await goOffline(page.context())
    await page.reload()
    await expect(page.getByText('还没有旅行记录')).toBeVisible()
    await expect(page.getByText('上一个人的旅行')).toHaveCount(0)
  })

  test('快捷方式的地址可以直接当作启动入口，断网时也一样', async ({ page }) => {
    // 从主屏快捷方式打开时，应用是从这个地址冷启动的，不经过首页
    const token = await registerUserThroughApi(page)
    await page.addInitScript((value) => localStorage.setItem('token', value), token)
    await page.goto('/trips/new')
    await waitUntilControlled(page)
    await expect(page.getByRole('button', { name: '创建旅行', exact: true })).toBeVisible()

    await goOffline(page.context())
    await page.reload()
    await expect(page.getByRole('button', { name: '创建旅行', exact: true })).toBeVisible()
  })
})
