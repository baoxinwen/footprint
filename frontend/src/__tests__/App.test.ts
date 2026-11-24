import { defineComponent, ref } from 'vue'
import type { Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { flushPromises, mount, enableAutoUnmount } from '@vue/test-utils'
import { ElMessage } from 'element-plus'
import App from '../App.vue'
import { searchAll } from '../api/search'
import { goOffline, goOnline, setOnline } from './pwa/onlineStatus'

// 每个用例结束后卸载：残留的实例会跟着后续用例改动的共享状态一起反应
enableAutoUnmount(afterEach)

const mockLogout = vi.fn()
const mockPush = vi.fn()
const mockRoute = { path: '/trips' }

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: mockPush }),
}))

// 自动导入的组件也从 element-plus 取，所以只替换 ElMessage、保留其余导出
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn() },
  }
})

// 插件的虚拟模块在测试环境里加载不了（它的标识不是磁盘路径，内部又有对 vue 的
// 裸导入），换成可从测试外部驱动的替身
type SwFake = {
  needRefresh: Ref<boolean>
  offlineReady: Ref<boolean>
  updateServiceWorker: Mock
  registerOptions: unknown
}
const sw = vi.hoisted(() => ({ state: undefined as SwFake | undefined }))

vi.mock('virtual:pwa-register/vue', () => ({
  // 只在挂载组件时被调用，那时下方创建的替身状态已经就绪
  useRegisterSW: (options: unknown) => {
    const state = sw.state
    if (!state) throw new Error('Service Worker 替身尚未初始化')
    state.registerOptions = options
    return {
      needRefresh: state.needRefresh,
      offlineReady: state.offlineReady,
      updateServiceWorker: state.updateServiceWorker,
    }
  },
}))

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({ logout: mockLogout }),
}))

vi.mock('../composables/useTheme', () => ({
  useTheme: () => ({ themeMode: ref('auto'), setTheme: vi.fn() }),
}))

vi.mock('../api/search', () => ({ searchAll: vi.fn() }))

const RouterLinkStub = defineComponent({
  props: { to: [String, Object] },
  template: '<a><slot /></a>',
})

const swState: SwFake = {
  needRefresh: ref(false),
  offlineReady: ref(false),
  updateServiceWorker: vi.fn(),
  registerOptions: undefined,
}
sw.state = swState

// 这个替身在 App.vue 被引入时（早于本文件顶层的语句）就会被用到，必须经 vi.hoisted 提前创建
const mockApplyUpdate = vi.hoisted(() => vi.fn())
vi.mock('../pwa/applyUpdate', () => ({ applyUpdate: mockApplyUpdate }))

