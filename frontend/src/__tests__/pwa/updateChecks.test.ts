import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { scheduleUpdateChecks } from '../../pwa/updateChecks'

/** 更新检查只需要注册对象的一个能力：收窄成接口，测试里就能给出完整的替身 */
class RegistrationStub {
  calls = 0
  failNext = false
  update(): Promise<void> {
    this.calls += 1
    return this.failNext ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve()
  }
}

const setVisibility = (state: 'visible' | 'hidden') =>
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })

describe('scheduleUpdateChecks', () => {
  const HOUR = 60 * 60 * 1000
  let stop: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility('visible')
  })

  afterEach(() => {
    stop?.()
    vi.useRealTimers()
    setVisibility('visible')
  })

  const start = (intervalMs = HOUR) => {
    const registration = new RegistrationStub()
    stop = scheduleUpdateChecks(registration, { intervalMs })
    return registration
  }

  it('每小时检查一次，不额外立即检查', () => {
    const registration = start()
    expect(registration.calls).toBe(0)
    vi.advanceTimersByTime(HOUR - 1)
    expect(registration.calls).toBe(0)
    vi.advanceTimersByTime(1)
    vi.advanceTimersByTime(HOUR)
    expect(registration.calls).toBe(2)
  })

  it('页面回到前台时补查一次，切到后台不查', () => {
    const registration = start()
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(registration.calls).toBe(0)
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(registration.calls).toBe(1)
  })

  it('检查失败（如离线）不外抛，之后照常再查', async () => {
    const registration = start()
    registration.failNext = true
    vi.advanceTimersByTime(HOUR)
    registration.failNext = false
    vi.advanceTimersByTime(HOUR)
    await vi.advanceTimersByTimeAsync(0)
    expect(registration.calls).toBe(2)
  })

  it('停止后不再定时检查，也不再响应回到前台', () => {
    const registration = start()
    stop()
    vi.advanceTimersByTime(HOUR * 3)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(registration.calls).toBe(0)
  })
})
