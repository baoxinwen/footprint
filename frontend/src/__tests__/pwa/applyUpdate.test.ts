import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { applyUpdate } from '../../pwa/applyUpdate'

/** 最小的 ServiceWorkerContainer 替身：只报告「等待中的版本」，并能模拟新版本接管页面 */
function fakeContainer(waiting: object | null) {
  const listeners = new Set<() => void>()
  return {
    getRegistration: vi.fn(async () => ({ waiting })),
    addEventListener: vi.fn((_type: 'controllerchange', listener: () => void) => {
      listeners.add(listener)
    }),
    removeEventListener: vi.fn((_type: 'controllerchange', listener: () => void) => {
      listeners.delete(listener)
    }),
    claim: () => {
      listeners.forEach((listener) => listener())
    },
    listenerCount: () => listeners.size,
  }
}

describe('切换到新版本', () => {
  const reload = vi.fn()
  const askToSwitch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('有等待中的版本时：先监听页面被接管，再请求切换，被接管后才重载', async () => {
    const container = fakeContainer({})

    const switching = applyUpdate(askToSwitch, { container, reload })
    await flushPromises()

    expect(askToSwitch).toHaveBeenCalledTimes(1)
    // 顺序不能反：接管可能紧随切换请求到来，监听挂晚了就会错过
    expect(container.addEventListener.mock.invocationCallOrder[0]).toBeLessThan(askToSwitch.mock.invocationCallOrder[0])
    expect(container.addEventListener).toHaveBeenCalledWith('controllerchange', expect.any(Function))
    expect(reload).not.toHaveBeenCalled()

    container.claim()
    await switching

    expect(reload).toHaveBeenCalledTimes(1)
    expect(container.listenerCount()).toBe(0)
  })

  it('没有等待中的版本时（比如已被别的标签页切换）：不请求切换，直接重载', async () => {
    const container = fakeContainer(null)

    await applyUpdate(askToSwitch, { container, reload })

    expect(askToSwitch).not.toHaveBeenCalled()
    expect(container.addEventListener).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('取不到注册信息时（环境不支持 Service Worker）不抛出，照样重载', async () => {
    const container = fakeContainer({})
    container.getRegistration.mockRejectedValue(new Error('unsupported'))

    await expect(applyUpdate(askToSwitch, { container, reload })).resolves.toBeUndefined()

    expect(askToSwitch).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('新版本迟迟不接管页面时：到时间照样重载，不留一个没有反应的按钮', async () => {
    const container = fakeContainer({})

    const switching = applyUpdate(askToSwitch, { container, reload, timeoutMs: 300 })
    await flushPromises()
    await vi.advanceTimersByTimeAsync(299)
    expect(reload).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await switching

    expect(reload).toHaveBeenCalledTimes(1)
    expect(container.listenerCount()).toBe(0)
  })
})
