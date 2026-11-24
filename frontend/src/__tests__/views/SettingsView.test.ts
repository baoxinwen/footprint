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
      info: vi.fn(),
    },
    ElMessageBox: {
      confirm: vi.fn(() => Promise.resolve()),
    },
  }
})

const mockCheckForUpdate = vi.hoisted(() => vi.fn())
const mockApplyUpdate = vi.hoisted(() => vi.fn())
vi.mock('../../pwa/checkForUpdate', () => ({ checkForUpdate: mockCheckForUpdate }))
vi.mock('../../pwa/applyUpdate', () => ({ applyUpdate: mockApplyUpdate }))

/** 安装指引的替身：guide 可从测试里切换，默认「已安装、不显示」 */
const installState = vi.hoisted(() => ({
  guide: 'hidden' as 'native' | 'instructions' | 'ios' | 'hidden',
  promptInstall: vi.fn(),
}))
vi.mock('../../composables/useInstallPrompt', async () => {
  const { computed } = await import('vue')
  return {
    useInstallPrompt: () => ({ guide: computed(() => installState.guide), promptInstall: installState.promptInstall }),
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

  it('copies the absolute share link and self-extinguishes the check after 2.5s', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(SettingsView, {
        global: { stubs: { 'el-icon': true } },
      })
      // loadShares 的 vi.waitFor 依赖真实定时器；改用 flushPromises 轮询
      for (let i = 0; i < 20 && !wrapper.find('[data-testid="copy-share-share-token-1"]').exists(); i++) {
        await vi.advanceTimersByTimeAsync(10)
        await flushPromises()
      }
      expect(wrapper.find('[data-testid="copy-share-share-token-1"]').exists()).toBe(true)

      await wrapper.find('[data-testid="copy-share-share-token-1"]').trigger('click')
      await flushPromises()

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:3000/share/share-token-1')

      // 复制成功：按钮内对勾 + 「已复制」，不弹 toast
      const button = wrapper.find('[data-testid="copy-share-share-token-1"]')
      expect(button.text()).toContain('已复制')
      expect(button.classes()).toContain('is-copied')
      expect(ElMessage.success).not.toHaveBeenCalled()

      // 铁律 10：2.5s 后进入淡出，随后自熄恢复
      await vi.advanceTimersByTimeAsync(2500)
      expect(button.classes()).toContain('is-copied')
      expect(button.find('.is-fading').exists()).toBe(true)

      await vi.advanceTimersByTimeAsync(300)
      expect(button.text()).toContain('复制链接')
      expect(button.classes()).not.toContain('is-copied')
    } finally {
      vi.useRealTimers()
    }
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
      expect(wrapper.text()).toContain('还没有分享链接')
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

  describe('检查更新', () => {
    const mountSettings = () => mount(SettingsView, { global: { stubs: { 'el-icon': true } } })
    const checkButton = (wrapper: ReturnType<typeof mountSettings>) => wrapper.get('.update-check-btn')

    it('已是最新版本时如实告知，不重新加载页面', async () => {
      mockCheckForUpdate.mockResolvedValue('current')
      const wrapper = mountSettings()

      await checkButton(wrapper).trigger('click')
      await flushPromises()

      expect(mockCheckForUpdate).toHaveBeenCalledTimes(1)
      expect(ElMessage.success).toHaveBeenCalledWith('已是最新版本')
      expect(mockApplyUpdate).not.toHaveBeenCalled()
    })

    it('有新版本时直接切换过去——用户是主动来查的，不必再确认一次', async () => {
      mockCheckForUpdate.mockResolvedValue('available')
      const wrapper = mountSettings()

      await checkButton(wrapper).trigger('click')
      await flushPromises()

      expect(mockApplyUpdate).toHaveBeenCalledTimes(1)
      expect(ElMessage.success).not.toHaveBeenCalled()
    })

    it('查询本身失败（如离线）时提示重试，不说成「已是最新」', async () => {
      mockCheckForUpdate.mockResolvedValue('failed')
      const wrapper = mountSettings()

      await checkButton(wrapper).trigger('click')
      await flushPromises()

      expect(ElMessage.error).toHaveBeenCalledWith('检查更新失败，请检查网络后重试')
      expect(ElMessage.success).not.toHaveBeenCalled()
      expect(mockApplyUpdate).not.toHaveBeenCalled()
    })

    it('环境不支持自动更新时说明原因，而不是永远说「已是最新」', async () => {
      mockCheckForUpdate.mockResolvedValue('unsupported')
      const wrapper = mountSettings()

      await checkButton(wrapper).trigger('click')
      await flushPromises()

      expect(ElMessage.info).toHaveBeenCalledWith('当前环境不支持自动更新，请刷新页面获取最新版本')
      expect(ElMessage.success).not.toHaveBeenCalled()
    })

    it('检查期间按钮显示进度并禁用，结束后恢复', async () => {
      let finishCheck!: (result: string) => void
      mockCheckForUpdate.mockImplementation(() => new Promise<string>((resolve) => { finishCheck = resolve }))
      const wrapper = mountSettings()

      await checkButton(wrapper).trigger('click')
      await flushPromises()
      expect(checkButton(wrapper).text()).toBe('检查中…')
      expect(checkButton(wrapper).attributes('disabled')).toBeDefined()

      finishCheck('current')
      await flushPromises()
      expect(checkButton(wrapper).text()).toBe('检查更新')
      expect(checkButton(wrapper).attributes('disabled')).toBeUndefined()
    })
  })

  describe('安装应用', () => {
    const mountSettings = () => mount(SettingsView, { global: { stubs: { 'el-icon': true } } })

    it('浏览器提供原生安装对话框时显示安装按钮，点击后弹出', async () => {
      installState.guide = 'native'
      const wrapper = mountSettings()

      expect(wrapper.get('.install-row .action-desc').text()).toBe('装到桌面或任务栏，以独立窗口打开，看过的内容可以离线查看')
      await wrapper.get('.install-btn').trigger('click')
      expect(installState.promptInstall).toHaveBeenCalledTimes(1)
    })

    it('没有原生对话框时给文字指引，不放一个点了没反应的按钮', () => {
      installState.guide = 'instructions'
      const wrapper = mountSettings()

      expect(wrapper.get('.install-row .action-desc').text()).toBe('在浏览器菜单里选择「安装应用」或「添加到主屏幕」')
      expect(wrapper.find('.install-btn').exists()).toBe(false)
    })

    it('iOS 上给出 Safari 的固定步骤', () => {
      installState.guide = 'ios'
      const wrapper = mountSettings()

      expect(wrapper.get('.install-row .action-desc').text()).toBe('在 Safari 底部点「分享」，再选「添加到主屏幕」')
      expect(wrapper.find('.install-btn').exists()).toBe(false)
    })

    it('已经作为独立应用运行时不显示这一行', () => {
      installState.guide = 'hidden'
      const wrapper = mountSettings()

      expect(wrapper.find('.install-row').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('安装应用')
    })
  })
})
