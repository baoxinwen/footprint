import { defineComponent } from 'vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Mock element-plus CSS
vi.mock('element-plus/dist/index.css', () => ({}))
vi.mock('element-plus/theme-chalk/base.css', () => ({}))

const amapMocks = vi.hoisted(() => ({
  maps: [] as any[],
  satelliteLayers: [] as any[],
  roadNetLayers: [] as any[],
  trafficLayers: [] as any[],
  markerOptions: [] as any[],
}))

const imageMocks = vi.hoisted(() => ({
  release: vi.fn(),
  acquire: vi.fn(async () => ({ src: 'blob:map-photo', release: imageMocks.release })),
}))

vi.mock('../../utils/authenticatedImage', () => ({
  acquireImageResource: imageMocks.acquire,
}))

// Mock AMap
vi.mock('@amap/amap-jsapi-loader', () => ({
  default: {
    load: vi.fn().mockResolvedValue({
      Map: vi.fn().mockImplementation(function MockMap() {
        const map = {
          addControl: vi.fn(),
          destroy: vi.fn(),
          getCenter: vi.fn().mockReturnValue({ getLng: () => 116, getLat: () => 39 }),
          getZoom: vi.fn().mockReturnValue(5),
          setCenter: vi.fn(),
          setZoom: vi.fn(),
          setFitView: vi.fn(),
          setMapStyle: vi.fn(),
          add: vi.fn(),
          remove: vi.fn(),
        }
        amapMocks.maps.push(map)
        return map
      }),
      Scale: class MockScale {},
      ToolBar: class MockToolBar {},
      TileLayer: {
        Satellite: vi.fn().mockImplementation(function MockSatellite() {
          const layer = { kind: 'satellite' }
          amapMocks.satelliteLayers.push(layer)
          return layer
        }),
        RoadNet: vi.fn().mockImplementation(function MockRoadNet() {
          const layer = { kind: 'road-net' }
          amapMocks.roadNetLayers.push(layer)
          return layer
        }),
        Traffic: vi.fn().mockImplementation(function MockTraffic() {
          const layer = { kind: 'traffic' }
          amapMocks.trafficLayers.push(layer)
          return layer
        }),
      },
      Marker: class MockMarker {
        on = vi.fn()
        constructor(options: any) { amapMocks.markerOptions.push(options) }
      },
      CircleMarker: class MockCircleMarker {},
      Polyline: class MockPolyline {},
      LngLat: class MockLngLat {},
      Pixel: class MockPixel {},
    }),
  },
}))

vi.mock('../../api/config', () => ({
  getConfig: vi.fn().mockResolvedValue({
    amap_key: 'test-key',
    amap_security_code: 'test-security-code',
  }),
}))

// Mock stats API
vi.mock('../../api/stats', () => ({
  getMapStats: vi.fn().mockResolvedValue({ data: { trip_count: 3, location_count: 10, city_count: 5, province_count: 3 } }),
  getCityMarkers: vi.fn().mockResolvedValue({ data: [
    { city: '北京', province: '北京', longitude: 116.4, latitude: 39.9, count: 2 },
    { city: '上海', province: '上海', longitude: 121.5, latitude: 31.2, count: 1 },
  ]}),
  getAllRoutes: vi.fn().mockResolvedValue({ data: [
    { trip_id: 1, title: '北京游', color: '#FF6B6B', locations: [
      { name: '故宫', longitude: 116.4, latitude: 39.9 },
      { name: '长城', longitude: 116.0, latitude: 40.4 },
    ]},
  ]}),
  getPhotoMarkers: vi.fn().mockResolvedValue({ data: [
    { photo_id: 1, thumbnail_url: '/api/photos/1/thumbnail', original_url: '/api/photos/1/original', location_name: '故宫', longitude: 116.4, latitude: 39.9, city: '北京', trip_id: 1, trip_title: '北京游' },
  ]}),
}))

// Mock router
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  createRouter: vi.fn(() => ({ beforeEach: vi.fn() })),
  createWebHistory: vi.fn(),
}))

import MapView from '../../views/MapView.vue'
import { getMapStats, getCityMarkers, getAllRoutes, getPhotoMarkers } from '../../api/stats'

