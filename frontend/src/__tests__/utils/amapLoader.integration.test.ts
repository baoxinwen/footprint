import { describe, it, expect, vi, afterEach } from 'vitest'

// 评审 I-16：用真实 @amap/amap-jsapi-loader 固定它的失败缓存语义。
// 组件测试里的替身必须与这些语义一致，否则「恢复联网自动加载」会被假通过。
describe('@amap/amap-jsapi-loader（真实库）失败语义', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('首次失败后 load() 直接拒绝，reset() 后才重新插入脚本', async () => {
    const { default: AMapLoader } = await import('@amap/amap-jsapi-loader')
    const originalCreate = document.createElement.bind(document)
    const scripts: HTMLScriptElement[] = []
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = originalCreate(tag)
      if (tag === 'script') scripts.push(el as HTMLScriptElement)
      return el
    }) as typeof document.createElement)

    try {
      AMapLoader.reset()
      const first = AMapLoader.load({ key: 'vitest-key', version: '2.0' })
      await Promise.resolve()
      expect(scripts.length).toBe(1)
      scripts[0].onerror?.(new Event('error'))
      await expect(first).rejects.toBeTruthy()

      // 真实库行为：失败被缓存，再次 load() 不插入脚本、立即拒绝（拒绝值为空串）
      const second = AMapLoader.load({ key: 'vitest-key', version: '2.0' })
      await expect(second).rejects.toBeDefined()
      expect(scripts.length).toBe(1)

      // reset() 清掉失败缓存，再次 load() 重新插入脚本
      AMapLoader.reset()
      const third = AMapLoader.load({ key: 'vitest-key', version: '2.0' })
      await Promise.resolve()
      expect(scripts.length).toBe(2)
      scripts[1].onerror?.(new Event('error'))
      await expect(third).rejects.toBeTruthy()
    } finally {
      AMapLoader.reset()
    }
  })
})
