import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UpdatePrompt from '../../components/UpdatePrompt.vue'

const BUTTONS = ['稍后', '立即刷新']

describe('UpdatePrompt', () => {
  it('没有新版本时不渲染', () => {
    const wrapper = mount(UpdatePrompt, { props: { needRefresh: false } })
    expect(wrapper.find('.update-prompt').exists()).toBe(false)
  })

  it('有新版本时提示，并给出两个原生按钮', () => {
    const wrapper = mount(UpdatePrompt, { props: { needRefresh: true } })
    expect(wrapper.get('[role="status"]').text()).toContain('有新版本可用')
    expect(wrapper.findAll('button').map((button) => button.text())).toEqual(BUTTONS)
  })

  it('点「立即刷新」发出 refresh', async () => {
    const wrapper = mount(UpdatePrompt, { props: { needRefresh: true } })
    await wrapper.findAll('button')[1].trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(wrapper.emitted('dismiss')).toBeUndefined()
  })

  it('点「稍后」收起提示并发出了 dismiss；这一版内不再出现', async () => {
    const wrapper = mount(UpdatePrompt, { props: { needRefresh: true } })

    await wrapper.findAll('button')[0].trigger('click')

    expect(wrapper.emitted('dismiss')).toHaveLength(1)
    expect(wrapper.find('.update-prompt').exists()).toBe(false)
    await wrapper.setProps({ needRefresh: false })
    await wrapper.setProps({ needRefresh: true })
    expect(wrapper.find('.update-prompt').exists()).toBe(true)
  })
})
