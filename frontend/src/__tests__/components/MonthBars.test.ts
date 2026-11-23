import { nextTick } from 'vue'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import MonthBars from '../../components/MonthBars.vue'

const items = [
  { month: 3, count: 2 },
  { month: 8, count: 5 },
  { month: 11, count: 1 },
]

/** 可手动触发的 ResizeObserver：返回一个按宽度派发回调的函数 */
function installResizeObserver() {
  const callbacks: ResizeObserverCallback[] = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ResizeObserverCallback) {
        callbacks.push(cb)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  return (width: number) => {
    const entry: ResizeObserverEntry = {
      target: document.body,
      contentRect: { width, height: 200, top: 0, left: 0, bottom: 200, right: width, x: 0, y: 0 },
      borderBoxSize: [],
      contentBoxSize: [],
      devicePixelContentBoxSize: [],
    } as ResizeObserverEntry
    callbacks.forEach((cb) => cb([entry], {} as ResizeObserver))
  }
}

const monthLabels = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('.month-label').map((node) => node.text())

describe('MonthBars', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders twelve bars and exposes every month to screen readers', () => {
    const wrapper = mount(MonthBars, { props: { items } })
    expect(wrapper.findAll('.bar-fill')).toHaveLength(12)
    expect(wrapper.findAll('tbody tr').map((row) => row.text())).toEqual([
      '1月0', '2月0', '3月2', '4月0', '5月0', '6月0', '7月0', '8月5', '9月0', '10月0', '11月1', '12月0',
    ])
  })

  it('switches to the compact canvas with numeric month labels in a narrow container', async () => {
    const resize = installResizeObserver()
    const wrapper = mount(MonthBars, { props: { items } })
    expect(wrapper.get('svg').attributes('viewBox')).toBe('0 0 640 220')
    expect(monthLabels(wrapper)).toEqual([
      '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月',
    ])

    resize(326)
    await nextTick()
    expect(wrapper.get('svg').attributes('viewBox')).toBe('0 0 320 200')
    expect(monthLabels(wrapper)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'])
    // 紧凑画布下柱子仍然全部在画布内（列宽是小数，留 1e-6 容差吸收浮点误差）
    const widths = wrapper.findAll('.bar-fill').map((bar) => Number(bar.attributes('x')) + Number(bar.attributes('width')))
    expect(Math.max(...widths)).toBeLessThanOrEqual(320 + 1e-6)

    resize(900)
    await nextTick()
    expect(wrapper.get('svg').attributes('viewBox')).toBe('0 0 640 220')
    expect(monthLabels(wrapper)).toContain('10月')
  })
})
