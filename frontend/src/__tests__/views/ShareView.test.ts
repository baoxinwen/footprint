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
  getSharedPhotos: vi.fn(),
}))

import ShareView from '../../views/ShareView.vue'
import { getSharedPhotos, viewShare } from '../../api/shares'

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

  it('loads location photos through the token-scoped public endpoint', async () => {
    vi.mocked(viewShare).mockResolvedValue({ data: mockTripData } as any)
    vi.mocked(getSharedPhotos).mockResolvedValue({
      data: [{
        id: 7,
        location_id: 1,
        original_url: '/api/shares/view/test-token-123/photos/7/original',
        thumbnail_url: '/api/shares/view/test-token-123/photos/7/thumbnail',
        file_name: '故宫.jpg',
        file_size: 1024,
        created_at: '2025-10-01T10:00:00',
      }],
    } as any)

    const wrapper = mount(ShareView, {
      global: {
        stubs: {
          ElIcon: true,
          PhotoViewer: true,
        },
      },
    })

    await vi.waitFor(() => expect(wrapper.find('.location-header').exists()).toBe(true))
    await wrapper.find('.location-header').trigger('click')

    await vi.waitFor(() => {
      expect(getSharedPhotos).toHaveBeenCalledWith('test-token-123', 1)
      expect(wrapper.find('.photo-item img').attributes('src')).toContain('/api/shares/view/test-token-123/')
    })
  })

  it('exposes shared photo thumbnails as descriptively named buttons', async () => {
    vi.mocked(viewShare).mockResolvedValue({ data: mockTripData } as any)
    vi.mocked(getSharedPhotos).mockResolvedValue({
      data: [{
        id: 7,
        location_id: 1,
        original_url: '/api/shares/view/test-token-123/photos/7/original',
        thumbnail_url: '/api/shares/view/test-token-123/photos/7/thumbnail',
        file_name: '故宫午后.jpg',
        file_size: 1024,
        created_at: '2025-10-01T10:00:00',
      }],
    } as any)
    const wrapper = mount(ShareView, {
      global: { stubs: { ElIcon: true, PhotoViewer: true } },
    })

    await vi.waitFor(() => expect(wrapper.find('.location-header').exists()).toBe(true))
    await wrapper.find('.location-header').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.photo-item').exists()).toBe(true))

    const thumbnail = wrapper.get('.photo-item')
    expect(thumbnail.element.tagName).toBe('BUTTON')
    expect(thumbnail.attributes('type')).toBe('button')
    expect(thumbnail.attributes('aria-label')).toBe('查看照片：故宫午后.jpg')
  })

  it('shows a retry action when shared photos cannot be loaded', async () => {
    vi.mocked(viewShare).mockResolvedValue({ data: mockTripData } as any)
    vi.mocked(getSharedPhotos).mockRejectedValue(new Error('network error'))

    const wrapper = mount(ShareView, {
      global: { stubs: { ElIcon: true, PhotoViewer: true } },
    })

    await vi.waitFor(() => expect(wrapper.find('.location-header').exists()).toBe(true))
    await wrapper.find('.location-header').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('照片加载失败')
      expect(wrapper.find('[data-testid="retry-photos-1"]').exists()).toBe(true)
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
