import { serviceWorkerContainer } from './serviceWorkerContainer'

/**
 * unsupported：环境不支持，或 Service Worker 尚未注册
 * failed：查询本身失败（通常是离线），不代表已是最新
 * current：已是最新
 * available：有装好的新版本可以切换
 */
export type UpdateCheckResult = 'unsupported' | 'failed' | 'current' | 'available'

/** 正在安装的版本；本模块只关心它的状态变化 */
export interface InstallingWorker {
  readonly state: string
  addEventListener(type: 'statechange', listener: () => void): void
  removeEventListener(type: 'statechange', listener: () => void): void
}

/** 本模块用到的注册对象能力；测试里可以替换 */
export interface CheckableRegistration {
  readonly active: unknown
  readonly waiting: unknown
  readonly installing: InstallingWorker | null
  update(): Promise<unknown>
}

export interface CheckOptions {
  container?: { getRegistration(): Promise<CheckableRegistration | undefined> }
  /** 等新版本装完的最长时间 */
  timeoutMs?: number
}

const INSTALL_TIMEOUT_MS = 15000

/**
 * 手动检查更新：向浏览器查询一次，发现新版本时等它装完再报告可用——
 * 装到一半还不能切换。
 */
export async function checkForUpdate(options: CheckOptions = {}): Promise<UpdateCheckResult> {
  const container = options.container ?? serviceWorkerContainer()
  const registration = container ? await container.getRegistration() : undefined
  if (!registration) return 'unsupported'
  // 上次发现的新版本可能还在等待（用户选过「稍后」），不必重新查询
  if (registration.waiting) return 'available'

  try {
    await registration.update()
  } catch {
    return 'failed'
  }

  // 首次安装还没完成：正在安装的是当前版本自己，不是更新
  if (!registration.active) return 'current'
  if (registration.waiting) return 'available'
  const installing = registration.installing
  if (!installing) return 'current'
  return (await settlesAsInstalled(installing, options.timeoutMs ?? INSTALL_TIMEOUT_MS)) ? 'available' : 'current'
}

/** 等安装结束：进入等待或已激活算成功，被丢弃（安装失败）或超时算失败 */
function settlesAsInstalled(worker: InstallingWorker, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (installed: boolean) => {
      clearTimeout(timer)
      worker.removeEventListener('statechange', onStateChange)
      resolve(installed)
    }
    const onStateChange = () => {
      if (worker.state === 'installed' || worker.state === 'activated') finish(true)
      else if (worker.state === 'redundant') finish(false)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    worker.addEventListener('statechange', onStateChange)
    // 挂监听前可能已经装完
    onStateChange()
  })
}
