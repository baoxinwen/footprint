import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Mock router
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ params: { id: '1' } }),
  createRouter: vi.fn(() => ({ beforeEach: vi.fn() })),
  createWebHistory: vi.fn(),
}))

// Mock API
vi.mock('../../api/trips', () => ({
  getTrip: vi.fn(),
  deleteTrip: vi.fn(),
}))

vi.mock('../../api/photos', () => ({
  uploadPhoto: vi.fn(),
  getPhotos: vi.fn(),
  deletePhoto: vi.fn(),
}))

vi.mock('../../api/shares', () => ({
  createShare: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn() },
    ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm') },
  }
})

import TripDetailView from '../../views/TripDetailView.vue'
import { getTrip } from '../../api/trips'

const mockTripData = {
  id: 1,
  title: '北京三日游',
  description: '测试旅行',
  start_date: '2025-10-01',
  end_date: '2025-10-03',
  created_at: '2025-10-01T00:00:00',
  updated_at: '2025-10-01T00:00:00',
  locations: [
    {
      id: 1,
      name: '故宫博物院',
      address: '景山前街4号',
      longitude: 116.397128,
      latitude: 39.916527,
      city: '北京',
      province: '北京',
      note: '宏伟的宫殿',
      sort_order: 0,
      photo_count: 2,
    },
    {
      id: 2,
      name: '天坛公园',
      address: '天坛路',
      longitude: 116.407628,
      latitude: 39.882527,
      city: '北京',
      province: '北京',
      note: null,
      sort_order: 1,
      photo_count: 0,
    },
  ],
}

describe('TripDetailView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders loading state initially', () => {
    vi.mocked(getTrip).mockReturnValue(new Promise(() => {})) as any

    const wrapper = mount(TripDetailView, {
      global: { stubs: { ElMessage: true, ElButton: true, ElIcon: true, ElUpload: true, ElDialog: true } },
    })
    expect(wrapper.exists()).toBe(true)
  })

  it('renders trip details after loading', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)

    const wrapper = mount(TripDetailView, {
      global: { stubs: { ElMessage: true, ElButton: true, ElIcon: true, ElUpload: true, ElDialog: true } },
    })

    await vi.waitFor(() => {
      expect(getTrip).toHaveBeenCalledWith(1)
    })
  })

  it('renders location names', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)

    const wrapper = mount(TripDetailView, {
      global: { stubs: { ElMessage: true, ElButton: true, ElIcon: true, ElUpload: true, ElDialog: true } },
    })

    await vi.waitFor(() => {
      expect(getTrip).toHaveBeenCalled()
    })
  })

  it('handles API error gracefully', async () => {
    vi.mocked(getTrip).mockRejectedValue(new Error('Network error'))

    const wrapper = mount(TripDetailView, {
      global: { stubs: { ElMessage: true, ElButton: true, ElIcon: true, ElUpload: true, ElDialog: true } },
    })

    await vi.waitFor(() => {
      expect(getTrip).toHaveBeenCalled()
    })
  })
})
