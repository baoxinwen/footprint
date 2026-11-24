import { serviceWorkerContainer } from './serviceWorkerContainer'

/** 切换消息。生成的 Service Worker 收到后调用 skipWaiting()，让等待中的新版本立即激活 */
const SKIP_WAITING = { type: 'SKIP_WAITING' }

/** 本模块用到的注册对象能力；测试里可以替换 */
export interface SwitchRegistration {
  readonly waiting: { postMessage(data: unknown): void } | null
}

/** 本模块用到的 ServiceWorkerContainer 能力；测试里可以替换 */
export interface SwitchContainer {
  getRegistration(): Promise<SwitchRegistration | undefined>
  addEventListener(type: 'controllerchange', listener: () => void): void
  removeEventListener(type: 'controllerchange', listener: () => void): void
}

export interface ApplyUpdateOptions {
  container?: SwitchContainer
  reload?: () => void
  /** 等新版本接管页面的最长时间，超时也照常重载 */
  timeoutMs?: number
}

const TAKEOVER_TIMEOUT_MS = 8000

/**
 * 切到等待中的新版本并重载页面。
 *
 * 重载由这里负责，不依赖注册脚本的默认行为：它是否把「页面被接管」当作一次更新，
 * 取决于页面加载时是否已被旧版本接管。首次访问的会话——由当前页面自己装好
 * Service Worker 的那一个——里它不会重载，页面会停在旧代码上却由新版本提供服务；
 * 旧页面向新版本要旧的分块文件，而发版后服务器上已经没有了。
 *
 * 切换消息直接发给等待中的版本，所以任何地方都能调用，不必拿到注册脚本的实例。
 */
export async function applyUpdate(options: ApplyUpdateOptions = {}): Promise<void> {
  const container = options.container ?? serviceWorkerContainer()
  const reload = options.reload ?? (() => window.location.reload())

  if (container) {
    try {
      const registration = await container.getRegistration()
      // 没有等待中的版本（比如已被别的标签页切过去）时无从切换，直接重载即可
      if (registration?.waiting) {
        const takenOver = new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer)
            container.removeEventListener('controllerchange', finish)
            resolve()
          }
          const timer = setTimeout(finish, options.timeoutMs ?? TAKEOVER_TIMEOUT_MS)
          container.addEventListener('controllerchange', finish)
        })
        // 监听挂好之后才请求切换：接管可能紧随切换请求到来
        registration.waiting.postMessage(SKIP_WAITING)
        await takenOver
      }
    } catch {
      // 取不到注册信息时同样只能重载
    }
  }

  reload()
}
