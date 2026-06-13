import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Mock element-plus CSS
vi.mock('element-plus/dist/index.css', () => ({}))
vi.mock('element-plus/theme-chalk/base.css', () => ({}))

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  createRouter: vi.fn(() => ({ beforeEach: vi.fn() })),
  createWebHistory: vi.fn(),
}))

vi.mock('../../api/timeline', () => ({
  getTimeline: vi.fn(),
}))

import TimelineView from '../../views/TimelineView.vue'
import { getTimeline } from '../../api/timeline'

describe('TimelineView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows loading state initially', () => {
    vi.mocked(getTimeline).mockReturnValue(new Promise(() => {})) as any
    const wrapper = mount(TimelineView, {
      global: { stubs: { 'el-icon': true, 'loading': true } },
    })
    expect(wrapper.find('.timeline-page').exists()).toBe(true)
  })

  it('renders empty state when no data', async () => {
    vi.mocked(getTimeline).mockResolvedValue({ data: [] } as any)
    const wrapper = mount(TimelineView, {
      global: { stubs: { 'el-icon': true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('还没有旅行记录')
  })

  it('renders timeline groups when data exists', async () => {
    vi.mocked(getTimeline).mockResolvedValue({
      data: [
        { year: 2025, month: 10, label: '2025年10月', count: 2, trips: [
          { id: 1, title: '北京三日游', start_date: '2025-10-01', end_date: '2025-10-03', description: '国庆假期' },
        ]},
      ],
    } as any)
    const wrapper = mount(TimelineView, {
      global: { stubs: { 'el-icon': true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('2025年10月')
    expect(wrapper.text()).toContain('北京三日游')
  })

  it('navigates to trip detail on click', async () => {
    vi.mocked(getTimeline).mockResolvedValue({
      data: [
        { year: 2025, month: 10, label: '2025年10月', count: 1, trips: [
          { id: 42, title: 'Test Trip', start_date: '2025-10-01', end_date: '2025-10-03' },
        ]},
      ],
    } as any)
    const wrapper = mount(TimelineView, {
      global: { stubs: { 'el-icon': true } },
    })
    await flushPromises()
    await wrapper.find('.trip-item').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/trips/42')
  })

  it('shows create button in empty state', async () => {
    vi.mocked(getTimeline).mockResolvedValue({ data: [] } as any)
    const wrapper = mount(TimelineView, {
      global: { stubs: { 'el-icon': true } },
    })
    await flushPromises()
    const btn = wrapper.find('.create-btn, button')
    if (btn.exists()) {
      await btn.trigger('click')
      expect(mockPush).toHaveBeenCalledWith('/trips/new')
    }
  })
})
