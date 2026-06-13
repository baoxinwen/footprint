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
})