function mountApp(attachTo?: Element) {
  return mount(App, {
    ...(attachTo ? { attachTo } : {}),
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        RouterView: true,
        ElIcon: true,
        Location: true,
        Suitcase: true,
        Calendar: true,
        DataAnalysis: true,
        Moon: true,
        Sunny: true,
        Refresh: true,
        Search: true,
        Setting: true,
        SwitchButton: true,
        Close: true,
      },
    },
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('App global search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  it('does not let an older search response overwrite newer results', async () => {
    const first = deferred<any>()
    const second = deferred<any>()
    vi.mocked(searchAll)
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const wrapper = mountApp()
    await wrapper.get('.search-btn').trigger('click')
    const input = wrapper.findAll<HTMLInputElement>('.search-input')[0]

    await input.setValue('北')
    await vi.advanceTimersByTimeAsync(300)
    await input.setValue('北京')
    await vi.advanceTimersByTimeAsync(300)

    const calls = vi.mocked(searchAll).mock.calls as unknown as Array<[string, { signal: AbortSignal }]>
    expect(calls[0][1].signal.aborted).toBe(true)
    expect(calls[1][1].signal.aborted).toBe(false)

    second.resolve({ data: { trips: [{ id: 2, title: '北京新结果', start_date: '2026-01-01', end_date: '2026-01-02' }], locations: [] } })
    await flushPromises()
    expect(wrapper.text()).toContain('北京新结果')

    first.resolve({ data: { trips: [{ id: 1, title: '过期结果', start_date: '2025-01-01', end_date: '2025-01-02' }], locations: [] } })
    await flushPromises()
    expect(wrapper.text()).toContain('北京新结果')
    expect(wrapper.text()).not.toContain('过期结果')
  })

  it('cancels a pending debounce when search closes', async () => {
    const wrapper = mountApp()
    await wrapper.get('.search-btn').trigger('click')
    await wrapper.findAll<HTMLInputElement>('.search-input')[0].setValue('北京')
    await wrapper.findAll('.search-close')[0].trigger('click')
    await vi.advanceTimersByTimeAsync(300)

    expect(searchAll).not.toHaveBeenCalled()
  })

  it('restores focus to the desktop search button when search closes', async () => {
    const wrapper = mountApp(document.body)

    await wrapper.get('.search-btn').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.findAll<HTMLInputElement>('.search-input')[0].element)

    await wrapper.findAll('.search-close')[0].trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('.search-btn').element)
  })

  it('restores focus to the mobile search button when mobile search closes', async () => {
    const wrapper = mountApp(document.body)
    const mobileSearchButton = wrapper.get('.mobile-top-actions button[aria-label="打开搜索"]')

    await mobileSearchButton.trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get<HTMLInputElement>('.mobile-search-bar .search-input').element)

    await wrapper.get('.mobile-search-bar .search-close').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('.mobile-top-actions button[aria-label="打开搜索"]').element)
  })

  it('aborts an in-flight request when search closes', async () => {
    const request = deferred<any>()
    vi.mocked(searchAll).mockImplementation(() => request.promise)
    const wrapper = mountApp()
    await wrapper.get('.search-btn').trigger('click')
    await wrapper.findAll<HTMLInputElement>('.search-input')[0].setValue('北京')
    await vi.advanceTimersByTimeAsync(300)

    const calls = vi.mocked(searchAll).mock.calls as unknown as Array<[string, { signal: AbortSignal }]>
    await wrapper.findAll('.search-close')[0].trigger('click')
    expect(calls[0][1].signal.aborted).toBe(true)

    request.resolve({ data: { trips: [{ id: 1, title: '关闭后的结果' }], locations: [] } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('关闭后的结果')
  })

  it('gives accessible names to icon-only navigation buttons', async () => {
    const wrapper = mountApp()

    expect(wrapper.get('.theme-btn').attributes('aria-label')).toBe('切换主题')
    expect(wrapper.get('.search-btn').attributes('aria-label')).toBe('打开搜索')
    expect(wrapper.findAll('.nav-right .nav-btn')[2].attributes('aria-label')).toBe('打开设置')
    expect(wrapper.get('.nav-btn-logout').attributes('aria-label')).toBe('退出登录')

    await wrapper.get('.search-btn').trigger('click')
    expect(wrapper.findAll('.search-close')[0].attributes('aria-label')).toBe('关闭搜索')
  })

  it('uses vector icons rather than emoji for structural search results', async () => {
    vi.mocked(searchAll).mockResolvedValue({
      data: {
        trips: [{ id: 1, title: '北京行', start_date: '2026-01-01', end_date: '2026-01-02' }],
        locations: [{ id: 2, trip_id: 1, name: '故宫', city: '北京', trip_title: '北京行' }],
      },
    } as any)
    const wrapper = mountApp()
    await wrapper.get('.search-btn').trigger('click')
    await wrapper.findAll<HTMLInputElement>('.search-input')[0].setValue('北京')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()

    expect(wrapper.html()).not.toMatch(/[🔍✈📍]/u)
    const resultIcons = wrapper.findAll('.search-item-icon')
    expect(resultIcons).toHaveLength(4)
    expect(resultIcons.every(icon => icon.text() === '')).toBe(true)
  })

  it('uses native controls for the clickable logo and search results', async () => {
    vi.mocked(searchAll).mockResolvedValue({
      data: {
        trips: [{ id: 7, title: '苏州园林', start_date: '2026-04-01', end_date: '2026-04-03' }],
        locations: [{ id: 8, trip_id: 7, name: '拙政园', city: '苏州', trip_title: '苏州园林' }],
      },
    } as any)
    const wrapper = mountApp()

    const logo = wrapper.get('.logo')
    expect(logo.element.tagName).toBe('BUTTON')
    expect(logo.attributes('type')).toBe('button')
    await logo.trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/')

    await wrapper.get('.search-btn').trigger('click')
    await wrapper.findAll<HTMLInputElement>('.search-input')[0].setValue('苏州')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()

    const results = wrapper.findAll('.search-item')
    expect(results).toHaveLength(4)
    expect(results.every(result => result.element.tagName === 'BUTTON')).toBe(true)
    expect(results.every(result => result.attributes('type') === 'button')).toBe(true)

    await results[0].trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/trips/7')
  })
})

