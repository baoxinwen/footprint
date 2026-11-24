import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FakeCacheStorage } from './fakeCacheStorage'
import { clearPrivateCaches, forgetCachedThumbnail } from '../../utils/pwa'
import { invalidateAuthSession } from '../../utils/authSession'

const ORIGIN = location.origin
const href = (path: string) => new URL(path, ORIGIN).href

describe('离线缓存中的私人数据', () => {
  let storage: FakeCacheStorage

  const seedPrivateData = async () => {
    await storage.seed('api-data', ['/api/trips', '/api/trips/42', '/api/timeline'])
    await storage.seed('api-thumbs', ['/api/photos/9/thumbnail', '/api/photos/10/thumbnail'])
  }

  beforeEach(() => {
    storage = new FakeCacheStorage()
    vi.stubGlobal('caches', storage)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('clearPrivateCaches', () => {
    it('清掉接口数据与缩略图，不动字体缓存和应用壳预缓存', async () => {
      await seedPrivateData()
      await storage.seed('fonts', ['/assets/x.woff2'])
      await storage.seed('workbox-precache-v2-https://footprint.example', ['/index.html', '/assets/index-abc.js'])

      await clearPrivateCaches()

      expect(await storage.keys()).toEqual(['fonts', 'workbox-precache-v2-https://footprint.example'])
    })

    it('没有任何缓存时也能安全完成', async () => {
      await expect(clearPrivateCaches()).resolves.toBeUndefined()
      expect(await storage.keys()).toEqual([])
    })

    it('环境不支持 Cache Storage（非安全上下文）时直接跳过', async () => {
      vi.stubGlobal('caches', undefined)
      await expect(clearPrivateCaches()).resolves.toBeUndefined()
    })

    it('读缓存清单失败时不抛出——它是以不等待的方式被调用的，不能留下未处理的拒绝', async () => {
      storage.keys = () => Promise.reject(new TypeError('cache storage corrupted'))
      await expect(clearPrivateCaches()).resolves.toBeUndefined()
    })
  })

  describe('forgetCachedThumbnail', () => {
    it('只移除被删除照片的缩略图', async () => {
      await storage.seed('api-thumbs', ['/api/photos/9/thumbnail', '/api/photos/10/thumbnail'])

      await forgetCachedThumbnail(9)

      expect(await storage.urls('api-thumbs')).toEqual([href('/api/photos/10/thumbnail')])
    })

    it('缩略图缓存尚不存在或环境不支持时直接跳过', async () => {
      await expect(forgetCachedThumbnail(9)).resolves.toBeUndefined()
      vi.stubGlobal('caches', undefined)
      await expect(forgetCachedThumbnail(9)).resolves.toBeUndefined()
    })
  })

  describe('与登录态联动', () => {
    it('登录态失效（登出或 401 过期）时清掉私人数据', async () => {
      await seedPrivateData()
      await storage.seed('fonts', ['/assets/x.woff2'])

      invalidateAuthSession()
      await vi.waitFor(async () => {
        expect(await storage.keys()).toEqual(['fonts'])
      })
    })
  })
})
