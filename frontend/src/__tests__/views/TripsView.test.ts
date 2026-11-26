import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Mock router
const mockPush = vi.fn()
const routeState = vi.hoisted(() => ({ query: {} as Record<string, unknown> }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ query: routeState.query }),
  createRouter: vi.fn(() => ({ beforeEach: vi.fn() })),
  createWebHistory: vi.fn(),
}))

// Mock API
vi.mock('../../api/trips', () => ({
  getTrips: vi.fn(),
  getTripCities: vi.fn(),
  getTripYears: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn() },
  }
})

import TripsView from '../../views/TripsView.vue'
import { getTrips, getTripCities, getTripYears } from '../../api/trips'

// 每个用例结束后卸载：残留的实例会跟着后续用例改动的共享状态一起反应
enableAutoUnmount(afterEach)

describe('TripsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    routeState.query = {}
  })

  it('filters by city when arriving with ?city= from the map or rankings (I-17)', async () => {
    // 回归（评审 I-17）：城市标记/排行榜跳转带的 query.city 应走 city 筛选，
    // 而不是塞进全文搜索——否则标记写「3 次」列表却「找到 5 条」
    routeState.query = { city: '北京' }
    vi.mocked(getTrips).mockResolvedValue({
      data: { items: [], total: 0, page: 1, page_size: 20 },
    } as any)
    vi.mocked(getTripCities).mockResolvedValue({ data: [] } as any)
    vi.mocked(getTripYears).mockResolvedValue({ data: [] } as any)

    mount(TripsView, {
      global: { stubs: { ElMessage: true, ElButton: true, ElInput: true, ElSelect: true, ElOption: true, ElPagination: true } },
    })
    await flushPromises()

    expect(getTrips).toHaveBeenCalledWith(expect.objectContaining({ city: '北京', search: '' }))
  })

  it('falls back to the last page when the current page becomes empty (M-21)', async () => {
    // 回归（评审 M-21）：另一会话删数据后本页停在空页——
    // 曾显示「还没有旅行记录」且分页器消失，无法返回
    vi.mocked(getTrips).mockResolvedValue({
      data: {
        items: [{ id: 7, title: '剩余的旅行', cities: [], location_count: 0, start_date: '2026-01-01', end_date: '2026-01-02' }],
        total: 20, page: 1, page_size: 20,
      },
    } as any)
    vi.mocked(getTripCities).mockResolvedValue({ data: [] } as any)
    vi.mocked(getTripYears).mockResolvedValue({ data: [] } as any)

    const wrapper = mount(TripsView, {
      global: { stubs: { ElMessage: true, ElButton: true, ElInput: true, ElSelect: true, ElOption: true, ElPagination: true } },
    })
    await flushPromises()
    vi.mocked(getTrips).mockClear()

    // 翻到第 2 页时数据被删空：返回空页后应回退最后一页重取
    vi.mocked(getTrips)
      .mockResolvedValueOnce({ data: { items: [], total: 20, page: 2, page_size: 20 } } as any)
      .mockResolvedValueOnce({
        data: {
          items: [{ id: 7, title: '剩余的旅行', cities: [], location_count: 0, start_date: '2026-01-01', end_date: '2026-01-02' }],
          total: 20, page: 1, page_size: 20,
        },
      } as any)

    const vm: any = wrapper.vm
    vm.page = 2
    await vm.loadTrips()

    expect(getTrips).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }))
    expect(vm.trips).toHaveLength(1)
  })

  it('renders trip list page', async () => {
    vi.mocked(getTrips).mockResolvedValue({
      data: { items: [], total: 0, page: 1, page_size: 20 },
    } as any)
    vi.mocked(getTripCities).mockResolvedValue({ data: [] } as any)
    vi.mocked(getTripYears).mockResolvedValue({ data: [] } as any)

    const wrapper = mount(TripsView, {
      global: { stubs: { ElMessage: true, ElButton: true, ElInput: true, ElSelect: true, ElOption: true, ElPagination: true } },
    })
    expect(wrapper.exists()).toBe(true)
  })

  it('displays empty state when no trips', async () => {
    vi.mocked(getTrips).mockResolvedValue({
      data: { items: [], total: 0, page: 1, page_size: 20 },
    } as any)
    vi.mocked(getTripCities).mockResolvedValue({ data: [] } as any)
    vi.mocked(getTripYears).mockResolvedValue({ data: [] } as any)

    const wrapper = mount(TripsView, {
      global: { stubs: { ElMessage: true, ElButton: true, ElInput: true, ElSelect: true, ElOption: true, ElPagination: true } },
    })

    // Wait for async operations
    await vi.waitFor(() => {
      expect(getTrips).toHaveBeenCalled()
    })
  })

  it('loads filter options on mount', async () => {
    vi.mocked(getTrips).mockResolvedValue({
      data: { items: [], total: 0, page: 1, page_size: 20 },
    } as any)
    vi.mocked(getTripCities).mockResolvedValue({ data: ['北京', '上海'] } as any)
    vi.mocked(getTripYears).mockResolvedValue({ data: [2025, 2024] } as any)

    mount(TripsView, {
      global: { stubs: { ElMessage: true, ElButton: true, ElInput: true, ElSelect: true, ElOption: true, ElPagination: true } },
    })

    await vi.waitFor(() => {
      expect(getTripCities).toHaveBeenCalled()
      expect(getTripYears).toHaveBeenCalled()
    })
  })

  it('keeps the search clear button touch target at least 44 by 44 pixels', async () => {
    vi.mocked(getTrips).mockResolvedValue({
      data: { items: [], total: 0, page: 1, page_size: 20 },
    } as any)
    vi.mocked(getTripCities).mockResolvedValue({ data: [] } as any)
    vi.mocked(getTripYears).mockResolvedValue({ data: [] } as any)
    const wrapper = mount(TripsView)

    await wrapper.get<HTMLInputElement>('.search-input').setValue('北京')
    const clear = wrapper.get('.search-clear').element
    const style = window.getComputedStyle(clear)

    expect(Number.parseFloat(style.width)).toBeGreaterThanOrEqual(44)
    expect(Number.parseFloat(style.height)).toBeGreaterThanOrEqual(44)
  })

  it('keeps active-filter remove buttons at least 44 by 44 pixels', async () => {
    vi.mocked(getTrips).mockResolvedValue({
      data: { items: [], total: 0, page: 1, page_size: 20 },
    } as any)
    vi.mocked(getTripCities).mockResolvedValue({ data: [] } as any)
    vi.mocked(getTripYears).mockResolvedValue({ data: [2025] } as any)
    const wrapper = mount(TripsView)

    await wrapper.get('.filter-toggle').trigger('click')
    await wrapper.get<HTMLSelectElement>('#filter-year').setValue('2025')
    await wrapper.get('.filter-toggle').trigger('click')
    const remove = wrapper.get('.filter-tag button').element
    const style = window.getComputedStyle(remove)

    expect(Number.parseFloat(style.width)).toBeGreaterThanOrEqual(44)
    expect(Number.parseFloat(style.height)).toBeGreaterThanOrEqual(44)
  })

  it('supports opening a trip entry with the keyboard', async () => {
    vi.mocked(getTrips).mockResolvedValue({
      data: {
        items: [{
          id: 7,
          title: '山海之间',
          description: '从青岛沿海岸向南',
          start_date: '2025-05-01',
          end_date: '2025-05-04',
          created_at: '2025-05-01T00:00:00',
          updated_at: '2025-05-01T00:00:00',
          location_count: 3,
          cities: ['青岛', '日照'],
        }],
        total: 1,
        page: 1,
        page_size: 20,
      },
    } as any)
    vi.mocked(getTripCities).mockResolvedValue({ data: ['青岛', '日照'] } as any)
    vi.mocked(getTripYears).mockResolvedValue({ data: [2025] } as any)

    const wrapper = mount(TripsView)
    await vi.waitFor(() => expect(wrapper.find('.card-hit').exists()).toBe(true))

    const entry = wrapper.get('.card-hit')
    expect(entry.element.tagName).toBe('BUTTON')
    await entry.trigger('keydown.enter')
    expect(mockPush).toHaveBeenCalledWith('/trips/7')
  })

  it('shows a retryable error state instead of an empty archive when loading fails', async () => {
    vi.mocked(getTrips).mockRejectedValue(new Error('Network error'))
    vi.mocked(getTripCities).mockResolvedValue({ data: [] } as any)
    vi.mocked(getTripYears).mockResolvedValue({ data: [] } as any)

    const wrapper = mount(TripsView)

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('旅行列表加载失败')
    })
    expect(wrapper.get('[aria-label="重新加载旅行列表"]')).toBeTruthy()
    expect(wrapper.text()).not.toContain('还没有旅行记录')
  })
})
