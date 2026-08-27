import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EmptyState from '../../components/EmptyState.vue'

describe('EmptyState', () => {
  it('renders title', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No data' },
    })
    expect(wrapper.text()).toContain('No data')
  })

  it('renders description when provided', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No data', description: 'Create something' },
    })
    expect(wrapper.text()).toContain('Create something')
  })

  it('does not render description when not provided', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No data' },
    })
    expect(wrapper.find('.empty-desc').exists()).toBe(false)
  })

  it('renders a vector icon instead of the icon name as text', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No data', icon: 'calendar' },
      global: { stubs: { ElIcon: { template: '<span class="el-icon"><slot /></span>' } } },
    })
    expect(wrapper.find('.empty-icon .el-icon').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('calendar')
  })

  it('renders action button when actionText provided', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No data', actionText: 'Create' },
    })
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.find('button').text()).toContain('Create')
  })

  it('emits action event when button clicked', async () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No data', actionText: 'Create' },
    })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('action')).toHaveLength(1)
  })

  it('does not render button when actionText not provided', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No data' },
    })
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
