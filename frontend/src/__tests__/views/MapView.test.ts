import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Mock element-plus CSS
vi.mock('element-plus/dist/index.css', () => ({}))
vi.mock('element-plus/theme-chalk/base.css', () => ({}))

// Mock AMap
vi.mock('@amap/amap-jsapi-loader', () => ({
  default: {
    load: vi.fn().mockResolvedValue({
      Map: vi.fn().mockReturnValue({
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
      }),
      Scale: vi.fn(),
      ToolBar: vi.fn(),
      Marker: vi.fn().mockReturnValue({ on: vi.fn() }),
      CircleMarker: vi.fn(),
      Polyline: vi.fn(),
      LngLat: vi.fn(),
      Pixel: vi.fn(),
    }),
  },
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
    { photo_id: 1, thumbnail_url: '/thumb/1', original_url: '/orig/1', location_name: '故宫', longitude: 116.4, latitude: 39.9, city: '北京', trip_id: 1, trip_title: '北京游' },
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

describe('MapView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loads stats and cities on mount', async () => {
    mount(MapView, {
      global: { stubs: { 'el-select': true, 'el-option': true, 'el-icon': true } },
    })
    await flushPromises()
    expect(getMapStats).toHaveBeenCalled()
    expect(getCityMarkers).toHaveBeenCalled()
  })

  it('does not load routes on mount (lazy loaded)', async () => {
    mount(MapView, {
      global: { stubs: { 'el-select': true, 'el-option': true, 'el-icon': true } },
    })
    await flushPromises()
    expect(getAllRoutes).not.toHaveBeenCalled()
  })

  it('displays stats panel with trip count', async () => {
    const wrapper = mount(MapView, {
      global: { stubs: { 'el-select': true, 'el-option': true, 'el-icon': true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('统计概览')
    expect(wrapper.text()).toContain('3')
  })

  it('has control panel sections', async () => {
    const wrapper = mount(MapView, {
      global: { stubs: { 'el-select': true, 'el-option': true, 'el-icon': true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('地图样式')
    expect(wrapper.text()).toContain('图层')
    expect(wrapper.text()).toContain('路线筛选')
    expect(wrapper.text()).toContain('照片地图')
  })

  it('has layer toggle buttons', async () => {
    const wrapper = mount(MapView, {
      global: { stubs: { 'el-select': true, 'el-option': true, 'el-icon': true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('卫星')
    expect(wrapper.text()).toContain('路网')
    expect(wrapper.text()).toContain('路况')
  })

  it('toggles panel collapse', async () => {
    const wrapper = mount(MapView, {
      global: { stubs: { 'el-select': true, 'el-option': true, 'el-icon': true } },
    })
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
    const wrapper = mount(MapView, {
      global: { stubs: { 'el-select': true, 'el-option': true, 'el-icon': true } },
    })
    await flushPromises()
    expect(wrapper.find('#map-container').exists()).toBe(true)
  })
})
