import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Mock router
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockPush }),
  useRoute: () => ({ params: { token: 'test-token-123' } }),
  createRouter: vi.fn(() => ({ beforeEach: vi.fn() })),
  createWebHistory: vi.fn(),
}))

// Mock API
vi.mock('../../api/shares', () => ({
  viewShare: vi.fn(),
}))

vi.mock('../../api/photos', () => ({
  getPhotos: vi.fn(),
}))

import ShareView from '../../views/ShareView.vue'
import { viewShare } from '../../api/shares'

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

describe('ShareView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders loading state initially', () => {
    vi.mocked(viewShare).mockReturnValue(new Promise(() => {})) as any

    const wrapper = mount(ShareView, {
      global: { stubs: { ElButton: true, ElIcon: true } },
    })
    expect(wrapper.exists()).toBe(true)
  })

  it('renders shared trip after loading', async () => {
    vi.mocked(viewShare).mockResolvedValue({ data: mockTripData } as any)

    const wrapper = mount(ShareView, {
      global: { stubs: { ElButton: true, ElIcon: true } },
    })

    await vi.waitFor(() => {
      expect(viewShare).toHaveBeenCalledWith('test-token-123')
    })
  })

  it('shows error for invalid share link', async () => {
    vi.mocked(viewShare).mockRejectedValue({ response: { status: 404 } })

    const wrapper = mount(ShareView, {
      global: { stubs: { ElButton: true, ElIcon: true } },
    })

    await vi.waitFor(() => {
      expect(viewShare).toHaveBeenCalled()
    })
  })

  it('redirects to expired page for 410 status', async () => {
    vi.mocked(viewShare).mockRejectedValue({ response: { status: 410 } })

    mount(ShareView, {
      global: { stubs: { ElButton: true, ElIcon: true } },
    })

    await vi.waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/share/expired')
    })
  })
})
