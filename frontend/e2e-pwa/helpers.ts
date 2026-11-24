import { expect, type BrowserContext, type Page } from '@playwright/test'

/**
 * 模拟断网。
 *
 * 只调用 setOffline 并不够：整页跳转之后，Playwright 的断网模拟不再约束 Service Worker
 * 自己发出的请求——页面上看是离线（navigator.onLine 为 false、离线条照常出现），
 * 数据却从网络取了回来，离线用例会假通过。所以再把接口请求直接掐断。
 * 每个离线用例仍要保留「没缓存的东西确实拿不到」的对照断言。
 */
export async function goOffline(context: BrowserContext): Promise<void> {
  await context.setOffline(true)
  await context.route('**/api/**', (route) => route.abort('connectionrefused'))
}

/**
 * 等到 Service Worker 激活并接管当前页面。
 * 只有接管之后发出的请求才会经过它、进入离线缓存，所以这一步必须排在造数据之前。
 */
export async function waitUntilControlled(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), { timeout: 20000 })
    .toBe(true)
}

/** 当前来源下的全部缓存名 */
export async function cacheNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => caches.keys())
}

/**
 * 从页面发一条 Service Worker 没有规则的请求。断网时它必须失败——
 * 用来证明网络确实不通，离线用例不是因为网络还在而「碰巧通过」。
 */
export async function fetchUncached(page: Page, path: string): Promise<'ok' | 'failed'> {
  return page.evaluate(async (target) => {
    try {
      const response = await fetch(target, { cache: 'no-store' })
      await response.arrayBuffer()
      return 'ok'
    } catch {
      return 'failed'
    }
  }, path)
}

/** 通过接口注册一个新用户并登录，返回令牌。口令运行时生成，仓库里不留字面量 */
export async function registerUserThroughApi(page: Page): Promise<string> {
  const username = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const password = crypto.randomUUID().replaceAll('-', '')
  const registered = await page.request.post('/api/auth/register', { data: { username, password } })
  expect(registered.status(), await registered.text()).toBe(200)
  const loggedIn = await page.request.post('/api/auth/login', { data: { username, password } })
  expect(loggedIn.status(), await loggedIn.text()).toBe(200)
  return (await loggedIn.json()).access_token
}

/**
 * 通过接口建一条带地点的旅行，可选再传一张照片，返回旅行与地点的 id。
 * 不走界面：地图选点、上传弹窗都与离线无关，而且接口请求不经过页面，不会被缓存——
 * 正好用来造「离线前没在页面上打开过」的数据。
 */
export async function createTripThroughApi(
  page: Page,
  title: string,
  options: { photo?: Buffer } = {},
): Promise<{ id: number; locationId: number }> {
  const token = await page.evaluate(() => localStorage.getItem('token'))
  const headers = { Authorization: `Bearer ${token}` }
  const created = await page.request.post('/api/trips', {
    headers,
    data: {
      title,
      start_date: '2026-03-01',
      end_date: '2026-03-05',
      locations: [
        {
          name: '西湖',
          address: '杭州市西湖区龙井路 1 号',
          longitude: 120.15,
          latitude: 30.25,
          city: '杭州',
          province: '浙江省',
        },
      ],
    },
  })
  expect(created.status(), await created.text()).toBe(201)
  const tripId = (await created.json()).id
  // 创建接口的返回体不带地点，地点 id 要从详情里取
  const detail = await page.request.get(`/api/trips/${tripId}`, { headers })
  expect(detail.status(), await detail.text()).toBe(200)
  const locationId = (await detail.json()).locations[0].id
  expect(typeof tripId).toBe('number')
  expect(typeof locationId).toBe('number')

  if (options.photo) {
    const uploaded = await page.request.post(`/api/photos/upload/${locationId}`, {
      headers,
      multipart: {
        file: { name: 'e2e.png', mimeType: 'image/png', buffer: options.photo },
      },
    })
    expect(uploaded.status(), await uploaded.text()).toBe(201)
  }
  return { id: tripId, locationId }
}
