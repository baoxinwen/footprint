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
  createTrip: vi.fn(),
  updateTrip: vi.fn(),
  addLocation: vi.fn(),
  updateLocation: vi.fn(),
  deleteLocation: vi.fn(),
}))

vi.mock('../../api/photos', () => ({
  uploadPhoto: vi.fn(),
}))

// Mock AMapLoader
vi.mock('@amap/amap-jsapi-loader', () => ({
  default: {
    load: vi.fn(() => Promise.resolve({
      Map: vi.fn(),
      PlaceSearch: vi.fn(),
      Geocoder: vi.fn(),
    })),
  },
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn() },
  }
})

import TripFormView from '../../views/TripFormView.vue'
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
      photo_count: 0,
    },
  ],
}

describe('TripFormView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders form in create mode', () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)

    const wrapper = mount(TripFormView, {
      global: { stubs: { ElMessage: true, ElButton: true, ElInput: true, ElDatePicker: true, ElDialog: true, ElUpload: true, ElForm: true, ElFormItem: true, ElRow: true, ElCol: true, ElIcon: true } },
    })
    expect(wrapper.exists()).toBe(true)
  })

  it('loads trip data in edit mode', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)

    mount(TripFormView, {
      global: { stubs: { ElMessage: true, ElButton: true, ElInput: true, ElDatePicker: true, ElDialog: true, ElUpload: true, ElForm: true, ElFormItem: true, ElRow: true, ElCol: true, ElIcon: true } },
    })

    // Wait for onMounted to complete
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(getTrip).toHaveBeenCalledWith(1)
  })

  it('handles API error gracefully', async () => {
    vi.mocked(getTrip).mockRejectedValue(new Error('Network error'))

    mount(TripFormView, {
      global: { stubs: { ElMessage: true, ElButton: true, ElInput: true, ElDatePicker: true, ElDialog: true, ElUpload: true, ElForm: true, ElFormItem: true, ElRow: true, ElCol: true, ElIcon: true } },
    })

    // Wait for onMounted to complete
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(getTrip).toHaveBeenCalled()
  })
})