const ElSelectStub = defineComponent({
  name: 'ElSelect',
  emits: ['focus', 'change'],
  template: '<div class="el-select-stub"><button class="select-focus" @click="$emit(\'focus\')">聚焦</button><button class="select-change" @click="$emit(\'change\', \'dark\')">切换</button><slot /></div>',
})

const globalStubs = {
  'el-select': ElSelectStub,
  'el-option': true,
  'el-icon': true,
  EmptyState: true,
  PhotoViewer: true,
}

function mountView() {
  return mount(MapView, { global: { stubs: globalStubs } })
}

describe('MapView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    amapMocks.maps.length = 0
    amapMocks.satelliteLayers.length = 0
    amapMocks.roadNetLayers.length = 0
    amapMocks.trafficLayers.length = 0
    amapMocks.markerOptions.length = 0
    delete (window as any)._AMapSecurityConfig
    vi.mocked(getPhotoMarkers).mockResolvedValue({ data: [
      { photo_id: 1, thumbnail_url: '/api/photos/1/thumbnail', original_url: '/api/photos/1/original', location_name: '故宫', longitude: 116.4, latitude: 39.9, city: '北京', trip_id: 1, trip_title: '北京游' },
    ] } as any)
  })

  afterEach(() => vi.useRealTimers())

  it('loads stats and cities on mount', async () => {
    mountView()
    await flushPromises()
    expect(getMapStats).toHaveBeenCalled()
    expect(getCityMarkers).toHaveBeenCalled()
  })

  it('uses the backend AMap security code when loading the SDK', async () => {
    mountView()
    await flushPromises()

    expect((window as any)._AMapSecurityConfig).toEqual({ securityJsCode: 'test-security-code' })
  })

  it('does not load routes on mount (lazy loaded)', async () => {
    mountView()
    await flushPromises()
    expect(getAllRoutes).not.toHaveBeenCalled()
  })

  it('displays stats panel with trip count', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('统计概览')
    expect(wrapper.text()).toContain('3')
  })

  it('has control panel sections', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('地图样式')
    expect(wrapper.text()).toContain('图层')
    expect(wrapper.text()).toContain('路线筛选')
    expect(wrapper.text()).toContain('照片地图')
    expect(wrapper.text()).not.toContain('📸')
  })

  it('has layer toggle buttons', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('卫星')
    expect(wrapper.text()).toContain('路网')
    expect(wrapper.text()).toContain('路况')
  })

  it('toggles panel collapse', async () => {
    const wrapper = mountView()
    await flushPromises()
    const header = wrapper.find('.panel-header')
    expect(header.exists()).toBe(true)
    // Panel starts expanded
    expect(wrapper.find('.panel-stats').exists()).toBe(true)
    // Click to collapse
    await header.trigger('click')
    expect(wrapper.find('.panel-stats').exists()).toBe(false)
  })

  it('renders map container', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('#map-container').exists()).toBe(true)
  })

  it('restores enabled layers after rebuilding the map style', async () => {
    const wrapper = mountView()
    await flushPromises()

    for (const button of wrapper.findAll('.layer-btn')) await button.trigger('click')
    await wrapper.findAllComponents(ElSelectStub)[0].find('.select-change').trigger('click')

    expect(amapMocks.maps).toHaveLength(2)
    expect(amapMocks.satelliteLayers).toHaveLength(2)
    expect(amapMocks.roadNetLayers).toHaveLength(2)
    expect(amapMocks.trafficLayers).toHaveLength(2)
    expect(amapMocks.maps[1].add).toHaveBeenCalledWith(amapMocks.satelliteLayers[1])
    expect(amapMocks.maps[1].add).toHaveBeenCalledWith(amapMocks.roadNetLayers[1])
    expect(amapMocks.maps[1].add).toHaveBeenCalledWith(amapMocks.trafficLayers[1])
  })

  it('removes active layers and destroys the map on unmount', async () => {
    const wrapper = mountView()
    await flushPromises()
    const map = amapMocks.maps[0]
    for (const button of wrapper.findAll('.layer-btn')) await button.trigger('click')

    wrapper.unmount()

    expect(map.remove).toHaveBeenCalledWith(amapMocks.satelliteLayers[0])
    expect(map.remove).toHaveBeenCalledWith(amapMocks.roadNetLayers[0])
    expect(map.remove).toHaveBeenCalledWith(amapMocks.trafficLayers[0])
    expect(map.destroy).toHaveBeenCalledOnce()
  })

  it('clears a pending route fit timer on unmount', async () => {
    vi.useFakeTimers()
    const wrapper = mountView()
    await flushPromises()
    const map = amapMocks.maps[0]
    const routeSelect = wrapper.findAllComponents(ElSelectStub)[1]
    await routeSelect.find('.select-focus').trigger('click')
    await flushPromises()
    routeSelect.vm.$emit('change', 1)
    await flushPromises()

    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(200)

    expect(map.setFitView).not.toHaveBeenCalled()
  })

  it('uses authenticated object URLs for photo markers and releases them on unmount', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('.photo-mode-btn').trigger('click')
    await flushPromises()

    expect(imageMocks.acquire).toHaveBeenCalledWith('/api/photos/1/thumbnail', expect.any(AbortSignal))
    expect(amapMocks.markerOptions.some((options) => options.content?.includes('blob:map-photo'))).toBe(true)

    wrapper.unmount()
    expect(imageMocks.release).toHaveBeenCalledOnce()
  })

  it('keeps photo markers after rebuilding the map style', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('.photo-mode-btn').trigger('click')
    await flushPromises()
    amapMocks.markerOptions.length = 0

    wrapper.findAllComponents(ElSelectStub)[0].vm.$emit('change', 'dark')
    await flushPromises()

    expect((wrapper.vm as any).photoMode).toBe(true)
    expect(amapMocks.markerOptions).toHaveLength(1)
    expect(amapMocks.markerOptions[0].content).toContain('blob:map-photo')
    expect(amapMocks.maps[1].add).toHaveBeenCalledOnce()
  })

  it('only renders the latest photo markers when map styles change quickly', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('.photo-mode-btn').trigger('click')
    await flushPromises()

    let resolveStale!: (resource: any) => void
    let resolveLatest!: (resource: any) => void
    const releaseStale = vi.fn()
    const releaseLatest = vi.fn()
    imageMocks.acquire
      .mockImplementationOnce(() => new Promise((resolve) => { resolveStale = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveLatest = resolve }))

    const styleSelect = wrapper.findAllComponents(ElSelectStub)[0]
    styleSelect.vm.$emit('change', 'dark')
    styleSelect.vm.$emit('change', 'light')

    expect(imageMocks.acquire).toHaveBeenCalledTimes(3)
    const latestMap = amapMocks.maps[2]
    latestMap.add.mockClear()
    amapMocks.markerOptions.length = 0

    resolveStale({ src: 'blob:stale-photo', release: releaseStale })
    await flushPromises()
    expect(latestMap.add).not.toHaveBeenCalled()
    expect(releaseStale).toHaveBeenCalledOnce()

    resolveLatest({ src: 'blob:latest-photo', release: releaseLatest })
    await flushPromises()
    expect(latestMap.add).toHaveBeenCalledOnce()
    expect(amapMocks.markerOptions).toHaveLength(1)
    expect(amapMocks.markerOptions[0].content).toContain('blob:latest-photo')
  })

  it('ignores a stale photo-marker response after photo mode is switched off', async () => {
    let resolveMarkers!: (value: any) => void
    vi.mocked(getPhotoMarkers).mockReturnValue(new Promise((resolve) => { resolveMarkers = resolve }))
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('.photo-mode-btn').trigger('click')
    await wrapper.get('.photo-mode-btn').trigger('click')
    resolveMarkers({ data: [
      { photo_id: 1, thumbnail_url: '/api/photos/1/thumbnail', original_url: '/api/photos/1/original', location_name: '故宫', longitude: 116.4, latitude: 39.9, city: '北京', trip_id: 1, trip_title: '北京游' },
    ] })
    await flushPromises()

    expect((wrapper.vm as any).photoMode).toBe(false)
    expect(imageMocks.acquire).not.toHaveBeenCalled()
  })
})
