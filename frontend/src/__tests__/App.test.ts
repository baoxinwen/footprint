import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import App from '../App.vue'
import { searchAll } from '../api/search'

const mockLogout = vi.fn()
const mockPush = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/trips' }),
  useRouter: () => ({ push: mockPush }),
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

    wrapper.unmount()
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

    wrapper.unmount()
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
