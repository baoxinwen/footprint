import { defineComponent, h, nextTick } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isIosBrowser, isStandalone, useInstallPrompt, type InstallPromptEvent } from '../../composables/useInstallPrompt'

enableAutoUnmount(afterEach)

/** 环境探测的替身：默认「既不是独立应用，也不在 iOS 上」 */
const environment = vi.hoisted(() => ({
  standalone: vi.fn(() => false),
  ios: vi.fn(() => false),
}))

/** 挂一个只把当前指引渲染出来的宿主组件 */
function mountHost() {
  let install!: ReturnType<typeof useInstallPrompt>
  const Host = defineComponent({
    setup() {
      install = useInstallPrompt(environment)
      return () => h('p', install.guide.value)
    },
  })
  const wrapper = mount(Host)
  return { wrapper, install }
}

/** 浏览器在满足安装条件时派发的事件 */
function installPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as InstallPromptEvent
  return Object.assign(event, {
    prompt: vi.fn(async () => undefined),
    get userChoice() {
      return Promise.resolve({ outcome, platform: 'web' })
    },
  })
}

describe('useInstallPrompt', () => {
  beforeEach(() => {
    environment.standalone.mockReturnValue(false)
    environment.ios.mockReturnValue(false)
  })

  it('浏览器还没提供安装对话框时：给文字指引', () => {
    const { wrapper } = mountHost()
    expect(wrapper.text()).toBe('instructions')
  })

  it('浏览器提供安装对话框后改为显示安装按钮，并接管浏览器自带的安装提示', async () => {
    const { wrapper } = mountHost()
    const event = installPromptEvent()

    window.dispatchEvent(event)
    await nextTick()

    expect(event.defaultPrevented).toBe(true)
    expect(wrapper.text()).toBe('native')
  })

  it('点安装会弹出原生对话框；这个对话框事件只能用一次', async () => {
    const { wrapper, install } = mountHost()
    const event = installPromptEvent('accepted')
    window.dispatchEvent(event)
    await nextTick()

    expect(await install.promptInstall()).toBe('accepted')
    expect(event.prompt).toHaveBeenCalledTimes(1)
    // 用完即失效，回到文字指引；再点不会重复弹出
    expect(wrapper.text()).toBe('instructions')
    expect(await install.promptInstall()).toBe('unavailable')
    expect(event.prompt).toHaveBeenCalledTimes(1)
  })

  it('用户在对话框里取消时如实返回', async () => {
    const { install } = mountHost()
    window.dispatchEvent(installPromptEvent('dismissed'))
    await nextTick()

    expect(await install.promptInstall()).toBe('dismissed')
  })

  it('没有可用的对话框时（比如还没等到事件）不会报错', async () => {
    const { install } = mountHost()

    expect(await install.promptInstall()).toBe('unavailable')
  })

  it('已经作为独立应用运行时整行隐藏，即便浏览器仍派发安装事件', async () => {
    environment.standalone.mockReturnValue(true)
    const { wrapper } = mountHost()
    window.dispatchEvent(installPromptEvent())
    await nextTick()

    expect(wrapper.text()).toBe('hidden')
  })

  it('安装完成后隐藏', async () => {
    const { wrapper } = mountHost()
    window.dispatchEvent(installPromptEvent())
    await nextTick()
    expect(wrapper.text()).toBe('native')

    window.dispatchEvent(new Event('appinstalled'))
    await nextTick()

    expect(wrapper.text()).toBe('hidden')
  })

  it('iOS 上的浏览器没有安装对话框：给固定的 Safari 步骤', () => {
    environment.ios.mockReturnValue(true)

    const { wrapper } = mountHost()

    expect(wrapper.text()).toBe('ios')
  })

  it('卸载时移除自己挂上的全部监听，不留残余', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')

    mountHost().wrapper.unmount()

    expect(add.mock.calls.map(([type]) => type)).toEqual(['beforeinstallprompt', 'appinstalled'])
    expect(remove.mock.calls).toEqual(add.mock.calls)
    add.mockRestore()
    remove.mockRestore()
  })
})

describe('安装环境探测', () => {
  const originalMatchMedia = window.matchMedia
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  /** 只让指定的媒体查询命中 */
  function matchMediaMatching(query: string) {
    window.matchMedia = vi.fn((candidate: string | number) => ({
      matches: candidate === query,
      media: candidate,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia
  }

  it('以独立窗口或全屏方式运行时算作已安装；普通浏览器标签页不算', () => {
    matchMediaMatching('(display-mode: standalone)')
    expect(isStandalone()).toBe(true)

    matchMediaMatching('(display-mode: fullscreen)')
    expect(isStandalone()).toBe(true)

    matchMediaMatching('(prefers-color-scheme: dark)')
    expect(isStandalone()).toBe(false)
  })

  it('iOS 主屏上的 standalone 标记也算已安装', () => {
    matchMediaMatching('(prefers-color-scheme: dark)')
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
    expect(isStandalone()).toBe(true)
  })

  it.each([
    ['iPhone 上的 Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1', 5, true],
    ['iPadOS 13 起（把自己报成 Macintosh，靠触控点数识别）', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15', 5, true],
    ['Android 上的 Chrome', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36', 5, false],
    ['桌面 Chrome', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36', 0, false],
    ['带触控屏的 Mac 之外：Windows 触屏设备不是 iOS', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36', 10, false],
  ])('%s', (_label, userAgent, maxTouchPoints, expected) => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: userAgent })
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: maxTouchPoints })

    expect(isIosBrowser()).toBe(expected)
  })
})
