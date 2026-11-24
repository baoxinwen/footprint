import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerUserThroughApi, waitUntilControlled } from './helpers'

const swPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist/sw.js')
const OLD_VERSION = 'no-reply'

// 追加到 sw.js 末尾的探针：新版本的 Service Worker 靠它自报身份，旧版本不认识这条消息
const PROBE = `
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'E2E_VERSION' && event.ports[0]) {
    event.ports[0].postMessage('build-2')
  }
})
`

/** 向当前接管页面的 Service Worker 问版本 */
async function askControllerVersion(page: Page): Promise<string> {
  return page.evaluate(
    (oldVersion) =>
      new Promise<string>((resolve) => {
        const worker = navigator.serviceWorker.controller
        if (!worker) {
          resolve(oldVersion)
          return
        }
        const channel = new MessageChannel()
        channel.port1.onmessage = (event) => resolve(event.data)
        worker.postMessage({ type: 'E2E_VERSION' }, [channel.port2])
        setTimeout(() => resolve(oldVersion), 2000)
      }),
    OLD_VERSION,
  )
}

/**
 * 打开应用并等当前页面自己装好 Service Worker。
 *
 * 令牌在页面脚本运行前写入：这个页面实例从加载起就是登录态，全程不再整页跳转。
 * 这一点很关键——注册脚本是否把「页面被接管」当作更新，取决于页面加载时
 * 是否已被（旧版本的）Service Worker 接管。这里覆盖的是它判定为「不是更新」的情形：
 * 首次访问、由当前页面自己装好 Service Worker 的会话
 */
async function openInFirstSession(page: Page, url: string): Promise<void> {
  const token = await registerUserThroughApi(page)
  await page.addInitScript((value) => localStorage.setItem('token', value), token)
  await page.goto(url)
  await waitUntilControlled(page)
  expect(await askControllerVersion(page)).toBe(OLD_VERSION)
}

/** 模拟一次发版：Service Worker 脚本内容变了。dist 是构建产物，用完即还原 */
async function deployNewBuild<T>(run: () => Promise<T>): Promise<T> {
  const original = await fs.readFile(swPath)
  await fs.appendFile(swPath, PROBE)
  try {
    return await run()
  } finally {
    await fs.writeFile(swPath, original)
  }
}

/** 触发一次应当导致重载的操作，并确认页面确实重载、接管页面的是新版本 */
async function expectReloadIntoNewBuild(page: Page, trigger: () => Promise<void>): Promise<void> {
  await page.evaluate(() => {
    window.__e2eBeforeRefresh = true
  })
  await Promise.all([page.waitForEvent('load'), trigger()])

  // 重载后内存里的标记消失；接管页面的是新版本
  expect(await page.evaluate(() => window.__e2eBeforeRefresh)).toBeUndefined()
  expect(await askControllerVersion(page)).toBe('build-2')
}

test.describe('版本更新', () => {
  test('运行期间来了新版本：先提示，点「立即刷新」才重载并切到新版', async ({ page }) => {
    await openInFirstSession(page, '/trips')

    await deployNewBuild(async () => {
      // 应用常驻后台时靠定时检查发现更新，这里直接触发一次检查
      await page.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration())?.update()
      })
      await expect(page.locator('.update-prompt')).toContainText('有新版本可用')
      // 提示出现时仍是旧版本在服务：切换与否由用户决定
      expect(await askControllerVersion(page)).toBe(OLD_VERSION)

      await expectReloadIntoNewBuild(page, () => page.locator('.update-btn-primary').click())
    })
  })

  test('设置页手动检查更新：没有新版本时如实告知，有新版本时直接切过去', async ({ page }) => {
    await openInFirstSession(page, '/settings')
    const checkButton = page.getByRole('button', { name: '检查更新', exact: true })

    // 页面上可能还挂着首次缓存完成时的「已可离线使用」提示，按文案定位
    await checkButton.click()
    await expect(page.locator('.el-message', { hasText: '已是最新版本' })).toBeVisible()

    await deployNewBuild(async () => {
      // 用户是主动来查的，查到就直接切换，不需要再点一次确认
      await expectReloadIntoNewBuild(page, () => checkButton.click())
    })
  })
})
