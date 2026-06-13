import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Mock router
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  createRouter: vi.fn(() => ({ beforeEach: vi.fn() })),
  createWebHistory: vi.fn(),
}))

// Mock API
vi.mock('../../api/auth', () => ({
  loginApi: vi.fn(),
  registerApi: vi.fn(),
}))

// Mock Element Plus message
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

import LoginView from '../../views/LoginView.vue'

describe('LoginView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders login form by default', () => {
    const wrapper = mount(LoginView, {
      global: { stubs: { ElMessage: true } },
    })
    expect(wrapper.text()).toContain('登录')
  })

  it('has username and password inputs', () => {
    const wrapper = mount(LoginView, {
      global: { stubs: { ElMessage: true } },
    })
    const inputs = wrapper.findAll('input')
    expect(inputs.length).toBeGreaterThanOrEqual(2)
  })

  it('has a submit button', () => {
    const wrapper = mount(LoginView, {
      global: { stubs: { ElMessage: true } },
    })
    const buttons = wrapper.findAll('button')
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  })
})
