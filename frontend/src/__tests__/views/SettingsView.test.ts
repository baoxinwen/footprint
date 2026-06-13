import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  createRouter: vi.fn(() => ({ beforeEach: vi.fn() })),
  createWebHistory: vi.fn(),
}))

vi.mock('../../api/auth', () => ({
  changePassword: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
    },
  }
})

import SettingsView from '../../views/SettingsView.vue'

describe('SettingsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders settings page', () => {
    const wrapper = mount(SettingsView, {
      global: { stubs: { 'el-icon': true } },
    })
    expect(wrapper.text()).toContain('设置')
  })

  it('has password change form', () => {
    const wrapper = mount(SettingsView, {
      global: { stubs: { 'el-icon': true } },
    })
    expect(wrapper.text()).toContain('密码')
  })
})
