import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
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

vi.mock('../../api/request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('../../api/shares', () => ({
  getShares: vi.fn(),
  rotateShare: vi.fn(),
  revokeShare: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    },
    ElMessageBox: {
      confirm: vi.fn(() => Promise.resolve()),
    },
  }
})

import request from '../../api/request'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getShares, revokeShare, rotateShare } from '../../api/shares'
import SettingsView from '../../views/SettingsView.vue'

const accountResponse = {
  data: { id: 1, username: 'traveler', created_at: '2025-01-01T00:00:00' },
}

const shareResponse = {
  token: 'share-token-1',
  url: '/share/share-token-1',
  expires_at: '2025-11-01T00:00:00',
  trip_id: 12,
  trip_title: '北京秋日',
  created_at: '2025-10-01T00:00:00',
}

describe('SettingsView', () => {
  it('renders imported action icons without unresolved custom elements', async () => {
    const wrapper = mount(SettingsView)
    await flushPromises()

    for (const tag of [
      'link',
      'copydocument',
      'refreshright',
      'document',
      'folderopened',
      'upload',
    ]) {
      expect(wrapper.find(tag).exists()).toBe(false)
    }
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(request.get).mockResolvedValue(accountResponse)
    vi.mocked(getShares).mockResolvedValue({ data: [shareResponse] } as any)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(() => Promise.resolve()) },
    })
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

  it('exposes theme choices as a native radio group', async () => {
    const wrapper = mount(SettingsView, {
      global: { stubs: { 'el-icon': true } },
    })
    const options = wrapper.findAll('.theme-option')
    const radios = wrapper.findAll<HTMLInputElement>('input[type="radio"][name="theme"]')

    expect(options).toHaveLength(3)
    expect(options.every(option => option.element.tagName === 'LABEL')).toBe(true)
    expect(radios.map(radio => radio.attributes('value'))).toEqual(['auto', 'light', 'dark'])
    expect(radios.filter(radio => radio.element.checked)).toHaveLength(1)

    await radios[2].setValue()
    expect(radios[2].element.checked).toBe(true)
    expect(options[2].classes()).toContain('active')
  })

  it('lists active share links with their expiry date', async () => {
    const wrapper = mount(SettingsView, {
      global: { stubs: { 'el-icon': true } },
    })

    await vi.waitFor(() => {
      expect(getShares).toHaveBeenCalledOnce()
      expect(wrapper.text()).toContain('分享链接')
      expect(wrapper.text()).toContain('北京秋日')
      expect(wrapper.text()).toContain('2025')
    })
  })

  it('copies the absolute share link', async () => {
    const wrapper = mount(SettingsView, {
      global: { stubs: { 'el-icon': true } },
    })
    await vi.waitFor(() => expect(wrapper.find('[data-testid="copy-share-share-token-1"]').exists()).toBe(true))

    await wrapper.find('[data-testid="copy-share-share-token-1"]').trigger('click')

    await vi.waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:3000/share/share-token-1')
      expect(ElMessage.success).toHaveBeenCalledWith('分享链接已复制')
    })
  })

  it('rotates a share after confirmation and displays the replacement', async () => {
    vi.mocked(rotateShare).mockResolvedValue({
      data: { ...shareResponse, token: 'share-token-2', url: '/share/share-token-2' },
    } as any)
    const wrapper = mount(SettingsView, {
      global: { stubs: { 'el-icon': true } },
    })
    await vi.waitFor(() => expect(wrapper.find('[data-testid="rotate-share-share-token-1"]').exists()).toBe(true))

    await wrapper.find('[data-testid="rotate-share-share-token-1"]').trigger('click')

    await vi.waitFor(() => {
      expect(ElMessageBox.confirm).toHaveBeenCalled()
      expect(rotateShare).toHaveBeenCalledWith(12)
      expect(wrapper.find('[data-testid="copy-share-share-token-2"]').exists()).toBe(true)
      expect(ElMessage.success).toHaveBeenCalledWith('分享链接已轮换，旧链接立即失效')
    })
  })

  it('revokes a share after confirmation and removes it from the list', async () => {
    vi.mocked(revokeShare).mockResolvedValue({ data: { message: 'ok' } } as any)
    const wrapper = mount(SettingsView, {
      global: { stubs: { 'el-icon': true } },
    })
    await vi.waitFor(() => expect(wrapper.find('[data-testid="revoke-share-share-token-1"]').exists()).toBe(true))

    await wrapper.find('[data-testid="revoke-share-share-token-1"]').trigger('click')

    await vi.waitFor(() => {
      expect(revokeShare).toHaveBeenCalledWith('share-token-1')
      expect(wrapper.text()).toContain('暂无有效的分享链接')
      expect(ElMessage.success).toHaveBeenCalledWith('分享链接已撤销')
    })
  })

  it('shows an inline retry action when share links fail to load', async () => {
    vi.mocked(getShares).mockRejectedValue(new Error('network error'))
    const wrapper = mount(SettingsView, {
      global: { stubs: { 'el-icon': true } },
    })

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('分享链接加载失败')
      expect(wrapper.find('[data-testid="retry-shares"]').exists()).toBe(true)
    })
  })
})
