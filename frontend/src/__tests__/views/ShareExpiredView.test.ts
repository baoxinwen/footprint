import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Mock router
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({}),
  createRouter: vi.fn(() => ({ beforeEach: vi.fn() })),
  createWebHistory: vi.fn(),
}))

import ShareExpiredView from '../../views/ShareExpiredView.vue'

describe('ShareExpiredView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders expired message', () => {
    const wrapper = mount(ShareExpiredView, {
      global: { stubs: { ElButton: true } },
    })
    expect(wrapper.text()).toContain('该分享链接已过期')
  })

  it('renders help text', () => {
    const wrapper = mount(ShareExpiredView, {
      global: { stubs: { ElButton: true } },
    })
    expect(wrapper.text()).toContain('分享链接已超过有效期')
  })

  it('renders back to home button', () => {
    const wrapper = mount(ShareExpiredView, {
      global: { stubs: { ElButton: { template: '<button><slot /></button>' } } },
    })
    expect(wrapper.text()).toContain('返回首页')
  })

  it('uses a decorative vector icon instead of emoji', () => {
    const wrapper = mount(ShareExpiredView, {
      global: {
        stubs: {
          ElButton: true,
          ElIcon: { template: '<i class="el-icon"><slot /></i>' },
          Link: true,
        },
      },
    })
    expect(wrapper.find('.expired-icon .el-icon').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('🔗')
  })
})
