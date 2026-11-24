import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { checkForUpdate } from '../../pwa/checkForUpdate'

/** 仍在安装中的版本：只报告状态变化 */
function installingWorker() {
  const listeners = new Set<() => void>()
  const worker = {
    state: 'installing',
    addEventListener: vi.fn((_type: 'statechange', listener: () => void) => {
      listeners.add(listener)
    }),
    removeEventListener: vi.fn((_type: 'statechange', listener: () => void) => {
      listeners.delete(listener)
    }),
    moveTo(state: string) {
      worker.state = state
      listeners.forEach((listener) => listener())
    },
    listenerCount: () => listeners.size,
  }
  return worker
}

/** 最小的注册对象替身。newVersionState：调用 update() 后新版本所处的阶段，'none' 表示没有新版本 */
function fakeRegistration({
  newVersionState = 'none',
  hasActive = true,
  waiting = null,
}: { newVersionState?: 'none' | 'installing' | 'waiting'; hasActive?: boolean; waiting?: object | null } = {}) {
  const registration = {
    active: hasActive ? {} : null,
    waiting,
    installing: null as ReturnType<typeof installingWorker> | null,
    update: vi.fn(async () => {
      if (newVersionState === 'installing') registration.installing = installingWorker()
      if (newVersionState === 'waiting') registration.waiting = {}
    }),
  }
  return registration
}

/** 取出安装中的版本；测试走到这里时它必须存在，否则说明 update() 没有产生新版本 */
function installingOf(registration: ReturnType<typeof fakeRegistration>) {
  if (!registration.installing) throw new Error('没有正在安装的新版本')
  return registration.installing
}

const containerOf = (registration: ReturnType<typeof fakeRegistration> | undefined) => ({
  getRegistration: vi.fn(async () => registration),
})

describe('手动检查更新', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('环境不支持 Service Worker，或尚未注册时：无法检查', async () => {
    expect(await checkForUpdate({ container: undefined })).toBe('unsupported')
    expect(await checkForUpdate({ container: containerOf(undefined) })).toBe('unsupported')
  })

  it('上次发现的新版本还在等待（用户选过「稍后」）：不必重新检查，直接可用', async () => {
    const registration = fakeRegistration({ waiting: { postMessage: vi.fn() } })

    expect(await checkForUpdate({ container: containerOf(registration) })).toBe('available')
    expect(registration.update).not.toHaveBeenCalled()
  })

  it('向浏览器查询一次；没有新版本时如实告知', async () => {
    const registration = fakeRegistration()
    const container = containerOf(registration)

    expect(await checkForUpdate({ container })).toBe('current')
    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('首次安装还没完成时不把「正在安装的自己」当成新版本', async () => {
    const registration = fakeRegistration({ hasActive: false, newVersionState: 'installing' })

    expect(await checkForUpdate({ container: containerOf(registration) })).toBe('current')
  })

  it('查询失败（如离线）与「已是最新」是两回事', async () => {
    const registration = fakeRegistration()
    registration.update.mockRejectedValue(new TypeError('Failed to fetch'))

    expect(await checkForUpdate({ container: containerOf(registration) })).toBe('failed')
  })

  it('发现新版本后等它装完再报告可用——装到一半还不能切换', async () => {
    const registration = fakeRegistration({ newVersionState: 'installing' })

    const checking = checkForUpdate({ container: containerOf(registration) })
    await flushPromises()
    expect(registration.installing).not.toBeNull()
    const settled = vi.fn()
    void checking.then(settled)
    await flushPromises()
    expect(settled).not.toHaveBeenCalled()

    installingOf(registration).moveTo('installed')
    expect(await checking).toBe('available')
    expect(installingOf(registration).listenerCount()).toBe(0)
  })

  it('新版本在查询返回前就已装好（进入等待）：直接可用', async () => {
    const registration = fakeRegistration({ newVersionState: 'waiting' })

    expect(await checkForUpdate({ container: containerOf(registration) })).toBe('available')
    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('新版本安装失败时不算可用', async () => {
    const registration = fakeRegistration({ newVersionState: 'installing' })

    const checking = checkForUpdate({ container: containerOf(registration) })
    await flushPromises()
    installingOf(registration).moveTo('redundant')

    expect(await checking).toBe('current')
    expect(installingOf(registration).listenerCount()).toBe(0)
  })

  it('新版本迟迟装不完：到时间按「已是最新」收尾', async () => {
    const registration = fakeRegistration({ newVersionState: 'installing' })

    const checking = checkForUpdate({ container: containerOf(registration), timeoutMs: 300 })
    await flushPromises()
    await vi.advanceTimersByTimeAsync(300)

    expect(await checking).toBe('current')
    expect(installingOf(registration).listenerCount()).toBe(0)
  })
})