describe('App offline and update wiring', () => {
  const HOUR = 60 * 60 * 1000

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    setOnline(true)
    mockRoute.path = '/trips'
    swState.needRefresh.value = false
    swState.offlineReady.value = false
    swState.registerOptions = undefined
  })
  afterEach(() => setOnline(true))

  it('registers at once, then checks for updates on a timer and on returning to the foreground until unmounted', async () => {
    const registration = { update: vi.fn().mockResolvedValue(undefined) }
    const wrapper = mountApp()

    expect(swState.registerOptions).toEqual({ immediate: true, onRegisteredSW: expect.any(Function) })
    const { onRegisteredSW } = swState.registerOptions as { onRegisteredSW: (url: string, reg: typeof registration) => void }
    onRegisteredSW('/sw.js', registration)
    expect(registration.update).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(HOUR)
    expect(registration.update).toHaveBeenCalledTimes(1)

    document.dispatchEvent(new Event('visibilitychange'))
    expect(registration.update).toHaveBeenCalledTimes(2)

    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(HOUR)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(registration.update).toHaveBeenCalledTimes(2)
  })

  it('offers a waiting update and switches only when the user asks for it', async () => {
    const wrapper = mountApp()
    expect(wrapper.find('.update-prompt').exists()).toBe(false)

    swState.needRefresh.value = true
    await flushPromises()
    expect(wrapper.get('.update-prompt').text()).toBe('有新版本可用稍后立即刷新')
    expect(swState.updateServiceWorker).not.toHaveBeenCalled()

    await wrapper.get('.update-btn-primary').trigger('click')
    // 重载由 applyUpdate 负责：它要等到新版本接管页面才动手，
    // 注册脚本的切换请求只是它拿到的一个参数
    expect(mockApplyUpdate).toHaveBeenCalledTimes(1)
    expect(mockApplyUpdate).toHaveBeenCalledWith(swState.updateServiceWorker)
    expect(swState.updateServiceWorker).not.toHaveBeenCalled()
  })

  it('tells the user once the app has been cached for offline use', async () => {
    mountApp()
    expect(ElMessage.success).not.toHaveBeenCalled()

    swState.offlineReady.value = true
    await flushPromises()
    expect(ElMessage.success).toHaveBeenCalledTimes(1)
    expect(ElMessage.success).toHaveBeenCalledWith({ message: '已可离线使用', duration: 4000 })
  })

  it('shows a single offline banner between the top bar and the content while offline', async () => {
    const wrapper = mountApp()
    expect(wrapper.find('.offline-banner').exists()).toBe(false)

    await goOffline()

    const banner = wrapper.get('.offline-banner')
    expect(banner.classes()).toEqual(['offline-banner'])
    expect(banner.attributes('role')).toBe('status')
    expect(banner.text()).toBe('当前离线，显示的是已缓存的内容；保存和删除需要联网')
    expect(wrapper.findAll('.offline-banner')).toHaveLength(1)

    const main = wrapper.get('main').element
    expect(banner.element.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await goOnline()
    expect(wrapper.find('.offline-banner').exists()).toBe(false)
  })

  it('floats the offline banner on pages without a top bar', async () => {
    mockRoute.path = '/login'
    const wrapper = mountApp()

    await goOffline()

    expect(wrapper.get('.offline-banner').classes()).toEqual(['offline-banner', 'offline-banner-fixed'])
  })
})
