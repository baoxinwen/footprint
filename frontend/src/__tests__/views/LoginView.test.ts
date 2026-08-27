import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// Mock router
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  createRouter: vi.fn(() => ({ beforeEach: vi.fn() })),
  createWebHistory: vi.fn(),
}))

vi.mock('../../router', () => ({
  default: { push: vi.fn() },
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

  it('exposes the home coordinate easter egg linking to an AMap marker for Guoyuan Road', () => {
    const wrapper = mount(LoginView, {
      global: { stubs: { ElMessage: true } },
    })
    const link = wrapper.find('a.field-coordinate')
    expect(link.exists()).toBe(true)
    expect(link.text()).toBe('32.0983 N · 118.2732 E')

    const href = link.attributes('href') ?? ''
    expect(href).toContain('https://uri.amap.com/marker?')
    expect(href).toContain('position=118.273211,32.098298')
    expect(href).toContain(encodeURIComponent('果园路'))
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
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

  it('exposes accessible tabs and labelled fields', () => {
    const wrapper = mount(LoginView, {
      global: { stubs: { ElMessage: true } },
    })

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].attributes('aria-selected')).toBe('true')
    expect(wrapper.get('label[for="login-username"]').exists()).toBe(true)
    expect(wrapper.get('#login-username').attributes('name')).toBe('username')
    expect(wrapper.get('label[for="login-password"]').exists()).toBe(true)
  })

  it('supports roving focus and standard tablist keyboard navigation', async () => {
    const wrapper = mount(LoginView, {
      attachTo: document.body,
      global: { stubs: { ElMessage: true } },
    })
    const tabs = wrapper.findAll<HTMLButtonElement>('[role="tab"]')

    expect(tabs[0].attributes('tabindex')).toBe('0')
    expect(tabs[1].attributes('tabindex')).toBe('-1')

    tabs[0].element.focus()
    await tabs[0].trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(tabs[1].attributes('aria-selected')).toBe('true')
    expect(tabs[1].attributes('tabindex')).toBe('0')
    expect(document.activeElement).toBe(tabs[1].element)
    expect(wrapper.get('[role="tabpanel"]').attributes('aria-labelledby')).toBe('register-tab')

    await tabs[1].trigger('keydown', { key: 'ArrowLeft' })
    await nextTick()
    expect(document.activeElement).toBe(tabs[0].element)

    await tabs[0].trigger('keydown', { key: 'End' })
    await nextTick()
    expect(document.activeElement).toBe(tabs[1].element)

    await tabs[1].trigger('keydown', { key: 'Home' })
    await nextTick()
    expect(document.activeElement).toBe(tabs[0].element)

    wrapper.unmount()
  })
})
