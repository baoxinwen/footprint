import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import OfflineBanner from '../../components/OfflineBanner.vue'
import { goOffline, goOnline, setOnline } from '../pwa/onlineStatus'

enableAutoUnmount(afterEach)

describe('OfflineBanner', () => {
  beforeEach(() => setOnline(true))
  afterEach(() => setOnline(true))

  it('联网时不渲染任何东西', () => {
    const wrapper = mount(OfflineBanner)
    expect(wrapper.find('.offline-banner').exists()).toBe(false)
  })

  it('加载时已经离线则直接显示，并说明内容来源与限制', () => {
    setOnline(false)
    const wrapper = mount(OfflineBanner)
    expect(wrapper.get('[role="status"]').text()).toBe('当前离线，显示的是已缓存的内容；保存和删除需要联网')
  })

  it('断网时出现，恢复联网后消失', async () => {
    const wrapper = mount(OfflineBanner)

    await goOffline()
    expect(wrapper.find('[role="status"]').exists()).toBe(true)

    await goOnline()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('卸载时移除自己挂上的全部网络监听，不留残余', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')

    mount(OfflineBanner).unmount()

    expect(add.mock.calls.map(([type]) => type)).toEqual(['online', 'offline'])
    expect(remove.mock.calls).toEqual(add.mock.calls)
  })
})
