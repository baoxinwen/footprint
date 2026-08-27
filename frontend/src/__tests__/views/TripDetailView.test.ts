import { defineComponent, nextTick, reactive } from 'vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Mock router
const mockPush = vi.fn()
const mockRoute = reactive({ params: { id: '1' } })
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => mockRoute,
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
import { deletePhoto, getPhotos } from '../../api/photos'

enableAutoUnmount(afterEach)

const AuthenticatedImageStub = defineComponent({
  name: 'AuthenticatedImage',
  props: { src: String, alt: String },
  template: '<img class="authenticated-image-stub" :data-src="src" :alt="alt" />',
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

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
    vi.mocked(getTrip).mockReset()
    vi.mocked(getPhotos).mockReset()
    mockRoute.params.id = '1'
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

  it('does not refetch when navigating away clears route params (NaN guard)', async () => {
    // 回归：离开详情页时 route.params.id 被清空 → tripId 变 NaN，
    // 组件卸载前的 sync watch 曾以 getTrip(NaN) 打出 /api/trips/NaN 422
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)

    const wrapper = mount(TripDetailView, {
      global: { stubs: { ElMessage: true, ElButton: true, ElIcon: true, ElUpload: true, ElDialog: true } },
    })
    await vi.waitFor(() => expect(getTrip).toHaveBeenCalledWith(1))

    mockRoute.params.id = undefined as unknown as string
    await nextTick()
    await flushPromises()

    expect(getTrip).toHaveBeenCalledTimes(1)
    expect(getTrip).not.toHaveBeenCalledWith(NaN)
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
      expect(wrapper.text()).toContain('旅行详情加载失败')
    })
    expect(wrapper.get('[aria-label="重新加载旅行详情"]')).toBeTruthy()
  })

  it('exposes each location toggle as an accessible disclosure button', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    vi.mocked(getPhotos).mockResolvedValue({ data: [] } as any)

    const wrapper = mount(TripDetailView, {
      global: { stubs: { ElIcon: true, ElUpload: true, ElDialog: true } },
    })
    await vi.waitFor(() => expect(wrapper.find('.location-toggle').exists()).toBe(true))

    const toggle = wrapper.get('.location-toggle')
    expect(toggle.element.tagName).toBe('BUTTON')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('aria-label')).toContain('故宫博物院')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(getPhotos).toHaveBeenCalledWith(1)
  })

  it('offers an edit action when a trip has no locations', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: { ...mockTripData, locations: [] } } as any)

    const wrapper = mount(TripDetailView, {
      global: { stubs: { ElIcon: true, ElUpload: true, ElDialog: true } },
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('还没有添加地点'))

    await wrapper.get('[aria-label="为这次旅行添加地点"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/trips/1/edit')
  })

  it('renders private photo thumbnails through the authenticated image component', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    vi.mocked(getPhotos).mockResolvedValue({ data: [{
      id: 9,
      file_name: 'private.jpg',
      original_url: '/api/photos/9/original',
      thumbnail_url: '/api/photos/9/thumbnail',
    }] } as any)
    const wrapper = mount(TripDetailView, {
      global: {
        stubs: {
          ElIcon: true,
          ElUpload: true,
          ElDialog: true,
          PhotoViewer: true,
          AuthenticatedImage: AuthenticatedImageStub,
        },
      },
    })
    await vi.waitFor(() => expect(wrapper.find('.location-toggle').exists()).toBe(true))

    await wrapper.get('.location-toggle').trigger('click')
    await flushPromises()

    expect(wrapper.getComponent(AuthenticatedImageStub).props('src')).toBe('/api/photos/9/thumbnail')
  })

  it('keeps photo viewing and deletion as sibling native buttons', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    vi.mocked(getPhotos).mockResolvedValue({ data: [{
      id: 9,
      file_name: 'private.jpg',
      original_url: '/api/photos/9/original',
      thumbnail_url: '/api/photos/9/thumbnail',
    }] } as any)

    const wrapper = mount(TripDetailView, {
      global: {
        stubs: {
          ElIcon: true,
          ElUpload: true,
          ElDialog: true,
          PhotoViewer: true,
          AuthenticatedImage: AuthenticatedImageStub,
        },
      },
    })
    await vi.waitFor(() => expect(wrapper.find('.location-toggle').exists()).toBe(true))
    await wrapper.get('.location-toggle').trigger('click')
    await flushPromises()

    const photoItem = wrapper.get('.photo-item')
    const viewerTrigger = wrapper.get('.photo-viewer-trigger')
    const deleteButton = wrapper.get('.photo-delete')

    expect(photoItem.attributes('role')).toBeUndefined()
    expect(photoItem.attributes('tabindex')).toBeUndefined()
    expect(viewerTrigger.element.tagName).toBe('BUTTON')
    expect(deleteButton.element.tagName).toBe('BUTTON')
    expect(viewerTrigger.element.contains(deleteButton.element)).toBe(false)

    await deleteButton.trigger('click')
    await flushPromises()
    expect(deletePhoto).toHaveBeenCalledWith(9)
    expect(wrapper.getComponent({ name: 'PhotoViewer' }).props('visible')).toBe(false)
  })

  it('clears stale detail state and reloads when the route id changes', async () => {
    const nextTripLoad = deferred<any>()
    const nextTrip = {
      ...mockTripData,
      id: 2,
      title: '上海周末',
      locations: [{ ...mockTripData.locations[0], id: 1, name: '外滩' }],
    }
    vi.mocked(getTrip).mockImplementation((id) => (
      id === 1 ? Promise.resolve({ data: mockTripData } as any) : nextTripLoad.promise
    ))
    vi.mocked(getPhotos).mockResolvedValue({ data: [{
      id: 9,
      file_name: 'old-trip.jpg',
      original_url: '/api/photos/9/original',
      thumbnail_url: '/api/photos/9/thumbnail',
    }] } as any)

    const wrapper = mount(TripDetailView, {
      global: {
        stubs: {
          ElIcon: true,
          ElUpload: true,
          ElDialog: true,
          PhotoViewer: true,
          AuthenticatedImage: AuthenticatedImageStub,
        },
      },
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain(mockTripData.title))
    await wrapper.get('.location-toggle').trigger('click')
    await flushPromises()
    expect(wrapper.find('.photo-item').exists()).toBe(true)

    mockRoute.params.id = '2'
    await nextTick()

    expect(getTrip).toHaveBeenCalledWith(2)
    expect(wrapper.find('.detail-content').exists()).toBe(false)

    nextTripLoad.resolve({ data: nextTrip })
    await flushPromises()

    expect(wrapper.text()).toContain('上海周末')
    expect(wrapper.get('.location-toggle').attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.photo-item').exists()).toBe(false)
    await wrapper.get('.action-btn.primary').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/trips/2/edit')
  })

  it('ignores an old trip response after navigating to another trip', async () => {
    const firstTripLoad = deferred<any>()
    const secondTripLoad = deferred<any>()
    const secondTrip = { ...mockTripData, id: 2, title: '上海周末' }
    vi.mocked(getTrip)
      .mockReturnValueOnce(firstTripLoad.promise)
      .mockReturnValueOnce(secondTripLoad.promise)

    const wrapper = mount(TripDetailView, {
      global: { stubs: { ElIcon: true, ElUpload: true, ElDialog: true, PhotoViewer: true } },
    })
    await vi.waitFor(() => expect(getTrip).toHaveBeenCalledWith(1))

    mockRoute.params.id = '2'
    await nextTick()
    expect(getTrip).toHaveBeenCalledWith(2)

    secondTripLoad.resolve({ data: secondTrip })
    await flushPromises()
    firstTripLoad.resolve({ data: mockTripData })
    await flushPromises()

    expect(wrapper.text()).toContain('上海周末')
    expect(wrapper.text()).not.toContain(mockTripData.title)
  })

  it('leaves photo keyboard navigation to PhotoViewer', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    vi.mocked(getPhotos).mockResolvedValue({ data: [
      { id: 1, file_name: 'one.jpg', original_url: '/one', thumbnail_url: '/one-thumb' },
      { id: 2, file_name: 'two.jpg', original_url: '/two', thumbnail_url: '/two-thumb' },
    ] } as any)
    const wrapper = mount(TripDetailView, {
      global: {
        stubs: {
          ElIcon: true,
          ElUpload: true,
          ElDialog: true,
          PhotoViewer: true,
          AuthenticatedImage: AuthenticatedImageStub,
        },
      },
    })
    await vi.waitFor(() => expect(wrapper.find('.location-toggle').exists()).toBe(true))
    await wrapper.get('.location-toggle').trigger('click')
    await flushPromises()
    await wrapper.get('.photo-viewer-trigger').trigger('click')

    const viewer = wrapper.getComponent({ name: 'PhotoViewer' })
    expect(viewer.props('index')).toBe(0)
    await wrapper.get('.detail-page').trigger('keydown', { key: 'ArrowRight' })
    expect(viewer.props('index')).toBe(0)
  })

  it('ignores an older photo response after a newer refresh completes', async () => {
    const staleLoad = deferred<any>()
    const freshLoad = deferred<any>()
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    // 第 1 次调用 = 进入详情时的照片条预加载；第 2/3 次 = 先后两次手动刷新
    vi.mocked(getPhotos)
      .mockResolvedValueOnce({ data: [] } as any)
      .mockReturnValueOnce(staleLoad.promise as any)
      .mockReturnValueOnce(freshLoad.promise as any)
    const wrapper = mount(TripDetailView, {
      global: {
        stubs: {
          ElIcon: true,
          ElUpload: true,
          ElDialog: true,
          PhotoViewer: true,
          AuthenticatedImage: AuthenticatedImageStub,
        },
      },
    })
    await vi.waitFor(() => expect(wrapper.find('.location-toggle').exists()).toBe(true))

    // 两次刷新：旧请求先发起，新请求后发起但先完成
    ;(wrapper.vm as any).refreshPhotos(1)
    ;(wrapper.vm as any).refreshPhotos(1)
    freshLoad.resolve({ data: [{
      id: 2,
      file_name: 'fresh.jpg',
      original_url: '/fresh',
      thumbnail_url: '/fresh-thumb',
    }] })
    await flushPromises()
    expect(wrapper.getComponent(AuthenticatedImageStub).props('src')).toBe('/fresh-thumb')

    // 旧响应晚到，不得覆盖新结果
    staleLoad.resolve({ data: [{
      id: 1,
      file_name: 'stale.jpg',
      original_url: '/stale',
      thumbnail_url: '/stale-thumb',
    }] })
    await flushPromises()

    expect(wrapper.getComponent(AuthenticatedImageStub).props('src')).toBe('/fresh-thumb')
    expect(getPhotos).toHaveBeenCalledTimes(3)
  })
})
