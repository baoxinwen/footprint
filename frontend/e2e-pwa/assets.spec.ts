import { test, expect } from '@playwright/test'

/** 读 PNG 的 IHDR，返回真实像素尺寸 */
function pngSize(buf: Buffer): { width: number; height: number } {
  // 8 字节魔数 + 4 字节长度 + 'IHDR' + 宽 + 高
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

test.describe('PWA 可安装性', () => {
  test('首页声明 manifest 与 iOS 主屏标签', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon.png')
    // iOS 不支持 manifest 的安装部分：靠这两个标签决定「添加到主屏幕」后以独立窗口打开
    await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute('content', 'yes')
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes')
  })

  test('manifest 满足安装条件，引用的图标都存在且尺寸相符', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('application/manifest+json')
    const manifest = await res.json()

    // 安装判定的必要字段
    expect(manifest.name).toBeTruthy()
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(['fullscreen', 'standalone', 'minimal-ui']).toContain(manifest.display)

    // 必须同时有 192 与 512，且 512 另有 maskable 版供启动器裁形
    const sizes = manifest.icons.map((icon: { sizes: string }) => `${icon.sizes} ${icon.purpose ?? 'any'}`)
    expect(sizes).toEqual(expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']))

    // 清单与文件不能脱节：逐个核对存在性、类型与真实像素尺寸
    for (const icon of manifest.icons) {
      const file = await request.get(icon.src)
      expect(file.status(), icon.src).toBe(200)
      expect(file.headers()['content-type'], icon.src).toContain('image/png')
      const body = await file.body()
      expect(body.subarray(0, 8), icon.src).toEqual(Buffer.from('89504e470d0a1a0a', 'hex'))
      const [w, h] = icon.sizes.split('x').map(Number)
      expect(pngSize(body), icon.src).toEqual({ width: w, height: h })
    }
  })
})
