/**
 * 内存版 Cache Storage，供涉及离线缓存的测试使用。
 * Cache 与 CacheStorage 两个接口的方法全部实现——替身不缺字段，
 * 被测代码调到哪个方法都不会因为 mock 不完整而静默通过。
 */

/**
 * 解析缓存键。浏览器会把相对路径按页面地址解析；Node 环境里的 Request 没有这个基准，
 * 这里按页面 origin 补上，使替身与浏览器行为一致
 */
const toHref = (request: RequestInfo | URL): string => {
  if (request instanceof Request) return request.url
  return typeof request === 'string' ? new URL(request, location.origin).href : request.href
}

export class FakeCache implements Cache {
  private entries = new Map<string, Response>()

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    return this.entries.get(toHref(request))?.clone()
  }

  async matchAll(): Promise<Response[]> {
    return [...this.entries.values()].map((response) => response.clone())
  }

  async add(request: RequestInfo | URL): Promise<void> {
    await this.put(request, new Response('added'))
  }

  async addAll(requests: RequestInfo | URL[]): Promise<void> {
    await Promise.all(requests.map((request) => this.add(request)))
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.entries.set(toHref(request), response.clone())
  }

  async delete(request: RequestInfo | URL): Promise<boolean> {
    return this.entries.delete(toHref(request))
  }

  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((href) => new Request(href))
  }
}

export class FakeCacheStorage implements CacheStorage {
  private stores = new Map<string, FakeCache>()

  async open(cacheName: string): Promise<Cache> {
    let cache = this.stores.get(cacheName)
    if (!cache) {
      cache = new FakeCache()
      this.stores.set(cacheName, cache)
    }
    return cache
  }

  async has(cacheName: string): Promise<boolean> {
    return this.stores.has(cacheName)
  }

  async keys(): Promise<string[]> {
    return [...this.stores.keys()]
  }

  async delete(cacheName: string): Promise<boolean> {
    return this.stores.delete(cacheName)
  }

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    for (const cache of this.stores.values()) {
      const hit = await cache.match(request)
      if (hit) return hit
    }
    return undefined
  }

  /** 往指定缓存里放进几条响应，返回这些条目的完整 URL（按页面 origin 解析） */
  async seed(cacheName: string, paths: string[]): Promise<void> {
    const cache = (await this.open(cacheName)) as FakeCache
    for (const path of paths) {
      await cache.put(path, new Response(`body of ${path}`))
    }
  }

  /** 某个缓存里现存的条目，返回完整 URL 列表 */
  async urls(cacheName: string): Promise<string[]> {
    const cache = this.stores.get(cacheName)
    return cache ? (await cache.keys()).map((request) => request.url) : []
  }
}
