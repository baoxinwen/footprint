import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Mock router
const mockPush = vi.fn()
const routerState = vi.hoisted(() => ({
  params: { id: '1' as string | undefined },
  leaveGuard: null as null | ((to?: { path?: string; name?: string }) => boolean | Promise<boolean>),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ params: routerState.params }),
  onBeforeRouteLeave: (guard: (to?: { path?: string; name?: string }) => boolean | Promise<boolean>) => { routerState.leaveGuard = guard },
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

vi.mock('../../api/config', () => ({
  getConfig: vi.fn().mockResolvedValue({
    amap_key: 'test-key',
    amap_security_code: 'test-security-code',
  }),
}))

const amapSearchMocks = vi.hoisted(() => ({
  placeSearch: { search: vi.fn() },
  geocoder: { getAddress: vi.fn() },
}))

vi.mock('@amap/amap-jsapi-loader', () => ({
  default: {
    load: vi.fn().mockResolvedValue({
      Map: vi.fn(),
      PlaceSearch: vi.fn(function MockPlaceSearch() { return amapSearchMocks.placeSearch }),
      Geocoder: vi.fn(function MockGeocoder() { return amapSearchMocks.geocoder }),
    }),
  },
}))

vi.mock('md-editor-v3', () => ({
  MdEditor: defineComponent({
    name: 'MdEditor',
    props: { modelValue: { type: String, default: '' } },
    emits: ['update:modelValue'],
    template: '<textarea data-testid="note-editor" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  }),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

import TripFormView from '../../views/TripFormView.vue'
import { addLocation, deleteLocation, getTrip, updateLocation, updateTrip } from '../../api/trips'
import { uploadPhoto } from '../../api/photos'
import { ElMessage, ElMessageBox } from 'element-plus'

const ElButtonStub = defineComponent({
  name: 'ElButton',
  inheritAttrs: false,
  props: { disabled: Boolean },
  template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>',
})

const ElUploadStub = defineComponent({
  name: 'ElUpload',
  props: { beforeUpload: Function },
  template: '<div class="el-upload-stub"><slot /></div>',
})

const ElDialogStub = defineComponent({
  name: 'ElDialog',
  props: { modelValue: Boolean },
  template: '<div v-if="modelValue" class="el-dialog-stub"><slot /><slot name="footer" /></div>',
})

const AuthenticatedImageStub = defineComponent({
  name: 'AuthenticatedImage',
  props: { src: String, alt: String },
  template: '<img class="authenticated-image-stub" :data-src="src" :alt="alt" />',
})

const globalStubs = {
  ElMessage: true,
  ElButton: ElButtonStub,
  ElInput: true,
  ElDatePicker: true,
  ElDialog: ElDialogStub,
  ElUpload: ElUploadStub,
  ElForm: true,
  ElFormItem: true,
  ElRow: true,
  ElCol: true,
  ElIcon: true,
  Delete: true,
  AuthenticatedImage: AuthenticatedImageStub,
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
      photo_count: 0,
    },
    {
      id: 2,
      name: '颐和园',
      address: '新建宫门路19号',
      longitude: 116.2755,
      latitude: 39.9988,
      city: '北京',
      province: '北京',
      note: '第二地点游记',
      sort_order: 1,
      photo_count: 0,
    },
  ],
}

const mockPoi = {
  name: '天坛',
  address: '天坛路甲1号',
  location: { lng: 116.4108, lat: 39.8819 },
  cityname: '北京',
  pname: '北京',
}

function tokenForUser(userId: number) {
  const payload = btoa(JSON.stringify({ sub: String(userId), exp: 4_102_444_800 }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `header.${payload}.signature`
}

function mountView() {
  return mount(TripFormView, { global: { stubs: globalStubs } })
}

describe('TripFormView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    routerState.params.id = '1'
    routerState.leaveGuard = null
    localStorage.clear()
    delete (window as any)._AMapSecurityConfig
  })

  it('renders form in create mode', () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)

    const wrapper = mountView()
    expect(wrapper.exists()).toBe(true)
  })

  it('loads trip data in edit mode', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)

    mountView()

    // Wait for onMounted to complete
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(getTrip).toHaveBeenCalledWith(1)
  })

  it('handles API error gracefully', async () => {
    vi.mocked(getTrip).mockRejectedValue(new Error('Network error'))

    mountView()

    // Wait for onMounted to complete
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(getTrip).toHaveBeenCalled()
  })

  it('uses the backend AMap security code when loading the SDK', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)

    mountView()
    await flushPromises()

    expect((window as any)._AMapSecurityConfig).toEqual({ securityJsCode: 'test-security-code' })
  })

  it('renders matching POIs from the JS SDK', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    const wrapper = mountView()
    await flushPromises()

    amapSearchMocks.placeSearch.search.mockImplementation((_keyword: string, callback: any) => {
      callback('complete', { poiList: { pois: [mockPoi] } })
    })
    amapSearchMocks.geocoder.getAddress.mockImplementation((_location: any, callback: any) => {
      callback('complete', {})
    })

    ;(wrapper.vm as any).poiSearch = '故宫'
    ;(wrapper.vm as any).searchPoi()
    await flushPromises()

    expect(amapSearchMocks.placeSearch.search).toHaveBeenCalledWith('故宫', expect.any(Function))
    expect((wrapper.vm as any).poiResults[0].name).toBe('天坛')
    expect(ElMessage.warning).not.toHaveBeenCalled()
  })

  it('shows no-result for the no_data status', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    const wrapper = mountView()
    await flushPromises()

    amapSearchMocks.placeSearch.search.mockImplementation((_keyword: string, callback: any) => {
      callback('no_data', 'NO_DATA')
    })

    ;(wrapper.vm as any).poiSearch = '不存在的地点xyz'
    ;(wrapper.vm as any).searchPoi()
    await flushPromises()

    expect((wrapper.vm as any).poiResults).toEqual([])
    expect(ElMessage.warning).toHaveBeenCalledWith('未找到相关地点')
  })

  it('surfaces INVALID_USER_SCODE with a configuration hint', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    const wrapper = mountView()
    await flushPromises()

    amapSearchMocks.placeSearch.search.mockImplementation((_keyword: string, callback: any) => {
      callback('error', 'INVALID_USER_SCODE')
    })

    ;(wrapper.vm as any).poiSearch = '故宫'
    ;(wrapper.vm as any).searchPoi()

    expect((wrapper.vm as any).poiResults).toEqual([])
    expect(ElMessage.warning).not.toHaveBeenCalled()
    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('AMAP_SECURITY_CODE'))
  })

  it('surfaces other AMap search errors', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    const wrapper = mountView()
    await flushPromises()

    amapSearchMocks.placeSearch.search.mockImplementation((_keyword: string, callback: any) => {
      callback('error', 'SOME_AMAP_ERROR')
    })

    ;(wrapper.vm as any).poiSearch = '故宫'
    ;(wrapper.vm as any).searchPoi()

    expect((wrapper.vm as any).poiResults).toEqual([])
    expect(ElMessage.error).toHaveBeenCalledWith('地图搜索失败：SOME_AMAP_ERROR')
  })

  it('does not persist a newly added POI when leaving the edit form', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    vi.mocked(addLocation).mockResolvedValue({ data: { id: 99, sort_order: 2 } } as any)
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)
    const wrapper = mountView()
    await flushPromises()

    await (wrapper.vm as any).addPoi(mockPoi)
    await nextTick()
    await routerState.leaveGuard!({ path: '/trips' })

    expect(addLocation).not.toHaveBeenCalled()
  })

  it('normalizes a municipality when AMap omits the city field', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    const wrapper = mountView()
    await flushPromises()

    await (wrapper.vm as any).addPoi({
      ...mockPoi,
      cityname: [],
      pname: ' 北京市 ',
    })

    const added = (wrapper.vm as any).locations.at(-1)
    expect(added.city).toBe('北京')
    expect(added.province).toBe('北京')
    expect(ElMessage.warning).not.toHaveBeenCalled()
  })

  it('keeps missing AMap metadata empty and explains the statistics impact', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    const wrapper = mountView()
    await flushPromises()

    await (wrapper.vm as any).addPoi({
      ...mockPoi,
      address: '   ',
      cityname: [],
      pname: '',
    })
    await nextTick()

    const added = (wrapper.vm as any).locations.at(-1)
    expect(added.address).toBe('')
    expect(added.city).toBe('')
    expect(added.province).toBe('')
    expect(wrapper.findAll('.location-address').at(-1)?.text()).toBe('地区信息缺失')
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('不会计入城市统计'))
  })

  it('persists a newly added POI only when the edit form is saved', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    vi.mocked(updateTrip).mockResolvedValue({ data: mockTripData } as any)
    const wrapper = mountView()
    await flushPromises()

    await (wrapper.vm as any).addPoi(mockPoi)
    vi.mocked(updateTrip).mockClear()
    await (wrapper.vm as any).handleSave()

    expect(updateTrip).toHaveBeenCalledOnce()
    expect(updateTrip).toHaveBeenCalledWith(1, expect.objectContaining({
      locations: expect.arrayContaining([
        expect.objectContaining({
          name: '天坛',
          longitude: 116.4108,
          latitude: 39.8819,
        }),
      ]),
    }))
  })

  it('saves the trip and all location changes in one request', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    vi.mocked(updateTrip).mockResolvedValue({ data: mockTripData } as any)
    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll('.location-item')[0].findAll('button')[2].trigger('click')
    ;(wrapper.vm as any).locations[1].note = '更新后的游记'
    await (wrapper.vm as any).addPoi(mockPoi)
    await (wrapper.vm as any).handleSave()

    expect(updateTrip).toHaveBeenCalledOnce()
    expect(updateTrip).toHaveBeenCalledWith(1, expect.objectContaining({
      title: '北京三日游',
      locations: [
        expect.objectContaining({ id: 2, name: '颐和园', note: '更新后的游记' }),
        expect.objectContaining({ name: '天坛', longitude: 116.4108, latitude: 39.8819 }),
      ],
    }))
    expect(addLocation).not.toHaveBeenCalled()
    expect(updateLocation).not.toHaveBeenCalled()
    expect(deleteLocation).not.toHaveBeenCalled()
  })

  it('deletes the remaining location after an earlier location is filtered out', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll('.location-item')[0].findAll('button')[2].trigger('click')
    expect(wrapper.findAll('.location-item').map((item) => item.find('.location-name').text())).toEqual(['颐和园'])

    await wrapper.find('.location-item').findAll('button')[2].trigger('click')
    expect(wrapper.findAll('.location-item')).toHaveLength(0)
  })

  it('opens the note belonging to the visible location after an earlier location is deleted', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll('.location-item')[0].findAll('button')[2].trigger('click')
    await wrapper.find('.location-item').findAll('button')[0].trigger('click')

    expect(wrapper.get<HTMLTextAreaElement>('[data-testid="note-editor"]').element.value).toBe('第二地点游记')
  })

  it('uploads a photo to the visible location after an earlier location is deleted', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    vi.mocked(uploadPhoto).mockResolvedValue({ data: { id: 10 } } as any)
    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll('.location-item')[0].findAll('button')[2].trigger('click')
    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })
    const upload = wrapper.find('.location-item').findComponent(ElUploadStub)
    await upload.props('beforeUpload')!(file)

    expect(uploadPhoto).toHaveBeenCalledWith(2, file)
  })

  it('renders an uploaded private photo through the authenticated image component', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    vi.mocked(uploadPhoto).mockResolvedValue({ data: {
      id: 10,
      file_name: 'private.jpg',
      original_url: '/api/photos/10/original',
      thumbnail_url: '/api/photos/10/thumbnail',
    } } as any)
    const wrapper = mountView()
    await flushPromises()

    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })
    await wrapper.find('.location-item').findComponent(ElUploadStub).props('beforeUpload')!(file)
    await nextTick()

    expect(wrapper.getComponent(AuthenticatedImageStub).props('src')).toBe('/api/photos/10/thumbnail')
  })

  it('does not mark an otherwise clean edit form dirty after only uploading a photo', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    vi.mocked(uploadPhoto).mockResolvedValue({ data: {
      id: 10,
      file_name: 'private.jpg',
      original_url: '/api/photos/10/original',
      thumbnail_url: '/api/photos/10/thumbnail',
    } } as any)
    const wrapper = mountView()
    await flushPromises()

    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })
    await wrapper.find('.location-item').findComponent(ElUploadStub).props('beforeUpload')!(file)
    await nextTick()

    await expect(routerState.leaveGuard!({ path: '/trips' })).resolves.toBe(true)
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
  })

  it('labels the icon-only delete buttons', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findAll('.location-item')[0].findAll('button')[2].attributes('aria-label')).toBe('删除地点：故宫博物院')
  })

  it('restores and auto-saves only the authenticated user draft', async () => {
    routerState.params.id = undefined
    localStorage.setItem('token', tokenForUser(17))
    localStorage.setItem('footprint:trip-draft:17', JSON.stringify({
      form: { title: '杭州周末', description: '草稿', start_date: '2026-05-01', end_date: '2026-05-02' },
      locations: [],
    }))
    localStorage.setItem('footprint:trip-draft:23', JSON.stringify({
      form: { title: '其他用户的草稿', description: '', start_date: '', end_date: '' },
      locations: [],
    }))

    const wrapper = mountView()
    await flushPromises()
    expect((wrapper.vm as any).form.title).toBe('杭州周末')

    ;(wrapper.vm as any).form.title = '杭州三日'
    // 草稿写入为 300ms 防抖（避免每次键击全量序列化），等待防抖窗口后断言
    await new Promise((resolve) => setTimeout(resolve, 400))
    const saved = JSON.parse(localStorage.getItem('footprint:trip-draft:17') || '{}')
    expect(saved.form.title).toBe('杭州三日')
    expect(localStorage.getItem('footprint:trip-draft:23')).toContain('其他用户的草稿')
  })

  it('discards the unscoped legacy draft instead of exposing it after login', async () => {
    routerState.params.id = undefined
    localStorage.setItem('token', tokenForUser(23))
    localStorage.setItem('footprint:trip-draft', JSON.stringify({
      form: { title: '上一个用户的私密草稿', description: '', start_date: '', end_date: '' },
      locations: [],
    }))

    const wrapper = mountView()
    await flushPromises()

    expect((wrapper.vm as any).form.title).toBe('')
    expect(localStorage.getItem('footprint:trip-draft')).toBeNull()
  })

  it('continues negative temporary IDs after restoring a draft', async () => {
    routerState.params.id = undefined
    localStorage.setItem('token', tokenForUser(17))
    localStorage.setItem('footprint:trip-draft:17', JSON.stringify({
      form: { title: '杭州周末', description: '', start_date: '2026-05-01', end_date: '2026-05-02' },
      locations: [{
        id: -1,
        name: '西湖',
        address: '西湖风景区',
        longitude: 120.14,
        latitude: 30.25,
        city: '杭州',
        province: '浙江',
        note: null,
        sort_order: 0,
        photo_count: 0,
        photos: [],
        _deleted: false,
      }],
    }))
    const wrapper = mountView()
    await flushPromises()

    await (wrapper.vm as any).addPoi(mockPoi)

    expect((wrapper.vm as any).locations.map((location: any) => location.id)).toEqual([-1, -2])
  })

  it('asks before leaving after the loaded trip is changed', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    vi.mocked(ElMessageBox.confirm).mockRejectedValue(new Error('cancelled'))
    const wrapper = mountView()
    await flushPromises()
    await nextTick()

    ;(wrapper.vm as any).form.title = '已修改标题'
    await nextTick()

    expect(routerState.leaveGuard).toBeTypeOf('function')
    await expect(routerState.leaveGuard!({ path: '/trips' })).resolves.toBe(false)
    expect(ElMessageBox.confirm).toHaveBeenCalled()
  })

  it('does not let the unsaved-change guard block a forced authentication redirect', async () => {
    vi.mocked(getTrip).mockResolvedValue({ data: mockTripData } as any)
    const wrapper = mountView()
    await flushPromises()
    ;(wrapper.vm as any).form.title = '已修改标题'
    await nextTick()
    localStorage.removeItem('token')

    await expect(routerState.leaveGuard!({ path: '/login', name: 'Login' })).resolves.toBe(true)
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
  })
})
