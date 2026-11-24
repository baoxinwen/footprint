/** 能触发更新检查的注册对象——ServiceWorkerRegistration 上本模块唯一用到的能力 */
export interface UpdatableRegistration {
  update(): Promise<unknown>
}

/** 可见性事件的宿主；默认是 document，测试里可以替换 */
export interface VisibilitySource {
  readonly visibilityState: string
  addEventListener(type: 'visibilitychange', listener: EventListenerOrEventListenerObject): void
  removeEventListener(type: 'visibilitychange', listener: EventListenerOrEventListenerObject): void
}

const HOUR_IN_MS = 60 * 60 * 1000

/**
 * 定期检查与回到前台时检查 Service Worker 更新，返回停止函数。
 *
 * 浏览器自己只在页面加载和功能性事件时检查更新（后者最多每 24 小时一次），
 * 对常驻后台的 PWA 不够及时。检查失败（例如离线）静默跳过，下次再查。
 */
export function scheduleUpdateChecks(
  registration: UpdatableRegistration,
  options: { intervalMs?: number; visibility?: VisibilitySource } = {},
): () => void {
  const intervalMs = options.intervalMs ?? HOUR_IN_MS
  const visibility = options.visibility ?? document

  const check = () => {
    void registration.update().catch(() => undefined)
  }
  const onVisibilityChange = () => {
    if (visibility.visibilityState === 'visible') check()
  }

  const timer = window.setInterval(check, intervalMs)
  visibility.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    window.clearInterval(timer)
    visibility.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
