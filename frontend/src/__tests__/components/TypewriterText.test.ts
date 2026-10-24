import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TypewriterText from '../../components/TypewriterText.vue'

describe('TypewriterText（铁律 4）', () => {
  it('renders every character with staggered animation delays', () => {
    const wrapper = mount(TypewriterText, { props: { text: '旅行足迹' } })
    const chars = wrapper.findAll('.tw-char')
    expect(chars).toHaveLength(4)
    expect(chars[0].attributes('style')).toContain('animation-delay: 0ms')
    expect(chars[2].attributes('style')).toContain('animation-delay: 60ms')
  })

  it('exposes the full text via aria-label and hides animated chars from AT', () => {
    const wrapper = mount(TypewriterText, { props: { text: '旅行足迹' } })
    expect(wrapper.attributes('aria-label')).toBe('旅行足迹')
    expect(wrapper.find('.typewriter-chars').attributes('aria-hidden')).toBe('true')
  })

  it('falls back to plain text under prefers-reduced-motion', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    try {
      const wrapper = mount(TypewriterText, { props: { text: '旅行足迹' } })
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.tw-char').exists()).toBe(false)
      expect(wrapper.text()).toBe('旅行足迹')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('renders plain text when animated is false', () => {
    const wrapper = mount(TypewriterText, { props: { text: '旅行足迹', animated: false } })
    expect(wrapper.find('.tw-char').exists()).toBe(false)
    expect(wrapper.text()).toBe('旅行足迹')
  })
})
