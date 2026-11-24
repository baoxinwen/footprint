/**
 * Service Worker 运行时缓存规则。
 *
 * 这里的匹配函数会被 Workbox 原样序列化进生成的 Service Worker（只取函数源码），
 * 所以函数体必须自包含：不能引用模块里的其他变量，正则一律写成内联字面量。
 * vite.config.ts 把它们交给运行时缓存配置，本文件同时是单元测试的对象。
 */

/** Workbox 传给匹配函数的请求描述 */
export interface CacheMatchInput {
  url: URL
  sameOrigin: boolean
  request: Request
}

/** 缓存名。页面侧按名字清理私人数据，须与 vite.config.ts 里的运行时缓存配置一致 */
export const API_DATA_CACHE = 'api-data'
export const THUMBNAIL_CACHE = 'api-thumbs'
export const FONT_CACHE = 'fonts'

/**
 * 只读数据接口：联网优先，断网时回退到上次拿到的结果。
 *
 * 用白名单且路径须完整匹配。旅行详情 /api/trips/5 与导出 /api/trips/5/export/json、
 * 子资源 /api/trips/5/locations 同前缀——写成宽泛的 /api/trips/ 规则会把
 * 导出的备份文件和写操作的子资源一并缓存进来。
 */
export function isApiDataRequest({ url, sameOrigin, request }: CacheMatchInput): boolean {
  return (
    sameOrigin &&
    request.method === 'GET' &&
    /^\/api\/(?:trips|trips\/cities|trips\/years|trips\/\d+|timeline|stats\/(?:overview|yearly|monthly|city-rank|map\/stats|map\/cities|map\/routes|map\/photos)|photos\/location\/\d+|config)$/.test(
      url.pathname,
    )
  )
}

/** 照片缩略图：内容按 id 不变，缓存优先。原图体积大且离线时用不上，不缓存 */
export function isThumbnailRequest({ url, sameOrigin, request }: CacheMatchInput): boolean {
  return sameOrigin && request.method === 'GET' && /^\/api\/photos\/\d+\/thumbnail$/.test(url.pathname)
}

/** 打包的字体分片：文件名带内容哈希，缓存优先 */
export function isFontRequest({ url, sameOrigin, request }: CacheMatchInput): boolean {
  return sameOrigin && request.method === 'GET' && url.pathname.endsWith('.woff2')
}
