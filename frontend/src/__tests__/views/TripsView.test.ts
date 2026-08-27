import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Mock router
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ query: {} }),
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

describe('TripsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
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
