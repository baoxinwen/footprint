import { describe, it, expect } from 'vitest'
import { isApiDataRequest, isFontRequest, isThumbnailRequest } from '../../pwa/cachePolicy'

const ORIGIN = 'https://footprint.example'

/** 用真实的 URL 与 Request 构造匹配输入，不手写 mock 对象 */
function input(pathOrUrl: string, { sameOrigin = true, method = 'GET' } = {}) {
  const url = new URL(pathOrUrl, ORIGIN)
  return { url, sameOrigin, request: new Request(url, { method }) }
}

/** 每条路径的判定结果，拼成 [路径, 是否缓存] 便于整体比较 */
const verdicts = (match: (i: ReturnType<typeof input>) => boolean, paths: string[], method = 'GET') =>
  paths.map((path) => [path, match(input(path, { method }))])

describe('Service Worker 运行时缓存规则', () => {
  describe('只读数据接口（联网优先，断网回退）', () => {
    it('缓存旅行、时间线、统计、照片清单与公开配置', () => {
      expect(
        verdicts(isApiDataRequest, [
          '/api/trips',
          '/api/trips?page=2&sort=start_date',
          '/api/trips/cities',
          '/api/trips/years',
          '/api/trips/42',
          '/api/timeline',
          '/api/stats/overview',
          '/api/stats/yearly',
          '/api/stats/monthly',
          '/api/stats/city-rank',
          '/api/stats/map/routes',
          '/api/photos/location/7',
          '/api/config',
        ]),
      ).toEqual([
        ['/api/trips', true],
        ['/api/trips?page=2&sort=start_date', true],
        ['/api/trips/cities', true],
        ['/api/trips/years', true],
        ['/api/trips/42', true],
        ['/api/timeline', true],
        ['/api/stats/overview', true],
        ['/api/stats/yearly', true],
        ['/api/stats/monthly', true],
        ['/api/stats/city-rank', true],
        ['/api/stats/map/routes', true],
        ['/api/photos/location/7', true],
        ['/api/config', true],
      ])
    })

    it('不缓存写操作的后缀路径、导出导入、账号、搜索、高德代理、分享与图片本体', () => {
      expect(
        verdicts(isApiDataRequest, [
          '/api/trips/42/export/json',
          '/api/trips/42/export/markdown',
          '/api/trips/42/locations',
          '/api/trips/42/locations/sort',
          '/api/trips/import',
          '/api/account/info',
          '/api/account/export/all',
          '/api/account/export/all-with-photos',
          '/api/auth/login',
          '/api/search?q=大理',
          '/api/amap/poi/search?keywords=故宫',
          '/api/shares',
          '/api/shares/42',
          '/api/shares/42/rotate',
          '/api/shares/view/kT3x9Q',
          '/api/shares/view/kT3x9Q/locations/7/photos',
          '/api/photos/42/original',
          '/api/photos/42/thumbnail',
          '/api/photos/location',
        ]),
      ).toEqual([
        ['/api/trips/42/export/json', false],
        ['/api/trips/42/export/markdown', false],
        ['/api/trips/42/locations', false],
        ['/api/trips/42/locations/sort', false],
        ['/api/trips/import', false],
        ['/api/account/info', false],
        ['/api/account/export/all', false],
        ['/api/account/export/all-with-photos', false],
        ['/api/auth/login', false],
        ['/api/search?q=大理', false],
        ['/api/amap/poi/search?keywords=故宫', false],
        ['/api/shares', false],
        ['/api/shares/42', false],
        ['/api/shares/42/rotate', false],
        ['/api/shares/view/kT3x9Q', false],
        ['/api/shares/view/kT3x9Q/locations/7/photos', false],
        ['/api/photos/42/original', false],
        ['/api/photos/42/thumbnail', false],
        ['/api/photos/location', false],
      ])
    })

    it('路径必须完整匹配：前缀相同但形态不符的不收', () => {
      expect(
        verdicts(isApiDataRequest, [
          '/api/trips/abc',
          '/api/trips/42/',
          '/api/trips/42/anything',
          '/api/timeline/extra',
          '/api/stats',
          '/api/stats/',
          '/api/stats/Map/Routes',
          '/api/stats/map/routes/extra',
          '/api/photos/location/7/extra',
          '/api/config/extra',
          '/api/tripsx',
          '/config',
        ]),
      ).toEqual([
        ['/api/trips/abc', false],
        ['/api/trips/42/', false],
        ['/api/trips/42/anything', false],
        ['/api/timeline/extra', false],
        ['/api/stats', false],
        ['/api/stats/', false],
        ['/api/stats/Map/Routes', false],
        ['/api/stats/map/routes/extra', false],
        ['/api/photos/location/7/extra', false],
        ['/api/config/extra', false],
        ['/api/tripsx', false],
        ['/config', false],
      ])
    })

    it('只缓存 GET：路径相同的写操作不进缓存', () => {
      expect(
        ['POST', 'PUT', 'DELETE', 'PATCH'].map((method) => [method, isApiDataRequest(input('/api/trips/42', { method }))]),
      ).toEqual([
        ['POST', false],
        ['PUT', false],
        ['DELETE', false],
        ['PATCH', false],
      ])
    })

    it('只管同源请求', () => {
      expect(
        ['/api/trips', '/api/timeline', '/api/config'].map((path) => [path, isApiDataRequest(input(path, { sameOrigin: false }))]),
      ).toEqual([
        ['/api/trips', false],
        ['/api/timeline', false],
        ['/api/config', false],
      ])
    })
  })

  describe('缩略图（缓存优先）', () => {
    it('只收缩略图端点，原图与照片清单各归各的', () => {
      expect(
        verdicts(isThumbnailRequest, [
          '/api/photos/42/thumbnail',
          '/api/photos/7/thumbnail?v=2',
          '/api/photos/42/original',
          '/api/photos/42',
          '/api/photos/location/7',
        ]),
      ).toEqual([
        ['/api/photos/42/thumbnail', true],
        ['/api/photos/7/thumbnail?v=2', true],
        ['/api/photos/42/original', false],
        ['/api/photos/42', false],
        ['/api/photos/location/7', false],
      ])
      expect(isThumbnailRequest(input('/api/photos/42/thumbnail', { method: 'POST' }))).toBe(false)
      expect(isThumbnailRequest(input('/api/photos/42/thumbnail', { sameOrigin: false }))).toBe(false)
    })
  })

  describe('字体分片（缓存优先）', () => {
    it('收同源 woff2，其余静态资源与第三方字体不收', () => {
      const files = [
        '/assets/noto-sans-sc-119-wght-normal-abc123.woff2',
        '/assets/index-abc123.css',
        '/assets/index-abc123.js',
      ]
      expect(verdicts(isFontRequest, files)).toEqual([
        ['/assets/noto-sans-sc-119-wght-normal-abc123.woff2', true],
        ['/assets/index-abc123.css', false],
        ['/assets/index-abc123.js', false],
      ])
      expect(isFontRequest(input('https://fonts.gstatic.com/s/notosanssc/x.woff2', { sameOrigin: false }))).toBe(false)
    })
  })
})
