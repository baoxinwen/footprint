import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Mock element-plus CSS
vi.mock('element-plus/dist/index.css', () => ({}))
vi.mock('element-plus/theme-chalk/base.css', () => ({}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  createRouter: vi.fn(() => ({ beforeEach: vi.fn() })),
  createWebHistory: vi.fn(),
}))

vi.mock('../../api/stats', () => ({
  getOverview: vi.fn(),
  getYearly: vi.fn(),
  getMonthly: vi.fn(),
  getCityRank: vi.fn(),
  getMapStats: vi.fn(),
  getMapCities: vi.fn(),
  getMapRoutes: vi.fn(),
}))

import StatsView from '../../views/StatsView.vue'
import { getOverview, getYearly, getMonthly, getCityRank } from '../../api/stats'

describe('StatsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders page title', async () => {
    vi.mocked(getOverview).mockResolvedValue({ data: { trip_count: 0, city_count: 0, province_count: 0, total_days: 0 } } as any)
    vi.mocked(getYearly).mockResolvedValue({ data: [] } as any)
    vi.mocked(getMonthly).mockResolvedValue({ data: [] } as any)
    vi.mocked(getCityRank).mockResolvedValue({ data: [] } as any)
    const wrapper = mount(StatsView, {
      global: { stubs: { 'el-icon': true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('统计')
  })

  it('shows empty state when no data', async () => {
    vi.mocked(getOverview).mockResolvedValue({ data: { trip_count: 0, city_count: 0, province_count: 0, total_days: 0 } } as any)
    vi.mocked(getYearly).mockResolvedValue({ data: [] } as any)
    vi.mocked(getMonthly).mockResolvedValue({ data: [] } as any)
    vi.mocked(getCityRank).mockResolvedValue({ data: [] } as any)
    const wrapper = mount(StatsView, {
      global: { stubs: { 'el-icon': true } },
    })
    await flushPromises()
    // When no trips, shows empty state
    expect(wrapper.text()).toContain('暂无统计数据')
  })

  it('displays trip count when data exists', async () => {
    vi.mocked(getOverview).mockResolvedValue({ data: { trip_count: 5, city_count: 3, province_count: 2, total_days: 15 } } as any)
    vi.mocked(getYearly).mockResolvedValue({ data: [{ year: 2025, count: 5 }] } as any)
    vi.mocked(getMonthly).mockResolvedValue({ data: [{ month: 10, count: 2 }] } as any)
    vi.mocked(getCityRank).mockResolvedValue({ data: [{ city: '北京', count: 3 }] } as any)
    const wrapper = mount(StatsView, {
      global: { stubs: { 'el-icon': true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('5')
  })

  it('uses accessible buttons and labelled charts for interactive statistics', async () => {
    vi.mocked(getOverview).mockResolvedValue({ data: { trip_count: 5, city_count: 3, province_count: 2, total_days: 15 } } as any)
    vi.mocked(getYearly).mockResolvedValue({ data: [{ year: 2025, count: 5 }] } as any)
    vi.mocked(getMonthly).mockResolvedValue({ data: [{ month: 10, count: 2 }] } as any)
    vi.mocked(getCityRank).mockResolvedValue({ data: [{ city: '北京', count: 3 }] } as any)
    const wrapper = mount(StatsView, {
      global: { stubs: { 'el-icon': true } },
    })
    await flushPromises()

    expect(wrapper.findAll('button.stat-card-link')).toHaveLength(4)
    expect(wrapper.get('[aria-label="2025年旅行5次，查看旅行"]').exists()).toBe(true)
    const monthlyChart = wrapper.get('[aria-label="月度旅行次数分布柱状图"]')
    const monthlyBars = monthlyChart.findAll('rect.bar-fill')
    expect(monthlyChart.element.tagName).toBe('svg')
    expect(monthlyBars).toHaveLength(12)
    expect(wrapper.get('[aria-label="北京到访3次，查看旅行"]').exists()).toBe(true)
  })
})
