import { API_DATA_CACHE, THUMBNAIL_CACHE } from '../pwa/cachePolicy'

/** 含用户私人数据的缓存（接口快照与缩略图）：登录态变化时整库删除 */
const PRIVATE_CACHES: readonly string[] = [API_DATA_CACHE, THUMBNAIL_CACHE]

/** 非安全上下文（HTTP）与测试环境里没有 Cache Storage */
const cacheStorage = (): CacheStorage | undefined => (typeof caches === 'undefined' ? undefined : caches)

/**
 * 清掉离线缓存里的私人数据，不动字体与应用壳预缓存。
 * 以不等待的方式被调用，所以永不拒绝；清不掉时至少在控制台留痕。
 */
export async function clearPrivateCaches(): Promise<void> {
  const storage = cacheStorage()
  if (!storage) return
  try {
    const names = await storage.keys()
    await Promise.all(names.filter((name) => PRIVATE_CACHES.includes(name)).map((name) => storage.delete(name)))
  } catch (error) {
    console.warn('清理离线缓存中的私人数据失败', error)
  }
}

/** 照片删除后移除它的缩略图，避免已删除的内容继续留在设备上 */
export async function forgetCachedThumbnail(photoId: number): Promise<void> {
  const storage = cacheStorage()
  if (!storage) return
  try {
    if (!(await storage.has(THUMBNAIL_CACHE))) return
    const cache = await storage.open(THUMBNAIL_CACHE)
    await cache.delete(`/api/photos/${photoId}/thumbnail`)
  } catch (error) {
    console.warn('移除已删除照片的缩略图缓存失败', photoId, error)
  }
}
