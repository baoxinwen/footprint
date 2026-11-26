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
  updateSortOrder: vi.fn(),
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
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm') },
  }
})

import TripDetailView from '../../views/TripDetailView.vue'
import request from '../../api/request'
import { ElMessage } from 'element-plus'
import { getTrip, updateSortOrder } from '../../api/trips'
import { deletePhoto, getPhotos, uploadPhoto } from '../../api/photos'

import { FakeCacheStorage } from '../pwa/fakeCacheStorage'

enableAutoUnmount(afterEach)

const AuthenticatedImageStub = defineComponent({
  name: 'AuthenticatedImage',
  props: { src: String, alt: String },
  template: '<img class="authenticated-image-stub" :data-src="src" :alt="alt" />',
})

const ElUploadStub = defineComponent({
  name: 'ElUpload',
  props: { beforeUpload: Function, multiple: { type: Boolean, default: false } },
  template: '<div class="el-upload-stub"><slot /></div>',
})

const href = (path: string) => new URL(path, location.origin).href

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

  it('exports without the global timeout, using the server filename (I-9/M-26)', async () => {
    // 回归（评审 I-9/M-26）：大导出不再被 30 秒全局超时掐断；
    // 文件名取服务端 Content-Disposition 而不是写死 trip.zip
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    const getSpy = vi.spyOn(request, 'get').mockResolvedValue({
      data: new Blob(['zip'], { type: 'application/zip' }),
      headers: {
        'content-disposition': "attachment; filename*=UTF-8''%E5%8C%97%E4%BA%AC%E4%B8%89%E6%97%A5%E6%B8%B8.zip",
      },
    } as any)
    const anchors: HTMLAnchorElement[] = []
    const originalCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = originalCreate(tag)
      if (tag === 'a') anchors.push(el as HTMLAnchorElement)
      return el
    }) as typeof document.createElement)

    const wrapper = mount(TripDetailView, {
      global: { stubs: { ElMessage: true, ElButton: true, ElIcon: true, ElUpload: true, ElDialog: true } },
    })
    await flushPromises()

    await (wrapper.vm as any).handleExport('markdown')

    expect(getSpy).toHaveBeenCalledWith(
      '/trips/1/export/markdown',
      expect.objectContaining({ responseType: 'blob', timeout: 0 }),
    )
    expect(anchors.at(-1)?.download).toBe('北京三日游.zip')
    getSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('warns when the export archive is missing photos (I-10)', async () => {
    // 回归（评审 I-10）：后端用 X-Skipped-Photos 标明跳过的照片数，前端从不读取，
    // 用户拿着缺照片的包却以为备份完整
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    const getSpy = vi.spyOn(request, 'get').mockResolvedValue({
      data: new Blob(['zip'], { type: 'application/zip' }),
      headers: { 'x-skipped-photos': '2' },
    } as any)

    const wrapper = mount(TripDetailView, {
      global: { stubs: { ElMessage: true, ElButton: true, ElIcon: true, ElUpload: true, ElDialog: true } },
    })
    await flushPromises()

    await (wrapper.vm as any).handleExport('markdown')

    expect(ElMessage.warning).toHaveBeenCalledWith('有 2 张照片未包含在导出包中')
    getSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('ignores repeated export clicks while one export is in flight (I-9)', async () => {
    // 回归（评审 I-9）：导出等待期间可重复触发，服务端会重复建包
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    const pending = deferred<{ data: Blob; headers: Record<string, string> }>()
    const getSpy = vi.spyOn(request, 'get').mockReturnValueOnce(pending as any)

    const wrapper = mount(TripDetailView, {
      global: { stubs: { ElMessage: true, ElButton: true, ElIcon: true, ElUpload: true, ElDialog: true } },
    })
    await flushPromises()

    const first = (wrapper.vm as any).handleExport('json')
    await (wrapper.vm as any).handleExport('json')
    expect(getSpy).toHaveBeenCalledTimes(1)

    pending.resolve({ data: new Blob(['x']), headers: {} })
    await first
    getSpy.mockRestore()
    vi.restoreAllMocks()
  })

  const uploadStubs = { ElMessage: true, ElButton: true, ElIcon: true, ElUpload: ElUploadStub, ElDialog: true }

  it('queues multiple selected photos instead of rejecting the second (I-18)', async () => {
    // 回归（评审 I-18/PRD 6.1）：一次可多选；此前同地点并发上传被直接拒绝
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    vi.mocked(uploadPhoto).mockResolvedValue({ data: { id: 10 } } as any)
    const wrapper = mount(TripDetailView, { global: { stubs: uploadStubs } })
    await flushPromises()
    await wrapper.get('.location-toggle').trigger('click')
    await flushPromises()

    const upload = wrapper.getComponent(ElUploadStub)
    expect(upload.props('multiple')).toBe(true)

    const fileA = new File(['a'], 'a.jpg', { type: 'image/jpeg' })
    const fileB = new File(['b'], 'b.jpg', { type: 'image/jpeg' })
    await upload.props('beforeUpload')!(fileA)
    await upload.props('beforeUpload')!(fileB)
    await flushPromises()

    expect(uploadPhoto).toHaveBeenCalledTimes(2)
    expect(uploadPhoto).toHaveBeenNthCalledWith(1, 1, fileA, expect.any(Function))
    expect(uploadPhoto).toHaveBeenNthCalledWith(2, 1, fileB, expect.any(Function))
    expect(ElMessage.warning).not.toHaveBeenCalledWith('当前地点正在上传中，请稍候')
  })

  it('pre-checks photo size and type before hitting the server (I-18)', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    const wrapper = mount(TripDetailView, { global: { stubs: uploadStubs } })
    await flushPromises()
    await wrapper.get('.location-toggle').trigger('click')
    await flushPromises()

    const beforeUpload = wrapper.getComponent(ElUploadStub).props('beforeUpload')!
    const oversize = new File([new ArrayBuffer(10 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' })
    await beforeUpload(oversize)
    const wrongType = new File(['x'], 'note.txt', { type: 'text/plain' })
    await beforeUpload(wrongType)

    expect(uploadPhoto).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledTimes(2)
  })

  it('serializes sort requests and rolls back locally on failure (M-25)', async () => {
    // 回归（评审 M-25）：排序在途时忽略新的排序；失败按本次排序前的顺序本地回滚，
    // 不做整页重载（重载可能拿到另一次在途排序之前的服务端状态）
    vi.mocked(getTrip).mockResolvedValue({ data: structuredClone(mockTripData) } as any)
    const pending = deferred<{ data: unknown }>()
    vi.mocked(updateSortOrder).mockReturnValueOnce(pending.promise as any)

    const wrapper = mount(TripDetailView, {
      global: { stubs: { ElMessage: true, ElButton: true, ElIcon: true, ElUpload: true, ElDialog: true } },
    })
    await flushPromises()
    const vm: any = wrapper.vm

    const first = vm.moveLocation(0, 1)
    await vm.moveLocation(1, 0)
    expect(updateSortOrder).toHaveBeenCalledTimes(1)

    pending.reject(new Error('fail'))
    await first
    await flushPromises()

    expect(vm.trip.locations.map((l: { id: number }) => l.id)).toEqual([1, 2])
    expect(getTrip).toHaveBeenCalledTimes(1)
  })

  it('refreshes the trip snapshot after deleting a photo (M-24)', async () => {
    // 回归（评审 M-24）：离线快照里的 photo_count 与封面在删除照片后仍是旧值
    vi.mocked(getTrip).mockResolvedValue({ data: structuredClone(mockTripData) } as any)
    vi.mocked(getPhotos).mockResolvedValue({ data: [{
      id: 9, location_id: 1, original_url: '/api/photos/9/original',
      thumbnail_url: '/api/photos/9/thumbnail', file_name: 'p.jpg', file_size: 1, created_at: '2025-01-01T00:00:00',
    }] } as any)
    vi.mocked(deletePhoto).mockResolvedValue({ data: { message: 'ok' } } as any)

    const wrapper = mount(TripDetailView, {
      global: { stubs: { ElMessage: true, ElButton: true, ElIcon: true, ElUpload: true, ElDialog: true } },
    })
    await flushPromises()
    expect(getTrip).toHaveBeenCalledTimes(1)

    await wrapper.get('.location-toggle').trigger('click')
    await flushPromises()
    await wrapper.get('.photo-delete').trigger('click')
    await flushPromises()

    expect(deletePhoto).toHaveBeenCalledWith(9)
    expect(getTrip).toHaveBeenCalledTimes(2)
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

  it('forgets the cached thumbnail once a photo is deleted', async () => {
    const storage = new FakeCacheStorage()
    vi.stubGlobal('caches', storage)
    try {
      await storage.seed('api-thumbs', ['/api/photos/9/thumbnail', '/api/photos/10/thumbnail'])
      vi.mocked(getTrip).mockResolvedValue({ data: structuredClone(mockTripData) } as any)
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

      await wrapper.get('.photo-delete').trigger('click')
      await flushPromises()

      // 已删除的照片不能继续留在设备的离线缓存里
      await vi.waitFor(async () => {
        expect(await storage.urls('api-thumbs')).toEqual([href('/api/photos/10/thumbnail')])
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('clears cached private data once the trip is deleted', async () => {
    const storage = new FakeCacheStorage()
    vi.stubGlobal('caches', storage)
    try {
      await storage.seed('api-data', ['/api/trips', '/api/trips/1', '/api/timeline'])
      await storage.seed('api-thumbs', ['/api/photos/9/thumbnail'])
      await storage.seed('fonts', ['/assets/x.woff2'])
      vi.mocked(getTrip).mockResolvedValue({ data: structuredClone(mockTripData) } as any)
      const wrapper = mount(TripDetailView, {
        global: { stubs: { ElIcon: true, ElUpload: true, ElDialog: true } },
      })
      await vi.waitFor(() => expect(wrapper.find('.action-btn.danger').exists()).toBe(true))

      await wrapper.get('.action-btn.danger').trigger('click')
      await flushPromises()

      // 旅行连同它的地点、照片一起删了：接口快照与缩略图整库清掉，字体缓存保留
      await vi.waitFor(async () => {
        expect(await storage.keys()).toEqual(['fonts'])
      })
    } finally {
      vi.unstubAllGlobals()
    }
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
    // 铁律 7 后面板常驻渲染：断言折叠语义（未展开 + inert）而非节点缺席
    const collapsedPanel = wrapper.get('.location-collapse')
    expect(collapsedPanel.classes()).not.toContain('open')
    expect(collapsedPanel.attributes('inert')).toBeDefined()
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

  it('reorders locations via Alt+ArrowDown and saves the new order', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: structuredClone(mockTripData) } as any)
    vi.mocked(getPhotos).mockResolvedValue({ data: [] } as any)
    vi.mocked(updateSortOrder).mockResolvedValue({ data: {} } as any)

    const wrapper = mount(TripDetailView, {
      attachTo: document.body, // 焦点断言需要真实挂在文档树上
      global: { stubs: { ElIcon: true, ElUpload: true, ElDialog: true } },
    })
    await vi.waitFor(() => expect(wrapper.find('.location-toggle').exists()).toBe(true))

    // 聚焦第一行的开关按钮，Alt+↓ 下移一位
    await wrapper.get('.location-toggle').trigger('keydown', { altKey: true, key: 'ArrowDown' })
    await flushPromises()

    expect(updateSortOrder).toHaveBeenCalledWith(1, [
      { location_id: 2, sort_order: 0 },
      { location_id: 1, sort_order: 1 },
    ])
    // 焦点跟手：被移动项（故宫 id=1）落到新位置 index 1，焦点随行可连续调整
    await nextTick()
    expect(document.activeElement?.id).toBe('location-toggle-1')
    // aria-live 播报结果
    expect(wrapper.get('[role="status"]').text()).toContain('故宫博物院')
  })

  it('ignores non-Alt or horizontal arrow keys in the location list', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: structuredClone(mockTripData) } as any)
    vi.mocked(getPhotos).mockResolvedValue({ data: [] } as any)

    const wrapper = mount(TripDetailView, {
      global: { stubs: { ElIcon: true, ElUpload: true, ElDialog: true } },
    })
    await vi.waitFor(() => expect(wrapper.find('.location-toggle').exists()).toBe(true))

    await wrapper.get('.location-toggle').trigger('keydown', { altKey: true, key: 'ArrowLeft' })
    await wrapper.get('.location-toggle').trigger('keydown', { key: 'ArrowDown' })
    await flushPromises()

    expect(updateSortOrder).not.toHaveBeenCalled()
  })
})
